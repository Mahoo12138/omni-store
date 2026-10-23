package transfers

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/managedroot"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/users"
)

func TestTransferAccessRequirements(t *testing.T) {
	required, optional := true, false
	for _, tc := range []struct {
		name        string
		requireCode *bool
		password    string
		wantCode    bool
	}{
		{name: "legacy-default", wantCode: true},
		{name: "explicit-code", requireCode: &required, wantCode: true},
		{name: "link", requireCode: &optional},
		{name: "link-with-password", requireCode: &optional, password: "access-password"},
		{name: "code-with-password", requireCode: &required, password: "access-password", wantCode: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			service, _, _, _, owner := newTransfersFixture(t)
			send, pickupCode, err := service.CreateSend(CreateSendInput{
				OwnerUserID: owner, RequireCode: tc.requireCode, Password: tc.password,
				MaxDownloads: &[]int64{1}[0],
			})
			if err != nil {
				t.Fatal(err)
			}
			collection, code, err := service.CreateCollection(CreateCollectionInput{
				OwnerUserID: owner, RequireCode: tc.requireCode, Password: tc.password,
			})
			if err != nil {
				t.Fatal(err)
			}
			if send.RequireCode != tc.wantCode || collection.RequireCode != tc.wantCode ||
				(pickupCode != "") != tc.wantCode || (code != "") != tc.wantCode {
				t.Fatalf("code requirements: send=%+v collection=%+v pickup=%q code=%q", send, collection, pickupCode, code)
			}
			if _, err := service.AddSendUpload(send.ID, owner, "nested/file.txt", strings.NewReader("send bytes")); err != nil {
				t.Fatal(err)
			}
			if _, err := service.FinalizeSend(send.ID, owner); err != nil {
				t.Fatal(err)
			}
			sendInfo, err := service.LookupSend(send.PublicKey)
			if err != nil || sendInfo.RequireCode != tc.wantCode || sendInfo.HasPassword != (tc.password != "") {
				t.Fatalf("public send=%+v err=%v", sendInfo, err)
			}
			collectionInfo, err := service.LookupCollection(collection.PublicKey)
			if err != nil || collectionInfo.RequireCode != tc.wantCode || collectionInfo.HasPassword != (tc.password != "") {
				t.Fatalf("public collection=%+v err=%v", collectionInfo, err)
			}
			if tc.wantCode {
				if _, _, err := service.UnlockSend(send.PublicKey, "", tc.password); !errors.Is(err, ErrPickupCode) {
					t.Fatalf("send bypassed required code: %v", err)
				}
				if _, _, err := service.UnlockCollection(collection.PublicKey, "", tc.password); !errors.Is(err, ErrPickupCode) {
					t.Fatalf("collection bypassed required code: %v", err)
				}
			}
			if tc.password != "" {
				if _, _, err := service.UnlockSend(send.PublicKey, pickupCode, "wrong"); !errors.Is(err, ErrPassword) {
					t.Fatalf("send bypassed password: %v", err)
				}
				if _, _, err := service.UnlockCollection(collection.PublicKey, code, ""); !errors.Is(err, ErrPassword) {
					t.Fatalf("collection bypassed password: %v", err)
				}
			}
			sendToken, _, err := service.UnlockSend(send.PublicKey, pickupCode, tc.password)
			if err != nil {
				t.Fatal(err)
			}
			collectionToken, _, err := service.UnlockCollection(collection.PublicKey, code, tc.password)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := service.ListSendFiles(send.PublicKey, collectionToken); !errors.Is(err, ErrNotFound) {
				t.Fatalf("collection token could read send: %v", err)
			}
			if _, err := service.SubmitToCollection(collection.PublicKey, sendToken, "", "", []IncomingSubmissionFile{
				{RelativePath: "file.txt", Body: strings.NewReader("private")},
			}); !errors.Is(err, ErrNotFound) {
				t.Fatalf("send token could submit collection: %v", err)
			}
			if list, err := service.ListSendFiles(send.PublicKey, sendToken); err != nil || len(list) != 1 {
				t.Fatalf("files=%+v err=%v", list, err)
			}
			if _, _, err := service.ReserveSendDownload(send.PublicKey, sendToken, SendArchiveDownloadTarget); err != nil {
				t.Fatal(err)
			}
			// 同一会话的续传/重试复用已占名额，不重复计数。
			if _, _, err := service.ReserveSendDownload(send.PublicKey, sendToken, SendArchiveDownloadTarget); err != nil {
				t.Fatalf("repeat download must reuse the claim: %v", err)
			}
			if _, _, err := service.ReserveSendDownload(send.PublicKey, sendToken, SendFileDownloadTarget(1)); !errors.Is(err, ErrDownloadLimit) {
				t.Fatalf("download limit error=%v", err)
			}
			if _, err := service.SubmitToCollection(collection.PublicKey, collectionToken, "", "", []IncomingSubmissionFile{
				{RelativePath: "nested/file.txt", Body: strings.NewReader("collection bytes")},
			}); err != nil {
				t.Fatal(err)
			}
			sends, err := service.ListSendsByOwner(owner)
			if err != nil || len(sends) != 1 || sends[0].RequireCode != tc.wantCode {
				t.Fatalf("sends=%+v err=%v", sends, err)
			}
			collections, err := service.ListCollectionsByOwner(owner)
			if err != nil || len(collections) != 1 || collections[0].RequireCode != tc.wantCode {
				t.Fatalf("collections=%+v err=%v", collections, err)
			}
			if err := service.CloseCollection(collection.ID, owner); err != nil {
				t.Fatal(err)
			}
			if _, err := service.SubmitToCollection(collection.PublicKey, collectionToken, "", "", []IncomingSubmissionFile{
				{RelativePath: "late.txt", Body: strings.NewReader("late")},
			}); !errors.Is(err, ErrClosed) {
				t.Fatalf("closed collection accepted old token: %v", err)
			}
			if err := service.RevokeSend(send.ID, owner); err != nil {
				t.Fatal(err)
			}
			if _, err := service.ListSendFiles(send.PublicKey, sendToken); !errors.Is(err, ErrNotFound) {
				t.Fatalf("revoked send accepted old token: %v", err)
			}
		})
	}
}

func TestCollectionLinkAccessPreservesSubmissionConstraints(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	optional := false
	collection, _, err := service.CreateCollection(CreateCollectionInput{
		OwnerUserID: owner, RequireCode: &optional, RequireName: true, RequireNote: true,
		AllowedExts: []string{"txt"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`UPDATE transfer_collections SET max_file_size = 4, max_total_size = 6 WHERE id = ?`, collection.ID); err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, "", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name      string
		token     string
		submitter string
		note      string
		paths     []string
		contents  []string
		want      error
	}{
		{name: "no-session", paths: []string{"a.txt"}, contents: []string{"A"}, want: ErrNotFound},
		{name: "missing-name", token: token, note: "note", paths: []string{"a.txt"}, contents: []string{"A"}, want: ErrNameRequired},
		{name: "missing-note", token: token, submitter: "name", paths: []string{"a.txt"}, contents: []string{"A"}, want: ErrNoteRequired},
		{name: "wrong-type", token: token, submitter: "name", note: "note", paths: []string{"a.exe"}, contents: []string{"A"}, want: ErrTypeNotAllowed},
		{name: "path-traversal", token: token, submitter: "name", note: "note", paths: []string{"../escape.txt"}, contents: []string{"A"}, want: files.ErrInvalid},
		{name: "duplicate-path", token: token, submitter: "name", note: "note", paths: []string{"a.txt", "a.txt"}, contents: []string{"A", "B"}, want: files.ErrAlreadyExists},
		{name: "file-limit", token: token, submitter: "name", note: "note", paths: []string{"a.txt"}, contents: []string{"12345"}, want: ErrFileSizeExceeded},
		{name: "partial-total-limit", token: token, submitter: "name", note: "note", paths: []string{"a.txt", "b.txt"}, contents: []string{"1234", "123"}, want: ErrTotalSizeExceeded},
	} {
		t.Run(tc.name, func(t *testing.T) {
			incoming := make([]IncomingSubmissionFile, len(tc.paths))
			for i, path := range tc.paths {
				incoming[i] = IncomingSubmissionFile{RelativePath: path, Body: strings.NewReader(tc.contents[i])}
			}
			if _, err := service.SubmitToCollection(collection.PublicKey, tc.token, tc.submitter, tc.note, incoming); !errors.Is(err, tc.want) {
				t.Fatalf("submission error=%v, want %v", err, tc.want)
			}
			assertEmptyCollection(t, service, carrier.RootPath, collection)
		})
	}
	for _, body := range []string{"1234", "12"} {
		if _, err := service.SubmitToCollection(collection.PublicKey, token, "name", "note", []IncomingSubmissionFile{
			{RelativePath: "nested/a.txt", Body: strings.NewReader(body)},
		}); err != nil {
			t.Fatalf("distinct submissions with same file path: %v", err)
		}
	}
	if _, err := service.SubmitToCollection(collection.PublicKey, token, "name", "note", []IncomingSubmissionFile{
		{RelativePath: "a.txt", Body: strings.NewReader("1")},
	}); !errors.Is(err, ErrTotalSizeExceeded) {
		t.Fatalf("exhausted collection total: %v", err)
	}
	inbox, err := service.ListSubmissions(collection.ID, owner)
	if err != nil || len(inbox) != 2 {
		t.Fatalf("successful submissions=%+v err=%v", inbox, err)
	}
}

func TestCollectionLinkRespectsSharedQuota(t *testing.T) {
	for _, quota := range []string{"source", "active"} {
		t.Run(quota, func(t *testing.T) {
			service, _, carrier, _, owner := newTransfersFixture(t)
			optional := false
			send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner, RequireCode: &optional})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := service.AddSendUpload(send.ID, owner, "existing.txt", strings.NewReader("12345")); err != nil {
				t.Fatal(err)
			}
			if quota == "source" {
				// 源硬配额包含托管根标识文件，按真实磁盘用量留下一个字节。
				usage, err := service.files.StorageUsage(carrier)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := service.db.Exec(`UPDATE storage_sources SET quota_bytes = ? WHERE id = ?`, usage+1, carrier.ID); err != nil {
					t.Fatal(err)
				}
			} else if err := service.SetSettings(Settings{ActiveQuotaBytes: 6}); err != nil {
				t.Fatal(err)
			}
			collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner, RequireCode: &optional})
			if err != nil {
				t.Fatal(err)
			}
			token, _, err := service.UnlockCollection(collection.PublicKey, "", "")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
				{RelativePath: "large.txt", Body: strings.NewReader("12")},
			}); !errors.Is(err, ErrTotalSizeExceeded) {
				t.Fatalf("%s quota exceeded error=%v", quota, err)
			}
			assertEmptyCollection(t, service, carrier.RootPath, collection)
			if _, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
				{RelativePath: "small.txt", Body: strings.NewReader("1")},
			}); err != nil {
				t.Fatalf("remaining quota could not be used after failure: %v", err)
			}
		})
	}
}

func TestOwnerDetailFindsTasksOutsideHistoryWindow(t *testing.T) {
	service, _, _, _, owner := newTransfersFixture(t)
	optional := false
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner, Title: "Older Send", RequireCode: &optional})
	if err != nil {
		t.Fatal(err)
	}
	collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner, Title: "Older Collection", RequireCode: &optional})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.CloseCollection(collection.ID, owner); err != nil {
		t.Fatal(err)
	}
	newer := time.Now().UTC().Add(time.Hour)
	for _, stmt := range []struct {
		query string
		id    int64
	}{
		{query: `WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n < 200)
  INSERT INTO transfers (public_key, owner_user_id, storage_source_id, pickup_code_hash, require_code, created_at, updated_at)
  SELECT t.public_key || '-' || seq.n, t.owner_user_id, t.storage_source_id, '', 0, ?, ?
  FROM seq CROSS JOIN transfers t WHERE t.id = ?`, id: send.ID},
		{query: `WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n < 200)
  INSERT INTO transfer_collections (public_key, owner_user_id, storage_source_id, code_hash, require_code, created_at, updated_at)
  SELECT c.public_key || '-' || seq.n, c.owner_user_id, c.storage_source_id, '', 0, ?, ?
  FROM seq CROSS JOIN transfer_collections c WHERE c.id = ?`, id: collection.ID},
	} {
		if _, err := service.db.Exec(stmt.query, newer, newer, stmt.id); err != nil {
			t.Fatal(err)
		}
	}
	sends, err := service.ListSendsByOwner(owner)
	if err != nil || len(sends) != 200 {
		t.Fatalf("recent sends=%d err=%v", len(sends), err)
	}
	for _, item := range sends {
		if item.ID == send.ID {
			t.Fatal("old send should be outside the history window")
		}
	}
	collections, err := service.ListCollectionsByOwner(owner)
	if err != nil || len(collections) != 200 {
		t.Fatalf("recent collections=%d err=%v", len(collections), err)
	}
	for _, item := range collections {
		if item.ID == collection.ID {
			t.Fatal("old collection should be outside the history window")
		}
	}
	if detail, err := service.GetSend(send.ID, owner); err != nil || detail.ID != send.ID || detail.Title != "Older Send" {
		t.Fatalf("old send detail=%+v err=%v", detail, err)
	}
	if detail, err := service.GetCollection(collection.ID, owner); err != nil || detail.ID != collection.ID || detail.Status != "closed" {
		t.Fatalf("old collection detail=%+v err=%v", detail, err)
	}
	if _, err := service.GetSend(send.ID, owner+999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another owner send detail error=%v", err)
	}
	if _, err := service.GetCollection(collection.ID, owner+999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another owner collection detail error=%v", err)
	}
}

func assertEmptyCollection(t *testing.T, service *Service, root string, collection *Collection) {
	t.Helper()
	var count, totalSize int64
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM transfer_submissions WHERE collection_id = ?`, collection.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed submission left rows=%d err=%v", count, err)
	}
	if err := service.db.QueryRow(`SELECT total_size FROM transfer_collections WHERE id = ?`, collection.ID).Scan(&totalSize); err != nil || totalSize != 0 {
		t.Fatalf("failed submission changed totals=%d err=%v", totalSize, err)
	}
	entries, err := os.ReadDir(filepath.Join(root, filepath.FromSlash(collectPayloadRel(collection.PublicKey, 0, ""))))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("failed submission left directories: %v", entries)
	}
}

// blockedSubmissionReader lets a state change race with an in-progress payload write.
type blockedSubmissionReader struct {
	reader  io.Reader
	started chan<- struct{}
	resume  <-chan struct{}
	blocked bool
}

func (r *blockedSubmissionReader) Read(p []byte) (int, error) {
	if !r.blocked {
		r.blocked = true
		r.started <- struct{}{}
		<-r.resume
	}
	return r.reader.Read(p)
}

func TestCollectionStateChangeDuringSubmission(t *testing.T) {
	for _, change := range []string{"close", "expire"} {
		t.Run(change, func(t *testing.T) {
			service, _, carrier, _, owner := newTransfersFixture(t)
			optional := false
			collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner, RequireCode: &optional})
			if err != nil {
				t.Fatal(err)
			}
			token, _, err := service.UnlockCollection(collection.PublicKey, "", "")
			if err != nil {
				t.Fatal(err)
			}
			started, resume, done := make(chan struct{}, 1), make(chan struct{}), make(chan error, 1)
			defer close(resume)
			go func() {
				_, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
					{RelativePath: "a.txt", Body: &blockedSubmissionReader{reader: strings.NewReader("data"), started: started, resume: resume}},
				})
				done <- err
			}()
			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("submission did not start")
			}
			want := ErrClosed
			if change == "close" {
				if err := service.CloseCollection(collection.ID, owner); err != nil {
					t.Fatal(err)
				}
			} else {
				want = ErrExpired
				if _, err := service.db.Exec(`UPDATE transfer_collections SET expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-time.Hour), collection.ID); err != nil {
					t.Fatal(err)
				}
			}
			resume <- struct{}{}
			select {
			case err := <-done:
				if !errors.Is(err, want) {
					t.Fatalf("state changed during submission: err=%v want=%v", err, want)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("submission cleanup blocked")
			}
			assertEmptyCollection(t, service, carrier.RootPath, collection)
		})
	}
}

func TestConcurrentCollectionSubmissionsRespectTotalLimit(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	optional := false
	collection, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner, RequireCode: &optional})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`UPDATE transfer_collections SET max_total_size = 6 WHERE id = ?`, collection.ID); err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(collection.PublicKey, "", "")
	if err != nil {
		t.Fatal(err)
	}
	started, resume, done := make(chan struct{}, 2), make(chan struct{}), make(chan error, 2)
	defer close(resume)
	for i := 0; i < 2; i++ {
		go func() {
			_, err := service.SubmitToCollection(collection.PublicKey, token, "", "", []IncomingSubmissionFile{
				{RelativePath: "a.txt", Body: &blockedSubmissionReader{reader: strings.NewReader("1234"), started: started, resume: resume}},
			})
			done <- err
		}()
	}
	for i := 0; i < 2; i++ {
		select {
		case <-started:
		case <-time.After(5 * time.Second):
			t.Fatal("concurrent submissions did not start")
		}
	}
	resume <- struct{}{}
	resume <- struct{}{}
	accepted, rejected := 0, 0
	for i := 0; i < 2; i++ {
		select {
		case err := <-done:
			if err == nil {
				accepted++
			} else if errors.Is(err, ErrTotalSizeExceeded) {
				rejected++
			} else {
				t.Fatalf("unexpected submission error: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("concurrent submission cleanup blocked")
		}
	}
	if accepted != 1 || rejected != 1 {
		t.Fatalf("accepted=%d rejected=%d, want one of each", accepted, rejected)
	}
	current, err := service.GetCollection(collection.ID, owner)
	if err != nil || current.TotalSize != 4 || current.TotalFiles != 1 {
		t.Fatalf("collection=%+v err=%v", current, err)
	}
	entries, err := os.ReadDir(filepath.Join(carrier.RootPath, filepath.FromSlash(collectPayloadRel(collection.PublicKey, 0, ""))))
	if err != nil || len(entries) != 1 {
		t.Fatalf("physical submissions=%v err=%v", entries, err)
	}
}

func TestSaveSubmissionRejectsOtherCollection(t *testing.T) {
	service, _, _, target, owner := newTransfersFixture(t)
	own, _, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	otherOwner, err := users.NewService(service.db).Create("other-collector", "Other Collector", "other-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	other, code, err := service.CreateCollection(CreateCollectionInput{OwnerUserID: otherOwner.ID})
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.UnlockCollection(other.PublicKey, code, "")
	if err != nil {
		t.Fatal(err)
	}
	submission, err := service.SubmitToCollection(other.PublicKey, token, "", "", []IncomingSubmissionFile{
		{RelativePath: "private.txt", Body: strings.NewReader("private bytes")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SaveSubmissionToFiles(own.ID, owner, submission.ID, target.Key, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-collection save error=%v, want not found", err)
	}
	if _, err := os.Stat(filepath.Join(target.RootPath, "private.txt")); !os.IsNotExist(err) {
		t.Fatalf("cross-collection save created a destination file: %v", err)
	}
	if _, err := service.SaveSubmissionToFiles(other.ID, otherOwner.ID, submission.ID, target.Key, ""); err != nil {
		t.Fatalf("own submission save: %v", err)
	}
}

func TestRevokeEmptySendIsIdempotent(t *testing.T) {
	for _, identityKind := range []string{"user", "guest"} {
		t.Run(identityKind, func(t *testing.T) {
			service, _, _, _, userID := newTransfersFixture(t)
			owner := Owner{UserID: userID}
			input := CreateSendInput{OwnerUserID: userID}
			if identityKind == "guest" {
				guest, _, err := service.CreateGuestIdentity(time.Hour)
				if err != nil {
					t.Fatal(err)
				}
				owner = Owner{GuestID: guest.ID}
				input = CreateSendInput{OwnerGuestID: guest.ID}
			}
			send, _, err := service.CreateSend(input)
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 2; i++ {
				if err := service.RevokeSendForOwner(send.ID, owner); err != nil {
					t.Fatalf("empty draft revoke %d: %v", i+1, err)
				}
			}
			if detail, err := service.GetSendForOwner(send.ID, owner); err != nil || detail.Status != "revoked" {
				t.Fatalf("empty draft history=%+v err=%v", detail, err)
			}
		})
	}
}

func TestRevokeSendRejectsForeignManagedRoot(t *testing.T) {
	service, _, carrier, _, owner := newTransfersFixture(t)
	send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(carrier.RootPath, ".omnistore", "managed-root.json"), []byte(`{"version":1,"instance_id":"other-instance","storage_source_id":1,"nonce":"foreign"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.RevokeSend(send.ID, owner); !errors.Is(err, managedroot.ErrOwnershipMismatch) {
		t.Fatalf("revoke ignored foreign managed root: %v", err)
	}
	if detail, err := service.GetSend(send.ID, owner); err != nil || detail.Status != "draft" {
		t.Fatalf("failed revoke changed task: detail=%+v err=%v", detail, err)
	}
}

func TestFinalizeRejectsChangedSendState(t *testing.T) {
	for _, change := range []string{"revoke", "expire"} {
		t.Run(change, func(t *testing.T) {
			service, _, _, _, owner := newTransfersFixture(t)
			send, _, err := service.CreateSend(CreateSendInput{OwnerUserID: owner})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := service.AddSendUpload(send.ID, owner, "a.txt", strings.NewReader("payload")); err != nil {
				t.Fatal(err)
			}
			// 精确模拟 Finalize 已读取草稿后，另一操作先完成状态变更。
			row, err := service.loadOwnSend(send.ID, Owner{UserID: owner})
			if err != nil {
				t.Fatal(err)
			}
			want := ErrNotDraft
			if change == "revoke" {
				if err := service.RevokeSend(send.ID, owner); err != nil {
					t.Fatal(err)
				}
			} else {
				want = ErrExpired
				if _, err := service.db.Exec(`UPDATE transfers SET expires_at = ? WHERE id = ?`, time.Now().UTC().Add(-time.Hour), send.ID); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := service.finalizeLoadedSend(row); !errors.Is(err, want) {
				t.Fatalf("stale finalize error=%v, want=%v", err, want)
			}
			current, err := service.GetSend(send.ID, owner)
			if err != nil || current.Status == "active" || current.FinalizedAt != nil {
				t.Fatalf("failed finalize changed task=%+v err=%v", current, err)
			}
			if change == "expire" {
				if _, err := service.FinalizeSend(send.ID, owner); !errors.Is(err, ErrExpired) {
					t.Fatalf("expired task finalized: %v", err)
				}
			}
		})
	}
}
