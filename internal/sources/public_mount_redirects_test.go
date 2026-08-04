package sources

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
)

func boolPtr(v bool) *bool       { return &v }
func stringPtr(v string) *string { return &v }

func newSourceService(t *testing.T) (*Service, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return NewService(conn, dataDir), base
}

func createTestSource(t *testing.T, service *Service, base, name string) *models.StorageSource {
	t.Helper()
	root := filepath.Join(base, name)
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	source, err := service.Create(CreateInput{Name: name, RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	return source
}

func TestUpdatePublicMountPathKeepsRedirectAndReservesOldPath(t *testing.T) {
	service, base := newSourceService(t)
	sourceOne := createTestSource(t, service, base, "source-one")
	sourceTwo := createTestSource(t, service, base, "source-two")

	if _, err := service.Update(sourceOne.Key, UpdateInput{
		PublicReadEnabled: boolPtr(true), PublicMountPath: stringPtr("/photos"),
	}); err != nil {
		t.Fatalf("set initial mount: %v", err)
	}
	if _, err := service.Update(sourceOne.Key, UpdateInput{PublicMountPath: stringPtr("/archive")}); err != nil {
		t.Fatalf("rename mount: %v", err)
	}

	var redirectSource int64
	if err := service.db.QueryRow(`SELECT storage_source_id FROM public_mount_redirects WHERE mount_path = '/photos'`).Scan(&redirectSource); err != nil {
		t.Fatalf("query redirect: %v", err)
	}
	if redirectSource != sourceOne.ID {
		t.Fatalf("unexpected redirect owner: %d", redirectSource)
	}

	if _, err := service.Update(sourceTwo.Key, UpdateInput{
		PublicReadEnabled: boolPtr(true), PublicMountPath: stringPtr("/photos/team"),
	}); err == nil {
		t.Fatal("expected old mount path to remain reserved")
	}
}

func TestUpdatePublicMountPathCanRestoreOwnRedirect(t *testing.T) {
	service, base := newSourceService(t)
	sourceOne := createTestSource(t, service, base, "source-one")

	if _, err := service.Update(sourceOne.Key, UpdateInput{
		PublicReadEnabled: boolPtr(true), PublicMountPath: stringPtr("/photos"),
	}); err != nil {
		t.Fatalf("set initial mount: %v", err)
	}
	if _, err := service.Update(sourceOne.Key, UpdateInput{PublicMountPath: stringPtr("/archive")}); err != nil {
		t.Fatalf("rename mount: %v", err)
	}
	if _, err := service.Update(sourceOne.Key, UpdateInput{PublicMountPath: stringPtr("/photos")}); err != nil {
		t.Fatalf("restore old mount: %v", err)
	}

	var count int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM public_mount_redirects
	  WHERE storage_source_id = ? AND mount_path = '/photos'`, sourceOne.ID).Scan(&count); err != nil {
		t.Fatalf("count restored redirect: %v", err)
	}
	if count != 0 {
		t.Fatalf("restored current path must not remain a redirect: %d", count)
	}
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM public_mount_redirects
	  WHERE storage_source_id = ? AND mount_path = '/archive'`, sourceOne.ID).Scan(&count); err != nil {
		t.Fatalf("count previous redirect: %v", err)
	}
	if count != 1 {
		t.Fatalf("previous current path should become a redirect: %d", count)
	}
}

func TestDeleteSourceRemovesPublicMountRedirects(t *testing.T) {
	service, base := newSourceService(t)
	sourceOne := createTestSource(t, service, base, "source-one")
	if _, err := service.Update(sourceOne.Key, UpdateInput{
		PublicReadEnabled: boolPtr(true), PublicMountPath: stringPtr("/photos"),
	}); err != nil {
		t.Fatalf("set initial mount: %v", err)
	}
	if _, err := service.Update(sourceOne.Key, UpdateInput{PublicMountPath: stringPtr("/archive")}); err != nil {
		t.Fatalf("rename mount: %v", err)
	}
	if err := service.Delete(sourceOne.Key); err != nil {
		t.Fatalf("delete source: %v", err)
	}

	var count int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM public_mount_redirects WHERE storage_source_id = ?`, sourceOne.ID).Scan(&count); err != nil {
		t.Fatalf("count redirects: %v", err)
	}
	if count != 0 {
		t.Fatalf("redirects were not removed: %d", count)
	}
}
