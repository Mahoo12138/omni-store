package imagebed

import (
	"bytes"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/managedroot"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

// IMG-03/IMG-05：新图写入托管命名空间，台账带 image_bed scope，用户计费不重复。
func TestUploadStoresManagedLayoutAndLedgerScope(t *testing.T) {
	service, _, source, user, _, root := newImageLifecycleFixture(t)

	imageRecord, err := service.UploadForUser(user, "managed.png", bytes.NewReader(testPNGBytes(t)))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(imageRecord.RelativePath, security.ManagedNamespaceSegment+"/image-bed/users/") {
		t.Fatalf("new image path %q is not under the managed image-bed root", imageRecord.RelativePath)
	}
	physical := filepath.Join(root, filepath.FromSlash(imageRecord.RelativePath))
	if _, err := os.Stat(physical); err != nil {
		t.Fatalf("managed physical image missing: %v", err)
	}

	var scope string
	if err := service.db.QueryRow(`SELECT resource_scope FROM file_records
  WHERE storage_source_id = ? AND relative_path = ?`,
		source.ID, imageRecord.RelativePath).Scan(&scope); err != nil {
		t.Fatal(err)
	}
	if scope != models.FileRecordScopeImageBed {
		t.Fatalf("ledger scope=%q, want image_bed", scope)
	}

	usage, err := service.files.UserUsage(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if usage != int64(len(testPNGBytes(t))) {
		t.Fatalf("user usage=%d, want counted exactly once (%d)", usage, len(testPNGBytes(t)))
	}

	// 托管内容对通用文件入口不可见。
	if _, err := service.files.Stat(source, imageRecord.RelativePath); !errors.Is(err, files.ErrNotFound) {
		t.Fatalf("files.Stat on managed image = %v, want ErrNotFound", err)
	}
	listing, err := service.files.List(source, security.ManagedNamespaceSegment, files.ListOptions{}, true)
	if !errors.Is(err, files.ErrNotFound) {
		t.Fatalf("files.List managed root = %v, want ErrNotFound", err)
	}
	_ = listing
}

// IMG-03：旧 /i/ ID 按自身记录读取，不重新映射到新根。
func TestLegacyImageRecordKeepsServingFromRecordedPath(t *testing.T) {
	service, _, _, _, _, root := newImageLifecycleFixture(t)
	legacyRel := "images/users/legacy/2026/08/old.png"
	legacyAbs := filepath.Join(root, filepath.FromSlash(legacyRel))
	if err := os.MkdirAll(filepath.Dir(legacyAbs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyAbs, testPNGBytes(t), 0o600); err != nil {
		t.Fatal(err)
	}
	legacyID := "img_legacy0000000000000001"
	if _, err := service.db.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, public_url, size, mime_type, width, height, ext, created_at)
  VALUES (?, 'user', NULL, (SELECT id FROM storage_sources LIMIT 1), ?, ?, ?, 'image/png', 2, 2, 'png', datetime('now'))`,
		legacyID, legacyRel, "https://store.example.test/i/"+legacyID+".png", len(testPNGBytes(t))); err != nil {
		t.Fatal(err)
	}

	img, f, info, unlock, err := service.OpenImage(legacyID, "png")
	if err != nil {
		t.Fatalf("legacy image must still serve from its recorded path: %v", err)
	}
	_ = f.Close()
	unlock()
	if img.RelativePath != legacyRel || info.Size() != int64(len(testPNGBytes(t))) {
		t.Fatalf("legacy image=%+v", img)
	}
}

// IMG-04：保留策略独立、默认不自动过期，上传结果返回绝对失效时间。
func TestRetentionControlsExpiry(t *testing.T) {
	service, _, _, user, _, _ := newImageLifecycleFixture(t)

	userImage, err := service.UploadForUser(user, "no-expiry.png", bytes.NewReader(testPNGBytes(t)))
	if err != nil {
		t.Fatal(err)
	}
	if userImage.ExpiresAt != nil {
		t.Fatalf("default retention must not expire, got %v", userImage.ExpiresAt)
	}

	// 匿名入口默认关闭；测试中显式开启。
	if err := service.SetAnonymousSettings(true); err != nil {
		t.Fatal(err)
	}
	if err := service.SetRetentionSettings(30, 7); err != nil {
		t.Fatal(err)
	}
	gotUserDays, gotAnonymousDays, err := service.RetentionSettings()
	if err != nil || gotUserDays != 30 || gotAnonymousDays != 7 {
		t.Fatalf("retention settings=%d/%d err=%v", gotUserDays, gotAnonymousDays, err)
	}
	if err := service.SetRetentionSettings(-1, 0); !errors.Is(err, ErrRetentionInvalid) {
		t.Fatalf("negative retention error=%v", err)
	}

	anonymousImage, err := service.UploadAnonymous("anon.png", bytes.NewReader(testPNGBytes(t)))
	if err != nil {
		t.Fatal(err)
	}
	if anonymousImage.ExpiresAt == nil {
		t.Fatal("anonymous image missing expires_at")
	}
	want := time.Now().UTC().AddDate(0, 0, 7)
	if diff := anonymousImage.ExpiresAt.Sub(want); diff > 2*time.Minute || diff < -2*time.Minute {
		t.Fatalf("anonymous expires_at=%v, want ~%v", anonymousImage.ExpiresAt, want)
	}
	userImage2, err := service.UploadForUser(user, "user-expiry.png", bytes.NewReader(testPNGBytes(t)))
	if err != nil {
		t.Fatal(err)
	}
	if userImage2.ExpiresAt == nil {
		t.Fatal("user image missing expires_at after retention enabled")
	}

	// 过期图片不再公开提供（原图与缩略图一致）。
	expired := &models.Image{
		ID: 99999, ImageID: "img_expired00000000000001", OwnerType: models.ImageOwnerAnonymous,
		StorageSourceID: anonymousImage.StorageSourceID, RelativePath: anonymousImage.RelativePath,
		PublicURL: anonymousImage.PublicURL, Size: anonymousImage.Size, MimeType: "image/png",
		Width: 2, Height: 2, Ext: "png", ExpiresAt: &[]time.Time{time.Now().UTC().Add(-time.Hour)}[0],
	}
	service.insertExpiredImageForTest(t, expired)
	if _, _, _, _, err := service.OpenImage(expired.ImageID, "png"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired image error=%v, want ErrNotFound", err)
	}
	if _, _, _, _, err := service.OpenThumbnail(t.Context(), expired.ImageID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired thumbnail error=%v, want ErrNotFound", err)
	}
}

// IMG-05：普通 Reconcile 与 FTS 都不处理 image_bed scope 台账。
func TestReconcileAndSearchIgnoreImageBedScope(t *testing.T) {
	service, _, source, user, _, root := newImageLifecycleFixture(t)
	imageRecord, err := service.UploadForUser(user, "scoped.png", bytes.NewReader(testPNGBytes(t)))
	if err != nil {
		t.Fatal(err)
	}
	// 旧布局的图片行：物理文件已不存在，scope 保护其不被普通校准删除。
	legacyRel := "images/users/gone/2026/07/missing.png"
	if _, err := service.db.Exec(`INSERT INTO file_records
  (storage_source_id, relative_path, size, owner_type, mtime_unix_nano, record_status, resource_scope, created_at, updated_at)
  VALUES (?, ?, 9, 'user', 0, 'active', 'image_bed', datetime('now'), datetime('now'))`,
		source.ID, legacyRel); err != nil {
		t.Fatal(err)
	}

	if _, err := service.files.ReconcileSource(source); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records
  WHERE storage_source_id = ? AND relative_path IN (?, ?)`,
		source.ID, imageRecord.RelativePath, legacyRel).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("image ledger rows must survive reconcile, kept=%d", count)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(imageRecord.RelativePath))); err != nil {
		t.Fatalf("managed image must survive reconcile: %v", err)
	}

	// 普通搜索不返回 image_bed scope 行。
	if _, err := service.sources.CreatePolicy(sources.PolicyInput{
		Name:    "Managed search",
		UserIDs: []int64{user.ID},
		Sources: []sources.PolicySourceInput{{SourceKey: source.Key, Permission: models.PermissionReadWrite}},
	}); err != nil {
		t.Fatal(err)
	}
	result, err := service.files.SearchFiles(user, files.SearchOptions{Query: "scoped", Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 0 {
		t.Fatalf("FTS leaked image bed rows: %+v", result.Items)
	}
}

// 托管根被未知同名目录占据时，上传被阻断且不触碰他人数据。
func TestUploadBlockedByUnknownManagedRoot(t *testing.T) {
	service, _, _, user, _, root := newImageLifecycleFixture(t)
	unknown := filepath.Join(root, security.ManagedNamespaceSegment, "mystery")
	if err := os.MkdirAll(unknown, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(unknown, "keep.txt"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := service.UploadForUser(user, "blocked.png", bytes.NewReader(testPNGBytes(t)))
	if err == nil || !errors.Is(err, managedroot.ErrUnknownRoot) {
		t.Fatalf("upload error=%v, want unknown-root block", err)
	}
	content, readErr := os.ReadFile(filepath.Join(unknown, "keep.txt"))
	if readErr != nil || string(content) != "keep" {
		t.Fatalf("unknown root data touched: %q err=%v", content, readErr)
	}
	var uploads int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM images`).Scan(&uploads); err != nil && !errors.Is(err, sql.ErrNoRows) {
		t.Fatal(err)
	}
	if uploads != 0 {
		t.Fatalf("blocked upload left image rows: %d", uploads)
	}
}

// insertExpiredImageForTest 直接登记一条已过期的图片记录。
func (s *Service) insertExpiredImageForTest(t *testing.T, img *models.Image) {
	t.Helper()
	_, err := s.db.Exec(`INSERT INTO images
  (image_id, owner_type, storage_source_id, relative_path, public_url, size, mime_type, width, height, ext, expires_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		img.ImageID, img.OwnerType, img.StorageSourceID, img.RelativePath, img.PublicURL,
		img.Size, img.MimeType, img.Width, img.Height, img.Ext, img.ExpiresAt)
	if err != nil {
		t.Fatal(err)
	}
}
