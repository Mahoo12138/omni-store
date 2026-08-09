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

func TestTrashRestoreAndPurgePreserveOwnershipAndImageRecord(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := int64(101)
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-trash', 'trash', 'Trash', 'hash', 'user', 0, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, userID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "", "photo.jpg", strings.NewReader("data"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.db.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES ('img-trash', 'user', ?, ?, 'photo.jpg', 'photo.jpg', '/i/img-trash.jpg', 4,
   'image/jpeg', 1, 1, 'jpg', CURRENT_TIMESTAMP)`, userID, source.ID); err != nil {
		t.Fatal(err)
	}

	entry, err := service.MoveToTrash(source, "photo.jpg", userID)
	if err != nil {
		t.Fatalf("trash: %v", err)
	}
	if entry.Size != 4 || entry.FileCount != 1 || entry.EntryType != TypeFile {
		t.Fatalf("unexpected entry: %+v", entry)
	}
	if _, err := os.Stat(filepath.Join(root, "photo.jpg")); !os.IsNotExist(err) {
		t.Fatalf("source still exists: %v", err)
	}
	if _, err := os.Stat(service.trashPayloadPath(entry.Key)); err != nil {
		t.Fatalf("trash payload: %v", err)
	}
	usage, err := service.UserUsage(userID)
	if err != nil || usage != 4 {
		t.Fatalf("trash must retain user quota usage=%d err=%v", usage, err)
	}
	storageUsage, err := service.StorageUsage(source)
	if err != nil || storageUsage != 0 {
		t.Fatalf("trash must release source usage=%d err=%v", storageUsage, err)
	}
	var imageTrashKey *string
	if err := service.db.QueryRow(`SELECT trash_key FROM images WHERE image_id = 'img-trash'`).Scan(&imageTrashKey); err != nil || imageTrashKey == nil || *imageTrashKey != entry.Key {
		t.Fatalf("image trash key=%v err=%v", imageTrashKey, err)
	}

	lowQuota := int64(3)
	if _, err := service.sources.Update(source.Key, sources.UpdateInput{QuotaBytes: &lowQuota}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RestoreTrash(source, entry.Key, "", userID); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("restore over source quota error=%v", err)
	}
	if _, err := os.Stat(service.trashPayloadPath(entry.Key)); err != nil {
		t.Fatalf("failed restore removed trash payload: %v", err)
	}

	enoughQuota := int64(10)
	source, err = service.sources.Update(source.Key, sources.UpdateInput{QuotaBytes: &enoughQuota})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.RestoreTrash(source, entry.Key, "restored.jpg", userID); err != nil {
		t.Fatalf("restore: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(root, "restored.jpg"))
	if err != nil || string(content) != "data" {
		t.Fatalf("restored content=%q err=%v", content, err)
	}
	assertFileRecord(t, service, source.ID, "restored.jpg", "restored.jpg", 4, models.FileOwnerUser, &userID)
	var imagePath string
	if err := service.db.QueryRow(`SELECT relative_path FROM images WHERE image_id = 'img-trash' AND trash_key IS NULL`).Scan(&imagePath); err != nil || imagePath != "restored.jpg" {
		t.Fatalf("restored image path=%q err=%v", imagePath, err)
	}

	entry, err = service.MoveToTrash(source, "restored.jpg", userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.PurgeTrash(source, entry.Key); err != nil {
		t.Fatalf("purge: %v", err)
	}
	usage, err = service.UserUsage(userID)
	if err != nil || usage != 0 {
		t.Fatalf("purge must release user quota usage=%d err=%v", usage, err)
	}
	var records, images int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE trash_key = ?`, entry.Key).Scan(&records); err != nil || records != 0 {
		t.Fatalf("remaining file records=%d err=%v", records, err)
	}
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM images WHERE image_id = 'img-trash'`).Scan(&images); err != nil || images != 0 {
		t.Fatalf("remaining images=%d err=%v", images, err)
	}
}

func TestTrashDirectoryRejectsExcludedDescendantWithoutPartialMove(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := int64(102)
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-trash-excluded', 'trash-excluded', 'Trash Excluded', 'hash', 'user', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, userID); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "folder")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.MoveToTrash(source, "folder", userID); !errors.Is(err, ErrPathExcluded) {
		t.Fatalf("excluded descendant error=%v", err)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("rejected trash changed source: %v", err)
	}
	count, err := service.SourceTrashCount(source.ID)
	if err != nil || count != 0 {
		t.Fatalf("trash entries=%d err=%v", count, err)
	}
}

func TestTrashRestoreRechecksExcludedDescendantsAtNewPath(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := int64(103)
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-trash-restore', 'trash-restore', 'Trash Restore', 'hash', 'user', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, userID); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "folder")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "note.txt"), []byte("note"), 0o600); err != nil {
		t.Fatal(err)
	}
	entry, err := service.MoveToTrash(source, "folder", userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.sources.SetExcludePatterns(source.ID, []string{"restored/note.txt"}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RestoreTrash(source, entry.Key, "restored", userID); !errors.Is(err, ErrPathExcluded) {
		t.Fatalf("restore excluded descendant error=%v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "restored")); !os.IsNotExist(err) {
		t.Fatalf("rejected restore created target: %v", err)
	}
	if _, err := os.Stat(service.trashPayloadPath(entry.Key)); err != nil {
		t.Fatalf("rejected restore removed payload: %v", err)
	}
}
