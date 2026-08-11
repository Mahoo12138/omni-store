package files

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/models"
)

func newFileUploadRecoveryFixture(t *testing.T) (*Service, *models.StorageSource, string, int64) {
	t.Helper()
	service, source, root := newQuotaTestService(t, 0)
	userID := int64(81)
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-upload-recovery', 'upload-recovery', 'Upload Recovery', 'hash', 'user', 0, 0,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, userID); err != nil {
		t.Fatal(err)
	}
	return service, source, root, userID
}

func stageFileUploadOperation(t *testing.T, service *Service, source *models.StorageSource,
	name, content string, replaced bool, userID int64) (uploadOperation, string, string) {
	t.Helper()
	targetAbs := filepath.Join(source.RootPath, name)
	tempAbs, size, contentSHA256, err := writeUploadTemp(filepath.Dir(targetAbs), strings.NewReader(content), 0, false)
	if err != nil {
		t.Fatal(err)
	}
	if err := syncDirectory(filepath.Dir(targetAbs)); err != nil {
		t.Fatal(err)
	}
	op, err := service.newUploadOperation(source, filepath.ToSlash(name), tempAbs, replaced, size, contentSHA256,
		models.FileOwnerUser, &userID, &userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.writeUploadOperation(op); err != nil {
		t.Fatal(err)
	}
	return op, tempAbs, targetAbs
}

func assertNoFileUploadOperation(t *testing.T, service *Service, op uploadOperation) {
	t.Helper()
	for _, item := range []string{service.uploadOperationPath(op.OperationID), service.uploadDatabaseReadyPath(op.OperationID)} {
		if _, err := os.Lstat(item); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("upload recovery artifact remains at %s: %v", item, err)
		}
	}
}

func TestRecoverFileUploadRollsBackNewFileIntent(t *testing.T) {
	service, source, _, userID := newFileUploadRecoveryFixture(t)
	op, tempAbs, targetAbs := stageFileUploadOperation(t, service, source, "new.txt", "new", false, userID)
	if count, err := service.UserFileUploadOperationCount(userID); err != nil || count != 1 {
		t.Fatalf("user upload operation count=%d err=%v", count, err)
	}

	result, err := service.RecoverFileUploadOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackUploads != 1 || result.CompletedUploads != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	for _, item := range []string{tempAbs, targetAbs} {
		if _, err := os.Lstat(item); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("rolled back file remains at %s: %v", item, err)
		}
	}
	assertNoFileRecord(t, service, source.ID, "new.txt")
	assertNoFileUploadOperation(t, service, op)
}

func TestRecoverFileUploadCompletesRenamedNewFile(t *testing.T) {
	service, source, root, userID := newFileUploadRecoveryFixture(t)
	op, tempAbs, targetAbs := stageFileUploadOperation(t, service, source, "complete.txt", "complete", false, userID)
	if err := service.installUploadedFile(op, tempAbs, targetAbs); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverFileUploadOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 || result.RolledBackUploads != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if content, err := os.ReadFile(filepath.Join(root, "complete.txt")); err != nil || string(content) != "complete" {
		t.Fatalf("content=%q err=%v", content, err)
	}
	assertFileRecord(t, service, source.ID, "complete.txt", "complete.txt", 8, models.FileOwnerUser, &userID)
	assertNoFileUploadOperation(t, service, op)
}

func TestRecoverFileUploadOverwriteStateMachine(t *testing.T) {
	for _, test := range []struct {
		name         string
		advance      func(*testing.T, *Service, uploadOperation, string, string)
		wantContent  string
		wantComplete int
		wantRollback int
	}{
		{
			name:        "intent keeps old target",
			advance:     func(t *testing.T, _ *Service, _ uploadOperation, _, _ string) {},
			wantContent: "old", wantRollback: 1,
		},
		{
			name: "backup made restores old target",
			advance: func(t *testing.T, service *Service, op uploadOperation, _, targetAbs string) {
				_, _, backupAbs, err := service.uploadPaths(op, &models.StorageSource{RootPath: filepath.Dir(targetAbs)})
				if err != nil {
					t.Fatal(err)
				}
				if err := os.Rename(targetAbs, backupAbs); err != nil {
					t.Fatal(err)
				}
			},
			wantContent: "old", wantRollback: 1,
		},
		{
			name: "new target and backup complete",
			advance: func(t *testing.T, service *Service, op uploadOperation, tempAbs, targetAbs string) {
				if err := service.installUploadedFile(op, tempAbs, targetAbs); err != nil {
					t.Fatal(err)
				}
			},
			wantContent: "new-content", wantComplete: 1,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			service, source, root, userID := newFileUploadRecoveryFixture(t)
			if err := os.WriteFile(filepath.Join(root, "replace.txt"), []byte("old"), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := service.RecordFile(source, "replace.txt", models.FileOwnerUser, &userID, &userID); err != nil {
				t.Fatal(err)
			}
			op, tempAbs, targetAbs := stageFileUploadOperation(t, service, source, "replace.txt", "new-content", true, userID)
			test.advance(t, service, op, tempAbs, targetAbs)

			result, err := service.RecoverFileUploadOperations()
			if err != nil {
				t.Fatal(err)
			}
			if result.CompletedUploads != test.wantComplete || result.RolledBackUploads != test.wantRollback {
				t.Fatalf("unexpected recovery result: %+v", result)
			}
			content, err := os.ReadFile(targetAbs)
			if err != nil || string(content) != test.wantContent {
				t.Fatalf("content=%q err=%v", content, err)
			}
			assertFileRecord(t, service, source.ID, "replace.txt", "replace.txt", int64(len(test.wantContent)), models.FileOwnerUser, &userID)
			assertNoFileUploadOperation(t, service, op)
		})
	}
}

func TestRecoverFileUploadDatabaseMarkerDoesNotReviveDeletedTarget(t *testing.T) {
	service, source, root, userID := newFileUploadRecoveryFixture(t)
	if err := os.WriteFile(filepath.Join(root, "lifecycle.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	op, tempAbs, targetAbs := stageFileUploadOperation(t, service, source, "lifecycle.txt", "new", true, userID)
	if err := service.installUploadedFile(op, tempAbs, targetAbs); err != nil {
		t.Fatal(err)
	}
	if err := service.RecordFile(source, op.FinalRelativePath, op.OwnerType, op.OwnerUserID, op.ActorUserID); err != nil {
		t.Fatal(err)
	}
	if err := service.markUploadDatabaseReady(op.OperationID); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(targetAbs); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverFileUploadOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if _, err := os.Lstat(targetAbs); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("deleted target was revived: %v", err)
	}
	assertNoFileUploadOperation(t, service, op)
}

func TestRecoverFileUploadCompletesDatabaseCommitBeforeMarker(t *testing.T) {
	service, source, root, userID := newFileUploadRecoveryFixture(t)
	if err := os.WriteFile(filepath.Join(root, "db-committed.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.RecordFile(source, "db-committed.txt", models.FileOwnerUser, &userID, &userID); err != nil {
		t.Fatal(err)
	}
	op, tempAbs, targetAbs := stageFileUploadOperation(t, service, source, "db-committed.txt", "new", true, userID)
	if err := service.installUploadedFile(op, tempAbs, targetAbs); err != nil {
		t.Fatal(err)
	}
	if err := service.RecordFile(source, op.FinalRelativePath, op.OwnerType, op.OwnerUserID, op.ActorUserID); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverFileUploadOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 || result.RolledBackUploads != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if content, err := os.ReadFile(targetAbs); err != nil || string(content) != "new" {
		t.Fatalf("content=%q err=%v", content, err)
	}
	assertFileRecord(t, service, source.ID, op.FinalRelativePath, op.FinalRelativePath, 3, models.FileOwnerUser, &userID)
	assertNoFileUploadOperation(t, service, op)
}

func TestUploadLedgerFailureRestoresFilesystemAndRemovesJournal(t *testing.T) {
	service, source, root, userID := newFileUploadRecoveryFixture(t)
	if _, err := service.db.Exec(`CREATE TRIGGER fail_file_upload_record
  BEFORE INSERT ON file_records BEGIN SELECT RAISE(FAIL, 'injected ledger failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "", "failed.txt", strings.NewReader("data"), false, nil, &userID); err == nil {
		t.Fatal("upload unexpectedly succeeded")
	}
	if _, err := os.Lstat(filepath.Join(root, "failed.txt")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("failed target remains: %v", err)
	}
	entries, err := os.ReadDir(service.uploadOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("upload operation artifacts remain: %v", entries)
	}
}

func TestOverwriteLedgerFailureRestoresOldFileAndRecord(t *testing.T) {
	service, source, root, userID := newFileUploadRecoveryFixture(t)
	oldOwnerID := userID
	if err := os.WriteFile(filepath.Join(root, "failed-replace.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.RecordFile(source, "failed-replace.txt", models.FileOwnerUser, &oldOwnerID, &oldOwnerID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`CREATE TRIGGER fail_file_overwrite_record
  BEFORE INSERT ON file_records BEGIN SELECT RAISE(FAIL, 'injected overwrite ledger failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "", "failed-replace.txt", strings.NewReader("new"), true, nil, &userID); err == nil {
		t.Fatal("overwrite unexpectedly succeeded")
	}
	if content, err := os.ReadFile(filepath.Join(root, "failed-replace.txt")); err != nil || string(content) != "old" {
		t.Fatalf("restored content=%q err=%v", content, err)
	}
	assertFileRecord(t, service, source.ID, "failed-replace.txt", "failed-replace.txt", 3, models.FileOwnerUser, &oldOwnerID)
	entries, err := os.ReadDir(service.uploadOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("upload operation artifacts remain: %v", entries)
	}
}

func TestRecoverFileUploadRejectsCorruptAndAmbiguousState(t *testing.T) {
	t.Run("corrupt journal", func(t *testing.T) {
		service, _, _, _ := newFileUploadRecoveryFixture(t)
		if err := os.MkdirAll(service.uploadOperationsDir(), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(service.uploadOperationsDir(), "upl-000000000000000000000000.json"), []byte("{"), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecoverFileUploadOperations(); err == nil || !strings.Contains(err.Error(), "读取普通上传操作日志") {
			t.Fatalf("expected corrupt journal error, got %v", err)
		}
	})

	t.Run("temp and final both exist", func(t *testing.T) {
		service, source, _, userID := newFileUploadRecoveryFixture(t)
		op, _, targetAbs := stageFileUploadOperation(t, service, source, "ambiguous.txt", "data", false, userID)
		if err := os.WriteFile(targetAbs, []byte("external"), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecoverFileUploadOperations(); err == nil || !strings.Contains(err.Error(), "歧义状态") {
			t.Fatalf("expected ambiguity error, got %v", err)
		}
		if count, err := service.SourceFileUploadOperationCount(source.ID); err != nil || count != 1 {
			t.Fatalf("operation count=%d err=%v", count, err)
		}
		if _, err := os.Stat(service.uploadOperationPath(op.OperationID)); err != nil {
			t.Fatalf("ambiguous journal was removed: %v", err)
		}
	})

	t.Run("same metadata but different content", func(t *testing.T) {
		service, source, _, userID := newFileUploadRecoveryFixture(t)
		op, tempAbs, targetAbs := stageFileUploadOperation(t, service, source, "digest.txt", "good", false, userID)
		if err := service.installUploadedFile(op, tempAbs, targetAbs); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(targetAbs, []byte("evil"), 0o600); err != nil {
			t.Fatal(err)
		}
		mtime := time.Unix(0, op.MTimeUnixNano)
		if err := os.Chtimes(targetAbs, mtime, mtime); err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecoverFileUploadOperations(); err == nil || !strings.Contains(err.Error(), "歧义状态") {
			t.Fatalf("expected digest ambiguity error, got %v", err)
		}
		if content, err := os.ReadFile(targetAbs); err != nil || string(content) != "evil" {
			t.Fatalf("ambiguous content changed=%q err=%v", content, err)
		}
	})
}

func TestConcurrentUploadsLeaveNoRecoveryArtifacts(t *testing.T) {
	service, source, _, userID := newFileUploadRecoveryFixture(t)
	const total = 20
	errs := make(chan error, total)
	for index := range total {
		go func() {
			name := fmt.Sprintf("parallel-%02d.txt", index)
			_, _, err := service.UploadWithLockTokens(source, "", name, strings.NewReader(name), false, nil, &userID)
			errs <- err
		}()
	}
	for range total {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(service.uploadOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("upload operation artifacts remain: %v", entries)
	}
	var records int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ? AND owner_user_id = ?`,
		source.ID, userID).Scan(&records); err != nil || records != total {
		t.Fatalf("owned records=%d err=%v", records, err)
	}
}
