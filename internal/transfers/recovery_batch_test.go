package transfers

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/files"
)

func TestCollectBatchRecoveryAtWriteBoundaries(t *testing.T) {
	for _, stage := range []string{"before-journal", "journal-only", "partial-files", "all-files-before-commit", "committed"} {
		t.Run(stage, func(t *testing.T) {
			service, capSvc, carrier, store, owner := newTransfersFixture(t)
			collection, code, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
			if err != nil {
				t.Fatal(err)
			}
			token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
			if err != nil {
				t.Fatal(err)
			}
			// 已提交的其他批次和普通文件必须在每种恢复状态下保持原样。
			kept, err := service.SubmitToCollection(collection.PublicKey, token, "kept", "", []IncomingSubmissionFile{{RelativePath: "kept.txt", Body: strings.NewReader("KEEP")}})
			if err != nil {
				t.Fatal(err)
			}
			ordinary := filepath.Join(carrier.RootPath, "ordinary.txt")
			if err := os.WriteFile(ordinary, []byte("ORDINARY"), 0o600); err != nil {
				t.Fatal(err)
			}

			var submissionID int64
			if stage == "committed" {
				sub, err := service.SubmitToCollection(collection.PublicKey, token, "batch", "", []IncomingSubmissionFile{
					{RelativePath: "nested/a.txt", Body: strings.NewReader("AAA")},
					{RelativePath: "b.txt", Body: strings.NewReader("BBBB")},
				})
				if err != nil {
					t.Fatal(err)
				}
				submissionID = sub.ID
			} else {
				result, err := service.db.Exec(`INSERT INTO transfer_submissions (collection_id, created_at) VALUES (?, ?)`, collection.ID, time.Now().UTC())
				if err != nil {
					t.Fatal(err)
				}
				submissionID, _ = result.LastInsertId()
			}
			batchRel := collectPayloadRel(collection.PublicKey, submissionID, "")
			op := service.newUploadOperation("submission-batch", carrier.ID, 0, submissionID, batchRel)
			op.CollectionID = collection.ID
			if stage != "before-journal" {
				if err := service.writeUploadOperation(op); err != nil {
					t.Fatal(err)
				}
			}
			if stage == "partial-files" || stage == "all-files-before-commit" {
				if _, err := service.files.WriteManagedFile(carrier, batchRel+"/nested/a.txt", ManagedScopeDir, strings.NewReader("AAA"), 0, false); err != nil {
					t.Fatal(err)
				}
				if stage == "all-files-before-commit" {
					if _, err := service.files.WriteManagedFile(carrier, batchRel+"/b.txt", ManagedScopeDir, strings.NewReader("BBBB"), 0, false); err != nil {
						t.Fatal(err)
					}
				} else if err := os.WriteFile(filepath.Join(carrier.RootPath, filepath.FromSlash(batchRel), ".omnistore-upload-0123456789abcdef.tmp"), []byte("PARTIAL"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			// 站点已重绑到另一个源，恢复仍须跟随任务创建时的来源。
			if _, err := capSvc.UpdateBinding(capabilities.CapabilityTransferCenter, capabilities.UpdateInput{StorageSourceKey: &store.Key}); err != nil {
				t.Fatal(err)
			}
			if _, err := service.RecoverUploadOperations(); err != nil {
				t.Fatal(err)
			}
			if _, err := service.RecoverUploadOperations(); err != nil {
				t.Fatalf("second recovery: %v", err)
			}
			var count int
			if err := service.db.QueryRow(`SELECT COUNT(*) FROM transfer_submissions WHERE id = ?`, submissionID).Scan(&count); err != nil {
				t.Fatal(err)
			}
			wantFiles, wantBytes := int64(1), int64(4)
			if stage == "committed" {
				wantFiles, wantBytes = 3, 11
				if count != 1 {
					t.Fatal("committed batch was removed")
				}
				assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(batchRel), "nested/a.txt"), "AAA")
				assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(batchRel), "b.txt"), "BBBB")
			} else {
				if count != 0 {
					t.Fatal("empty submission survived recovery")
				}
				if _, err := os.Stat(filepath.Join(carrier.RootPath, filepath.FromSlash(batchRel))); !os.IsNotExist(err) {
					t.Fatalf("uncommitted batch survived: %v", err)
				}
			}
			current, err := service.GetCollection(collection.ID, owner)
			if err != nil || current.TotalFiles != wantFiles || current.TotalSize != wantBytes {
				t.Fatalf("collection totals=%+v error=%v", current, err)
			}
			assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, kept.ID, "kept.txt"))), "KEEP")
			assertTransferContent(t, ordinary, "ORDINARY")
			assertNoTransferJournals(t, service)
		})
	}
}

type failingSubmissionReader struct {
	check func()
}

func (r failingSubmissionReader) Read([]byte) (int, error) {
	r.check()
	return 0, io.ErrUnexpectedEOF
}

func TestCollectBatchJournalPrecedesWritesAndRollsBackPartialFailure(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	collection, code, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	var batchRel string
	_, err = service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
		{RelativePath: "nested/a.txt", Body: strings.NewReader("FIRST")},
		{RelativePath: "b.txt", Body: failingSubmissionReader{check: func() {
			entries, err := os.ReadDir(service.uploadOperationsDir())
			if err != nil || len(entries) != 1 {
				t.Fatalf("journal absent while writing second file: %v %v", entries, err)
			}
			handle, err := os.Open(filepath.Join(service.uploadOperationsDir(), entries[0].Name()))
			if err != nil {
				t.Fatal(err)
			}
			op, err := decodeUploadOperation(handle)
			handle.Close()
			if err != nil || op.Kind != "submission-batch" || op.CollectionID != collection.ID {
				t.Fatalf("batch journal=%+v error=%v", op, err)
			}
			batchRel = op.FinalRelPath
			assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(batchRel), "nested/a.txt"), "FIRST")
			inbox, err := service.ListSubmissions(collection.ID, owner)
			if err != nil || len(inbox) != 0 {
				t.Fatalf("pending submission visible in inbox: %+v error=%v", inbox, err)
			}
		}}},
	})
	if !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("submission error=%v", err)
	}
	if _, err := os.Stat(filepath.Join(carrier.RootPath, filepath.FromSlash(batchRel))); !os.IsNotExist(err) {
		t.Fatalf("partial files survived rollback: %v", err)
	}
	assertNoTransferJournals(t, service)
	if _, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{{RelativePath: "retry.txt", Body: strings.NewReader("RETRY")}}); err != nil {
		t.Fatalf("retry after failure: %v", err)
	}
	inbox, err := service.ListSubmissions(collection.ID, owner)
	if err != nil || len(inbox) != 1 || inbox[0].TotalSize != 5 {
		t.Fatalf("inbox after retry=%+v error=%v", inbox, err)
	}
}

func TestRecoveryRejectsMismatchedBatchOwnershipWithoutDeletingPayload(t *testing.T) {
	for _, mismatch := range []string{"source", "collection", "submission", "ordinary-path", "inconsistent-ledger", "journal-name"} {
		t.Run(mismatch, func(t *testing.T) {
			service, _, carrier, store, owner := newTransfersFixture(t)
			collection, code, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
			if err != nil {
				t.Fatal(err)
			}
			token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
			if err != nil {
				t.Fatal(err)
			}
			sub, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{{RelativePath: "keep.txt", Body: strings.NewReader("KEEP")}})
			if err != nil {
				t.Fatal(err)
			}
			op := service.newUploadOperation("submission-batch", carrier.ID, 0, sub.ID, collectPayloadRel(collection.PublicKey, sub.ID, ""))
			op.CollectionID = collection.ID
			switch mismatch {
			case "source":
				op.StorageSourceID = store.ID
			case "collection":
				other, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
				if err != nil {
					t.Fatal(err)
				}
				op.CollectionID = other.ID
			case "submission":
				op.SubmissionID++
			case "ordinary-path":
				op.FinalRelPath = "ordinary.txt"
			case "inconsistent-ledger":
				if _, err := service.db.Exec(`UPDATE transfer_submissions SET file_count = 0 WHERE id = ?`, sub.ID); err != nil {
					t.Fatal(err)
				}
			}
			if err := service.writeUploadOperation(op); err != nil {
				t.Fatal(err)
			}
			journal := service.uploadOperationPath(op.OperationID)
			if mismatch == "journal-name" {
				changed := journal + ".other.json"
				if err := os.Rename(journal, changed); err != nil {
					t.Fatal(err)
				}
				journal = changed
			}
			if _, err := service.RecoverUploadOperations(); err == nil {
				t.Fatal("invalid journal was accepted")
			}
			assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, sub.ID, "keep.txt"))), "KEEP")
			if _, err := os.Stat(journal); err != nil {
				t.Fatalf("failed recovery discarded its journal: %v", err)
			}
		})
	}
}

func TestRecoverSendRemovesOnlyJournaledTemporaryFile(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUpload(send.ID, owner, "keep.txt", strings.NewReader("KEEP")); err != nil {
		t.Fatal(err)
	}
	op := service.newUploadOperation("send-file", carrier.ID, send.ID, 0, sendPayloadRel(send.PublicKey, "unfinished.txt"))
	op.TempRelPath = sendPayloadRel(send.PublicKey, ".omnistore-upload-0123456789abcdef.tmp")
	if err := service.writeUploadOperation(op); err != nil {
		t.Fatal(err)
	}
	tmp := filepath.Join(carrier.RootPath, filepath.FromSlash(op.TempRelPath))
	unowned := filepath.Join(filepath.Dir(tmp), ".omnistore-upload-fedcba9876543210.tmp")
	for path, contents := range map[string]string{tmp: "PARTIAL", unowned: "UNOWNED"} {
		if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := service.RecoverUploadOperations(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Fatalf("journaled temp survived recovery: %v", err)
	}
	assertTransferContent(t, unowned, "UNOWNED")
	assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(sendPayloadRel(send.PublicKey, "keep.txt"))), "KEEP")
	assertNoTransferJournals(t, service)
}

func assertTransferContent(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil || string(got) != want {
		t.Fatalf("content %s=%q error=%v; want=%q", path, got, err, want)
	}
}

func assertNoTransferJournals(t *testing.T, service *Service) {
	t.Helper()
	entries, err := os.ReadDir(service.uploadOperationsDir())
	if err != nil || len(entries) != 0 {
		t.Fatalf("transfer journal residue=%v error=%v", entries, err)
	}
}

func TestCollectFailedCleanupRetainsJournalUntilManagedRootIsRestored(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	collection, code, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(carrier.RootPath, ".omnistore", "managed-root.json")
	original, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
		{RelativePath: "a.txt", Body: strings.NewReader("FIRST")},
		{RelativePath: "b.txt", Body: failingSubmissionReader{check: func() {
			if err := os.WriteFile(marker, []byte(`{"version":1,"instance_id":"other-instance","storage_source_id":1,"nonce":"foreign"}`), 0o600); err != nil {
				t.Fatal(err)
			}
		}}},
	})
	if !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("submission error=%v", err)
	}
	entries, err := os.ReadDir(service.uploadOperationsDir())
	if err != nil || len(entries) != 1 {
		t.Fatalf("failed cleanup lost journal: %v %v", entries, err)
	}
	var submissionID int64
	if err := service.db.QueryRow(`SELECT id FROM transfer_submissions WHERE collection_id = ?`, collection.ID).Scan(&submissionID); err != nil {
		t.Fatal(err)
	}
	payload := filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, submissionID, "a.txt")))
	assertTransferContent(t, payload, "FIRST")
	if _, err := service.RecoverUploadOperations(); err == nil {
		t.Fatal("recovery accepted foreign root")
	}
	assertTransferContent(t, payload, "FIRST")
	if err := os.WriteFile(marker, original, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecoverUploadOperations(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(payload); !os.IsNotExist(err) {
		t.Fatalf("payload survived completed rollback: %v", err)
	}
	assertNoTransferJournals(t, service)
}

func TestSendRecoveryRejectsForeignManagedRootAndUnrelatedTemp(t *testing.T) {
	for _, mismatch := range []string{"managed-root", "temporary-path", "source", "task-path"} {
		t.Run(mismatch, func(t *testing.T) {
			service, _, carrier, store, owner := newTransfersFixture(t)
			send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
			if err != nil {
				t.Fatal(err)
			}
			final := sendPayloadRel(send.PublicKey, "uncommitted.txt")
			if _, err := service.files.WriteManagedFile(carrier, final, ManagedScopeDir, strings.NewReader("KEEP"), 0, false); err != nil {
				t.Fatal(err)
			}
			op := service.newUploadOperation("send-file", carrier.ID, send.ID, 0, final)
			switch mismatch {
			case "managed-root":
				if err := os.WriteFile(filepath.Join(carrier.RootPath, ".omnistore", "managed-root.json"), []byte(`{}`), 0o600); err != nil {
					t.Fatal(err)
				}
			case "temporary-path":
				op.TempRelPath = ".omnistore/transfer/send/other/.omnistore-upload-0123456789abcdef.tmp"
			case "source":
				op.StorageSourceID = store.ID
			case "task-path":
				other, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
				if err != nil {
					t.Fatal(err)
				}
				op.TransferID = other.ID
			}
			if err := service.writeUploadOperation(op); err != nil {
				t.Fatal(err)
			}
			if _, err := service.RecoverUploadOperations(); err == nil {
				t.Fatal("recovery accepted mismatched send journal")
			}
			assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(final)), "KEEP")
			if _, err := os.Stat(service.uploadOperationPath(op.OperationID)); err != nil {
				t.Fatalf("failed recovery discarded journal: %v", err)
			}
		})
	}
}

func TestGCPreservesUnprovenTemporaryFilesAndSubmissionDirectories(t *testing.T) {
	service, _, carrier, other, owner := newTransfersFixture(t)
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	paths := []string{
		filepath.Join(carrier.RootPath, filepath.FromSlash(sendPayloadRel(send.PublicKey, ".omnistore-upload-0123456789abcdef.tmp"))),
		filepath.Join(carrier.RootPath, ".omnistore", "transfer", "send", "unknown", ".omnistore-upload-fedcba9876543210.tmp"),
		filepath.Join(other.RootPath, ".omnistore", "transfer", "send", "unknown", ".omnistore-upload-fedcba9876543210.tmp"),
		filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, 999999, "unknown.txt"))),
	}
	old := time.Now().UTC().Add(-2 * orphanDirAfter)
	for _, path := range paths {
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("UNPROVEN"), 0o600); err != nil {
			t.Fatal(err)
		}
		for _, entry := range []string{path, filepath.Dir(path)} {
			if err := os.Chtimes(entry, old, old); err != nil {
				t.Fatal(err)
			}
		}
	}
	result, err := service.RunGC(time.Now())
	if err != nil || result.OrphanTempRemoved != 0 || result.OrphanDirsRemoved != 0 {
		t.Fatalf("GC=%+v error=%v", result, err)
	}
	for _, path := range paths {
		assertTransferContent(t, path, "UNPROVEN")
	}
	if _, err := os.Stat(filepath.Join(other.RootPath, ".omnistore", "managed-root.json")); !os.IsNotExist(err) {
		t.Fatalf("GC adopted unrelated root: %v", err)
	}
}

func TestGCLeavesActiveCollectBatchUntilItsTransactionCommits(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	collection, code, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	started, resume := make(chan struct{}, 1), make(chan struct{})
	result := make(chan error, 1)
	go func() {
		_, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
			{RelativePath: "a.txt", Body: strings.NewReader("FIRST")},
			{RelativePath: "b.txt", Body: &blockedSubmissionReader{reader: strings.NewReader("SECOND"), started: started, resume: resume}},
		})
		result <- err
	}()
	defer close(resume)
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("upload did not reach its second file")
	}
	var submissionID int64
	if err := service.db.QueryRow(`SELECT id FROM transfer_submissions WHERE collection_id = ?`, collection.ID).Scan(&submissionID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`UPDATE transfer_submissions SET created_at = ? WHERE id = ?`, time.Now().UTC().Add(-2*orphanDirAfter), submissionID); err != nil {
		t.Fatal(err)
	}
	gc, err := service.RunGC(time.Now())
	if err != nil || gc.EmptySubmissions != 0 {
		t.Fatalf("GC removed active batch: %+v %v", gc, err)
	}
	assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, submissionID, "a.txt"))), "FIRST")
	resume <- struct{}{}
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("upload after GC: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("upload blocked after GC")
	}
	assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, submissionID, "b.txt"))), "SECOND")
	assertNoTransferJournals(t, service)
}

func TestGCDoesNotDeleteTaskIdentityWhileItsCommittedJournalRemains(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.AddSendUpload(send.ID, owner, "payload.txt", strings.NewReader("KEEP")); err != nil {
		t.Fatal(err)
	}
	op := service.newUploadOperation("send-file", carrier.ID, send.ID, 0, sendPayloadRel(send.PublicKey, "payload.txt"))
	if err := service.writeUploadOperation(op); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`UPDATE transfers SET updated_at = ?, expires_at = NULL WHERE id = ?`, time.Now().UTC().Add(-2*draftStaleAfter), send.ID); err != nil {
		t.Fatal(err)
	}
	gc, err := service.RunGC(time.Now())
	if err != nil || gc.DraftsRemoved != 0 {
		t.Fatalf("GC discarded journal identity: %+v %v", gc, err)
	}
	if _, err := service.GetSend(send.ID, owner); err != nil {
		t.Fatalf("task identity was lost: %v", err)
	}
	if _, err := service.RecoverUploadOperations(); err != nil {
		t.Fatalf("restart after GC: %v", err)
	}
	assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(op.FinalRelPath)), "KEEP")
	gc, err = service.RunGC(time.Now())
	if err != nil || gc.DraftsRemoved != 1 {
		t.Fatalf("GC after journal recovery: %+v %v", gc, err)
	}
	if _, err := service.RecoverUploadOperations(); err != nil {
		t.Fatalf("second restart: %v", err)
	}
	assertNoTransferJournals(t, service)
}

func TestClosedCollectionSurvivesGCUntilItsExpiry(t *testing.T) {
	service, _, carrier, store, owner := newTransfersFixture(t)
	hours := int64(1)
	collection, code, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner, ExpiresInHours: &hours})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	sub, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{{RelativePath: "a.txt", Body: strings.NewReader("KEEP")}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SaveSubmissionToFiles(collection.ID, owner, sub.ID, store.Key, "saved"); err != nil {
		t.Fatal(err)
	}
	if err := service.SetSettings(Settings{ActiveQuotaBytes: 4}); err != nil {
		t.Fatal(err)
	}
	if err := service.CloseCollection(collection.ID, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RunGC(time.Now()); err != nil {
		t.Fatal(err)
	}
	payload := filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, sub.ID, "a.txt")))
	assertTransferContent(t, payload, "KEEP")
	if remaining, unlimited, err := service.activeQuotaRemaining(); err != nil || unlimited || remaining != 0 {
		t.Fatalf("closed collection released quota: remaining=%d unlimited=%v error=%v", remaining, unlimited, err)
	}
	if count, err := service.SourceActiveTaskCount(carrier.ID); err != nil || count != 1 {
		t.Fatalf("closed collection lost source guard: count=%d error=%v", count, err)
	}
	tx, err := service.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	quotaErr := checkTransferWrite(tx, 0, 1)
	tx.Rollback()
	if !errors.Is(quotaErr, ErrQuotaExceeded) {
		t.Fatalf("transaction ignored closed collection usage: %v", quotaErr)
	}
	if _, err := service.db.Exec(`UPDATE transfer_collections SET expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-time.Second), collection.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RunGC(time.Now()); err != nil {
		t.Fatal(err)
	}
	current, err := service.GetCollection(collection.ID, owner)
	if err != nil || current.Status != "expired" {
		t.Fatalf("closed collection expiry=%+v error=%v", current, err)
	}
	if _, err := os.Stat(payload); !os.IsNotExist(err) {
		t.Fatalf("expired collection payload survived: %v", err)
	}
	if remaining, unlimited, err := service.activeQuotaRemaining(); err != nil || unlimited || remaining != 4 {
		t.Fatalf("expired collection retained quota: remaining=%d unlimited=%v error=%v", remaining, unlimited, err)
	}
	if count, err := service.SourceActiveTaskCount(carrier.ID); err != nil || count != 0 {
		t.Fatalf("expired collection retained source guard: count=%d error=%v", count, err)
	}
	assertTransferContent(t, filepath.Join(store.RootPath, "saved", "a.txt"), "KEEP")
}

func TestClosedGuestCollectionRetainsGuestPayloadQuota(t *testing.T) {
	service, _, _, _, _ := newTransfersFixture(t)
	guest, _, err := service.CreateGuestIdentity(time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	collection, code, err := service.CreateCollection(CreateCollectionInput{OwnerGuestID: guest.ID})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{{RelativePath: "a.txt", Body: strings.NewReader("KEEP")}}); err != nil {
		t.Fatal(err)
	}
	if err := service.CloseCollectionForOwner(collection.ID, Owner{GuestID: guest.ID}); err != nil {
		t.Fatal(err)
	}
	if remaining, err := service.guestQuotaRemaining(guest.ID); err != nil || remaining != GuestActiveQuotaBytes-4 {
		t.Fatalf("closed collection released guest quota: %d %v", remaining, err)
	}
	tx, err := service.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	quotaErr := checkTransferWrite(tx, guest.ID, GuestActiveQuotaBytes-3)
	tx.Rollback()
	if !errors.Is(quotaErr, ErrQuotaExceeded) {
		t.Fatalf("transaction ignored retained guest payload: %v", quotaErr)
	}
	if _, err := service.db.Exec(`UPDATE transfer_collections SET expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-time.Second), collection.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RunGC(time.Now()); err != nil {
		t.Fatal(err)
	}
	if remaining, err := service.guestQuotaRemaining(guest.ID); err != nil || remaining != GuestActiveQuotaBytes {
		t.Fatalf("expired collection retained guest quota: %d %v", remaining, err)
	}
}

func TestConcurrentSendSamePathKeepsWinningPayloadAndLedger(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	started, resume := make(chan struct{}, 1), make(chan struct{})
	first, second := make(chan error, 1), make(chan error, 1)
	go func() {
		_, err := service.AddSendUpload(send.ID, owner, "same.txt", &blockedSubmissionReader{reader: strings.NewReader("FIRST"), started: started, resume: resume})
		first <- err
	}()
	defer close(resume)
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("first upload did not start")
	}
	secondStarted := make(chan struct{})
	go func() {
		close(secondStarted)
		_, err := service.AddSendUpload(send.ID, owner, "same.txt", strings.NewReader("SECOND-LONGER"))
		second <- err
	}()
	<-secondStarted
	resume <- struct{}{}
	for i, result := range []<-chan error{first, second} {
		select {
		case err := <-result:
			if (i == 0 && err != nil) || (i == 1 && !errors.Is(err, files.ErrAlreadyExists)) {
				t.Fatalf("upload %d error=%v", i, err)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("upload %d did not finish", i)
		}
	}
	assertTransferContent(t, filepath.Join(carrier.RootPath, filepath.FromSlash(sendPayloadRel(send.PublicKey, "same.txt"))), "FIRST")
	current, err := service.GetSend(send.ID, owner)
	if err != nil || current.TotalFiles != 1 || current.TotalSize != 5 {
		t.Fatalf("winning ledger=%+v error=%v", current, err)
	}
	assertNoTransferJournals(t, service)
}
