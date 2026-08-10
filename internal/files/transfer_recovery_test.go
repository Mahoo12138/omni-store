package files

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestRecoverTransferRollsBackDatabaseCommittedBeforeStageMarker(t *testing.T) {
	service, source, target, sourceRoot, targetRoot, userID := newTransferRecoveryFixture(t)
	if _, _, err := service.UploadWithLockTokens(source, "", "image.jpg", strings.NewReader("data"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES ('img-recovery-rollback', 'user', ?, ?, 'image.jpg', 'image.jpg', '/i/img-recovery-rollback.jpg', 4,
   'image/jpeg', 1, 1, 'jpg', CURRENT_TIMESTAMP)`, userID, source.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`INSERT INTO file_shares
  (share_key, storage_source_id, relative_path, entry_type, created_by_user_id,
   max_downloads, download_count, created_at)
  VALUES ('shr-recovery-rollback', ?, 'image.jpg', 'file', ?, 0, 0, CURRENT_TIMESTAMP)`, source.ID, userID); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	plan, err := service.buildTransferPlan(source, target, "image.jpg", "archive/image.jpg")
	if err != nil {
		t.Fatal(err)
	}
	op := service.newTransferOperation(source.ID, target.ID, plan.sourceRel, plan.targetRel, plan.isDir)
	if err := service.writeTransferOperation(op); err != nil {
		t.Fatal(err)
	}
	if err := service.executeTransferCopy(plan); err != nil {
		t.Fatal(err)
	}
	if err := service.syncTransferDestination(plan); err != nil {
		t.Fatal(err)
	}
	if err := service.markTransferTargetReady(op.OperationID); err != nil {
		t.Fatal(err)
	}
	// 模拟 SQLite 已提交，但进程尚未来得及写 database-ready 阶段标记。
	if err := service.syncTransferRecords(source, target, plan, true, &userID); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTransferOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackMoves != 1 || result.CompletedMoves != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if content, err := os.ReadFile(filepath.Join(sourceRoot, "image.jpg")); err != nil || string(content) != "data" {
		t.Fatalf("source content=%q err=%v", content, err)
	}
	if _, err := os.Stat(filepath.Join(targetRoot, "archive", "image.jpg")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("rolled back target still exists: %v", err)
	}
	assertFileRecord(t, service, source.ID, "image.jpg", "image.jpg", 4, models.FileOwnerUser, &userID)
	assertNoFileRecord(t, service, target.ID, "archive/image.jpg")
	var imageSourceID int64
	var imagePath string
	if err := service.db.QueryRow(`SELECT storage_source_id, relative_path FROM images WHERE image_id = 'img-recovery-rollback'`).
		Scan(&imageSourceID, &imagePath); err != nil {
		t.Fatal(err)
	}
	if imageSourceID != source.ID || imagePath != "image.jpg" {
		t.Fatalf("rolled back image location=%d/%s", imageSourceID, imagePath)
	}
	var shareSourceID int64
	var sharePath string
	if err := service.db.QueryRow(`SELECT storage_source_id, relative_path FROM file_shares WHERE share_key = 'shr-recovery-rollback'`).
		Scan(&shareSourceID, &sharePath); err != nil {
		t.Fatal(err)
	}
	if shareSourceID != source.ID || sharePath != "image.jpg" {
		t.Fatalf("rolled back share location=%d/%s", shareSourceID, sharePath)
	}
	assertNoTransferOperation(t, service, op.OperationID)
}

func TestRecoverTransferCompletesPartiallyDeletedSourceAfterDatabaseStage(t *testing.T) {
	service, source, target, sourceRoot, targetRoot, userID := newTransferRecoveryFixture(t)
	if _, err := service.Mkdir(source, "", "folder"); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{"one.txt": "one", "two.txt": "two"} {
		if _, _, err := service.UploadWithLockTokens(source, "folder", name, strings.NewReader(content), false, nil, &userID); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	plan, err := service.buildTransferPlan(source, target, "folder", "archive/folder")
	if err != nil {
		t.Fatal(err)
	}
	op := service.newTransferOperation(source.ID, target.ID, plan.sourceRel, plan.targetRel, plan.isDir)
	if err := service.writeTransferOperation(op); err != nil {
		t.Fatal(err)
	}
	if err := service.executeTransferCopy(plan); err != nil {
		t.Fatal(err)
	}
	if err := service.syncTransferDestination(plan); err != nil {
		t.Fatal(err)
	}
	if err := service.markTransferTargetReady(op.OperationID); err != nil {
		t.Fatal(err)
	}
	if err := service.syncTransferRecords(source, target, plan, true, &userID); err != nil {
		t.Fatal(err)
	}
	if err := service.markTransferDatabaseReady(op.OperationID); err != nil {
		t.Fatal(err)
	}
	// 模拟 RemoveAll 已删掉一部分子项后进程退出。
	if err := os.Remove(filepath.Join(sourceRoot, "folder", "one.txt")); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTransferOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedMoves != 1 || result.RolledBackMoves != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if _, err := os.Stat(filepath.Join(sourceRoot, "folder")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("partially deleted source still exists: %v", err)
	}
	for name, content := range map[string]string{"one.txt": "one", "two.txt": "two"} {
		actual, err := os.ReadFile(filepath.Join(targetRoot, "archive", "folder", name))
		if err != nil || string(actual) != content {
			t.Fatalf("target %s=%q err=%v", name, actual, err)
		}
		assertFileRecord(t, service, target.ID, "archive/folder/"+name, "archive/folder/"+name, 3, models.FileOwnerUser, &userID)
	}
	assertNoTransferOperation(t, service, op.OperationID)
}

func TestRecoverTransferRejectsMissingSourceBeforeDatabaseStage(t *testing.T) {
	service, source, target, sourceRoot, targetRoot, _ := newTransferRecoveryFixture(t)
	if err := os.WriteFile(filepath.Join(sourceRoot, "lost.txt"), []byte("source"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	op := service.newTransferOperation(source.ID, target.ID, "lost.txt", "archive/lost.txt", false)
	if err := service.writeTransferOperation(op); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(targetRoot, "archive", "lost.txt"), []byte("target"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.markTransferTargetReady(op.OperationID); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(sourceRoot, "lost.txt")); err != nil {
		t.Fatal(err)
	}

	if _, err := service.RecoverTransferOperations(); err == nil || !strings.Contains(err.Error(), "尚未提交但源数据不存在") {
		t.Fatalf("missing source recovery error=%v", err)
	}
	if _, err := os.Stat(service.transferOperationPath(op.OperationID)); err != nil {
		t.Fatalf("ambiguous journal must remain: %v", err)
	}
	if content, err := os.ReadFile(filepath.Join(targetRoot, "archive", "lost.txt")); err != nil || string(content) != "target" {
		t.Fatalf("ambiguous target content=%q err=%v", content, err)
	}
}

func TestRecoverTransferRejectsMissingTargetAfterDatabaseStage(t *testing.T) {
	service, source, target, sourceRoot, targetRoot, _ := newTransferRecoveryFixture(t)
	if err := os.WriteFile(filepath.Join(sourceRoot, "source.txt"), []byte("source"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	op := service.newTransferOperation(source.ID, target.ID, "source.txt", "archive/source.txt", false)
	if err := service.writeTransferOperation(op); err != nil {
		t.Fatal(err)
	}
	if err := service.markTransferTargetReady(op.OperationID); err != nil {
		t.Fatal(err)
	}
	if err := service.markTransferDatabaseReady(op.OperationID); err != nil {
		t.Fatal(err)
	}

	if _, err := service.RecoverTransferOperations(); err == nil || !strings.Contains(err.Error(), "数据库已提交但目标数据不存在") {
		t.Fatalf("missing target recovery error=%v", err)
	}
	if content, err := os.ReadFile(filepath.Join(sourceRoot, "source.txt")); err != nil || string(content) != "source" {
		t.Fatalf("ambiguous source content=%q err=%v", content, err)
	}
	if _, err := os.Stat(service.transferOperationPath(op.OperationID)); err != nil {
		t.Fatalf("ambiguous journal must remain: %v", err)
	}
}

func TestRecoverTransferRejectsCorruptJournalAndCleansOrphanMarkers(t *testing.T) {
	service, _, _, _, _, _ := newTransferRecoveryFixture(t)
	dir := service.transferOperationsDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	orphanID := "trf-00112233445566778899aabb"
	if err := os.WriteFile(service.transferTargetReadyPath(orphanID), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	corruptID := "trf-aabbccddeeff001122334455"
	if err := os.WriteFile(service.transferOperationPath(corruptID), []byte(`{"version":1`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecoverTransferOperations(); err == nil || !strings.Contains(err.Error(), "读取跨来源移动操作日志") {
		t.Fatalf("corrupt journal error=%v", err)
	}
	if _, err := os.Stat(service.transferTargetReadyPath(orphanID)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("orphan marker still exists: %v", err)
	}
	if _, err := os.Stat(service.transferOperationPath(corruptID)); err != nil {
		t.Fatalf("corrupt journal must remain: %v", err)
	}
}

func newTransferRecoveryFixture(t *testing.T) (*Service, *models.StorageSource, *models.StorageSource, string, string, int64) {
	t.Helper()
	service, source, sourceRoot := newQuotaTestService(t, 0)
	targetRoot := filepath.Join(filepath.Dir(sourceRoot), "transfer-recovery-target")
	if err := os.Mkdir(targetRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	target, err := service.sources.Create(sources.CreateInput{Name: "recovery-target", RootPath: targetRoot})
	if err != nil {
		t.Fatal(err)
	}
	userID := insertTransferUser(t, service, 0)
	return service, source, target, sourceRoot, targetRoot, userID
}

func assertNoFileRecord(t *testing.T, service *Service, sourceID int64, relPath string) {
	t.Helper()
	var count int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ? AND relative_path = ?`, sourceID, relPath).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("unexpected file record %d/%s", sourceID, relPath)
	}
}

func assertNoTransferOperation(t *testing.T, service *Service, operationID string) {
	t.Helper()
	for _, path := range []string{
		service.transferOperationPath(operationID),
		service.transferTargetReadyPath(operationID),
		service.transferDatabaseReadyPath(operationID),
	} {
		if _, err := os.Stat(path); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("transfer recovery artifact still exists at %s: %v", path, err)
		}
	}
}
