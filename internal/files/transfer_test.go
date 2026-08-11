package files

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestCopyAcrossSourcesEnforcesQuotaAndRecordsActorOwnership(t *testing.T) {
	service, source, sourceRoot := newQuotaTestService(t, 0)
	targetRoot := filepath.Join(filepath.Dir(sourceRoot), "target")
	if err := os.Mkdir(targetRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	target, err := service.sources.Create(sources.CreateInput{Name: "target", RootPath: targetRoot})
	if err != nil {
		t.Fatal(err)
	}
	userID := insertTransferUser(t, service, 20)
	if _, err := service.Mkdir(source, "", "docs"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "docs", "one.txt", strings.NewReader("one"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}

	tooSmall := int64(2)
	if _, err := service.sources.Update(target.Key, sources.UpdateInput{QuotaBytes: &tooSmall}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Copy(source, target, "docs", "copied", &userID); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("copy over target quota error=%v", err)
	}
	if _, err := os.Stat(filepath.Join(targetRoot, "copied")); !os.IsNotExist(err) {
		t.Fatalf("rejected copy left target: %v", err)
	}

	enough := int64(10)
	target, err = service.sources.Update(target.Key, sources.UpdateInput{QuotaBytes: &enough})
	if err != nil {
		t.Fatal(err)
	}
	result, err := service.Copy(source, target, "docs", "copied", &userID)
	if err != nil {
		t.Fatalf("copy: %v", err)
	}
	if result.Files != 1 || result.Bytes != 3 || result.Path != "copied" || result.WasMove {
		t.Fatalf("unexpected result: %+v", result)
	}
	content, err := os.ReadFile(filepath.Join(targetRoot, "copied", "one.txt"))
	if err != nil || string(content) != "one" {
		t.Fatalf("copied content=%q err=%v", content, err)
	}
	assertFileRecord(t, service, target.ID, "copied/one.txt", "copied/one.txt", 3, models.FileOwnerUser, &userID)
	entries, err := os.ReadDir(service.copyOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("successful copy left recovery artifacts: %+v", entries)
	}
	usage, err := service.UserUsage(userID)
	if err != nil || usage != 6 {
		t.Fatalf("usage after copy=%d err=%v", usage, err)
	}
}

func TestMoveAcrossSourcesPreservesOwnershipAndImageLocation(t *testing.T) {
	service, source, sourceRoot := newQuotaTestService(t, 0)
	targetRoot := filepath.Join(filepath.Dir(sourceRoot), "move-target")
	if err := os.Mkdir(targetRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	target, err := service.sources.Create(sources.CreateInput{Name: "move-target", RootPath: targetRoot})
	if err != nil {
		t.Fatal(err)
	}
	userID := insertTransferUser(t, service, 4)
	if _, _, err := service.UploadWithLockTokens(source, "", "image.jpg", strings.NewReader("data"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES ('img-transfer', 'user', ?, ?, 'image.jpg', 'image.jpg', '/i/img-transfer.jpg', 4,
   'image/jpeg', 1, 1, 'jpg', CURRENT_TIMESTAMP)`, userID, source.ID); err != nil {
		t.Fatal(err)
	}

	result, err := service.MoveAcrossSources(source, target, "image.jpg", "archive/image.jpg", &userID)
	if !errors.Is(err, ErrInvalid) {
		// Parent creation is deliberately explicit; this verifies that transfers never invent destination hierarchy.
		t.Fatalf("missing parent error=%v result=%+v", err, result)
	}
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	result, err = service.MoveAcrossSources(source, target, "image.jpg", "archive/image.jpg", &userID)
	if err != nil {
		t.Fatalf("move: %v", err)
	}
	if !result.WasMove || result.Files != 1 || result.Bytes != 4 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if _, err := os.Stat(filepath.Join(sourceRoot, "image.jpg")); !os.IsNotExist(err) {
		t.Fatalf("source still exists: %v", err)
	}
	assertFileRecord(t, service, target.ID, "archive/image.jpg", "archive/image.jpg", 4, models.FileOwnerUser, &userID)
	var sourceCount, imageSourceID int64
	var imagePath string
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ?`, source.ID).Scan(&sourceCount); err != nil || sourceCount != 0 {
		t.Fatalf("source records=%d err=%v", sourceCount, err)
	}
	if err := service.db.QueryRow(`SELECT storage_source_id, relative_path FROM images WHERE image_id = 'img-transfer'`).Scan(&imageSourceID, &imagePath); err != nil {
		t.Fatal(err)
	}
	if imageSourceID != target.ID || imagePath != "archive/image.jpg" {
		t.Fatalf("image location=%d/%s", imageSourceID, imagePath)
	}
	entries, err := os.ReadDir(service.transferOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("successful move left recovery artifacts: %+v", entries)
	}
	usage, err := service.UserUsage(userID)
	if err != nil || usage != 4 {
		t.Fatalf("usage after move=%d err=%v", usage, err)
	}
}

func insertTransferUser(t *testing.T, service *Service, quota int64) int64 {
	t.Helper()
	const userID int64 = 91
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-transfer', 'transfer', 'Transfer', 'hash', 'user', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, userID, quota); err != nil {
		t.Fatal(err)
	}
	return userID
}
