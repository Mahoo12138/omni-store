package imagebed

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
)

func TestRecoverUploadRollsBackTemporaryAndFinalFilesBeforeDatabaseCommit(t *testing.T) {
	for _, stage := range []string{"temporary", "final"} {
		t.Run(stage, func(t *testing.T) {
			service, _, source, user, _, root := newImageLifecycleFixture(t)
			op, tempAbs, finalAbs := newUploadRecoveryOperation(t, service, source, user, root)
			writePath := tempAbs
			if stage == "final" {
				writePath = finalAbs
			}
			if err := os.WriteFile(writePath, testPNGBytes(t), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := service.writeImageUploadOperation(op); err != nil {
				t.Fatal(err)
			}

			result, err := service.RecoverUploadOperations()
			if err != nil {
				t.Fatal(err)
			}
			if result.RolledBackUploads != 1 || result.CompletedUploads != 0 {
				t.Fatalf("unexpected recovery result: %+v", result)
			}
			for _, path := range []string{tempAbs, finalAbs, service.uploadOperationPath(op.OperationID)} {
				if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
					t.Fatalf("rollback artifact still exists at %s: %v", path, err)
				}
			}
			assertImageUploadDatabaseEmpty(t, service)
		})
	}
}

func TestRecoverUploadKeepsCommittedImageAfterJournalCleanupWasInterrupted(t *testing.T) {
	service, _, source, user, _, root := newImageLifecycleFixture(t)
	op, tempAbs, finalAbs := newUploadRecoveryOperation(t, service, source, user, root)
	if err := os.WriteFile(tempAbs, testPNGBytes(t), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.writeImageUploadOperation(op); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(tempAbs, finalAbs); err != nil {
		t.Fatal(err)
	}
	prepared, err := service.files.PrepareFileRecord(source, op.FinalRelativePath, models.FileOwnerUser, &user.ID, &user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.commitImageUpload(op, prepared); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverUploadOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 || result.RolledBackUploads != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if content, err := os.ReadFile(finalAbs); err != nil || !bytes.Equal(content, testPNGBytes(t)) {
		t.Fatalf("committed image content=%x err=%v", content, err)
	}
	if _, err := service.Get(op.ImageID); err != nil {
		t.Fatalf("committed image record missing: %v", err)
	}
	assertActiveImageFileRecord(t, service, source.ID, op.FinalRelativePath, user.ID)
	assertNoImageUploadOperation(t, service, op.OperationID)
}

func TestRecoverUploadAcceptsCommittedImageMovedAfterJournalCleanupFailure(t *testing.T) {
	service, _, source, user, _, root := newImageLifecycleFixture(t)
	op, tempAbs, finalAbs := newUploadRecoveryOperation(t, service, source, user, root)
	if err := os.WriteFile(tempAbs, testPNGBytes(t), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.writeImageUploadOperation(op); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(tempAbs, finalAbs); err != nil {
		t.Fatal(err)
	}
	prepared, err := service.files.PrepareFileRecord(source, op.FinalRelativePath, models.FileOwnerUser, &user.ID, &user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.commitImageUpload(op, prepared); err != nil {
		t.Fatal(err)
	}
	moveDir := filepath.ToSlash(filepath.Dir(op.FinalRelativePath)) + "/moved"
	if _, err := service.files.Mkdir(source, filepath.ToSlash(filepath.Dir(op.FinalRelativePath)), "moved"); err != nil {
		t.Fatal(err)
	}
	movedRel := moveDir + "/" + filepath.Base(op.FinalRelativePath)
	if _, err := service.files.MoveWithLockTokens(source, op.FinalRelativePath, movedRel, nil, &user.ID); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverUploadOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	img, err := service.Get(op.ImageID)
	if err != nil || img.RelativePath != movedRel {
		t.Fatalf("moved image=%+v err=%v", img, err)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(movedRel))); err != nil {
		t.Fatalf("moved physical image missing: %v", err)
	}
	assertNoImageUploadOperation(t, service, op.OperationID)
}

func TestImageUploadLedgerFailureRollsBackImageFileAndBothDatabaseRows(t *testing.T) {
	service, _, source, user, _, root := newImageLifecycleFixture(t)
	if err := service.SetDefaultTarget(user, source.Key); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`CREATE TRIGGER reject_image_ledger BEFORE INSERT ON file_records
  WHEN NEW.relative_path LIKE 'images/%'
  BEGIN SELECT RAISE(FAIL, 'forced image ledger failure'); END`); err != nil {
		t.Fatal(err)
	}

	if _, err := service.UploadForUser(user, "", "atomic.png", bytes.NewReader(testPNGBytes(t))); err == nil ||
		!strings.Contains(err.Error(), "提交图片与文件台账失败") {
		t.Fatalf("ledger failure upload error=%v", err)
	}
	assertImageUploadDatabaseEmpty(t, service)
	assertNoRegularFiles(t, root)
	entries, err := os.ReadDir(service.uploadOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("failed upload left operation artifacts: %+v", entries)
	}
}

func TestRecoverUploadRejectsAmbiguousAndCorruptState(t *testing.T) {
	t.Run("both temporary and final", func(t *testing.T) {
		service, _, source, user, _, root := newImageLifecycleFixture(t)
		op, tempAbs, finalAbs := newUploadRecoveryOperation(t, service, source, user, root)
		for _, path := range []string{tempAbs, finalAbs} {
			if err := os.WriteFile(path, testPNGBytes(t), 0o600); err != nil {
				t.Fatal(err)
			}
		}
		if err := service.writeImageUploadOperation(op); err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecoverUploadOperations(); err == nil || !strings.Contains(err.Error(), "同时存在临时与最终文件") {
			t.Fatalf("ambiguous recovery error=%v", err)
		}
		for _, path := range []string{tempAbs, finalAbs, service.uploadOperationPath(op.OperationID)} {
			if _, err := os.Stat(path); err != nil {
				t.Fatalf("ambiguous state must remain at %s: %v", path, err)
			}
		}
	})

	t.Run("corrupt journal", func(t *testing.T) {
		service, _, _, _, _, _ := newImageLifecycleFixture(t)
		if err := os.MkdirAll(service.uploadOperationsDir(), 0o700); err != nil {
			t.Fatal(err)
		}
		operationID := "iup-00112233445566778899aabb"
		journalPath := service.uploadOperationPath(operationID)
		if err := os.WriteFile(journalPath, []byte(`{"version":1`), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecoverUploadOperations(); err == nil || !strings.Contains(err.Error(), "读取图床上传操作日志") {
			t.Fatalf("corrupt recovery error=%v", err)
		}
		if _, err := os.Stat(journalPath); err != nil {
			t.Fatalf("corrupt journal must remain: %v", err)
		}
	})
}

func TestConcurrentImageUploadsCommitAtomicallyWithoutOperationResidue(t *testing.T) {
	service, _, source, user, _, root := newImageLifecycleFixture(t)
	if err := service.SetDefaultTarget(user, source.Key); err != nil {
		t.Fatal(err)
	}
	const uploads = 20
	imageBytes := testPNGBytes(t)
	var wg sync.WaitGroup
	ids := make(chan string, uploads)
	errs := make(chan error, uploads)
	for range uploads {
		wg.Add(1)
		go func() {
			defer wg.Done()
			img, err := service.UploadForUser(user, "", "concurrent.png", bytes.NewReader(imageBytes))
			if err != nil {
				errs <- err
				return
			}
			ids <- img.ImageID
		}()
	}
	wg.Wait()
	close(ids)
	close(errs)
	for err := range errs {
		t.Errorf("concurrent upload: %v", err)
	}
	unique := map[string]struct{}{}
	for id := range ids {
		unique[id] = struct{}{}
	}
	if len(unique) != uploads {
		t.Fatalf("unique uploaded images=%d, want %d", len(unique), uploads)
	}
	var imageCount, recordCount int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM images`).Scan(&imageCount); err != nil {
		t.Fatal(err)
	}
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE owner_user_id = ?`, user.ID).Scan(&recordCount); err != nil {
		t.Fatal(err)
	}
	if imageCount != uploads || recordCount != uploads {
		t.Fatalf("concurrent database images=%d records=%d", imageCount, recordCount)
	}
	entries, err := os.ReadDir(service.uploadOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("concurrent uploads left operation artifacts: %+v", entries)
	}
	regularFiles := 0
	if err := filepath.WalkDir(root, func(_ string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type().IsRegular() {
			regularFiles++
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if regularFiles != uploads {
		t.Fatalf("concurrent physical files=%d, want %d", regularFiles, uploads)
	}
}

func newUploadRecoveryOperation(t *testing.T, service *Service, source *models.StorageSource,
	user *models.User, root string) (imageUploadOperation, string, string) {
	t.Helper()
	relDir := "images/recovery"
	absDir := filepath.Join(root, filepath.FromSlash(relDir))
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		t.Fatal(err)
	}
	tempName := ".omnistore-upload-" + auth.NewRandomToken("", 8) + ".tmp"
	random := auth.NewRandomToken("", 16)
	tempRel := relDir + "/" + tempName
	finalRel := relDir + "/" + random + ".png"
	info := &ImageInfo{Ext: "png", MimeType: "image/png", Width: 2, Height: 2}
	imageID := "img_" + random
	op := service.newImageUploadOperation(source.ID, tempRel, finalRel, imageID, models.ImageOwnerUser,
		&user.ID, "recovery.png", service.publicURL+"/i/"+imageID+".png", int64(len(testPNGBytes(t))), info)
	return op, filepath.Join(absDir, tempName), filepath.Join(absDir, random+".png")
}

func assertImageUploadDatabaseEmpty(t *testing.T, service *Service) {
	t.Helper()
	var imageCount, recordCount int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM images`).Scan(&imageCount); err != nil {
		t.Fatal(err)
	}
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records`).Scan(&recordCount); err != nil {
		t.Fatal(err)
	}
	if imageCount != 0 || recordCount != 0 {
		t.Fatalf("unexpected image database state images=%d records=%d", imageCount, recordCount)
	}
}

func assertActiveImageFileRecord(t *testing.T, service *Service, sourceID int64, relPath string, userID int64) {
	t.Helper()
	var ownerType, status string
	var owner int64
	if err := service.db.QueryRow(`SELECT owner_type, owner_user_id, record_status FROM file_records
  WHERE storage_source_id = ? AND relative_path = ?`, sourceID, relPath).Scan(&ownerType, &owner, &status); err != nil {
		t.Fatal(err)
	}
	if ownerType != models.FileOwnerUser || owner != userID || status != models.FileRecordActive {
		t.Fatalf("unexpected image file record owner=%s/%d status=%s", ownerType, owner, status)
	}
}

func assertNoImageUploadOperation(t *testing.T, service *Service, operationID string) {
	t.Helper()
	if _, err := os.Stat(service.uploadOperationPath(operationID)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("image upload operation still exists: %v", err)
	}
}

func assertNoRegularFiles(t *testing.T, root string) {
	t.Helper()
	if err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type().IsRegular() {
			t.Fatalf("unexpected regular file after rollback: %s", path)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
