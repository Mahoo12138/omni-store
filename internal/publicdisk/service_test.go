package publicdisk

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestRedirectPathPreservesInnerPathAndChecksSourceStatus(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	root := filepath.Join(base, "photos")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	sourceService := sources.NewService(conn, dataDir)
	if _, err := sourceService.Create(sources.CreateInput{SourceID: "photo-source", RootPath: root}); err != nil {
		t.Fatalf("create source: %v", err)
	}
	publicEnabled := true
	oldPath := "/photos"
	newPath := "/archive"
	if _, err := sourceService.Update("photo-source", sources.UpdateInput{
		PublicReadEnabled: &publicEnabled, PublicMountPath: &oldPath,
	}); err != nil {
		t.Fatalf("set initial mount: %v", err)
	}
	if _, err := sourceService.Update("photo-source", sources.UpdateInput{PublicMountPath: &newPath}); err != nil {
		t.Fatalf("rename mount: %v", err)
	}

	fileService := files.NewService(conn, sourceService, locks.NewManager())
	service := NewService(conn, sourceService, fileService)
	target, ok, err := service.RedirectPath("/photos/2026/a.jpg")
	if err != nil {
		t.Fatalf("resolve redirect: %v", err)
	}
	if !ok || target != "/archive/2026/a.jpg" {
		t.Fatalf("unexpected redirect: target=%q ok=%v", target, ok)
	}
	if _, ok, err := service.RedirectPath("/archive/2026/a.jpg"); err != nil || ok {
		t.Fatalf("current mount unexpectedly redirected: ok=%v err=%v", ok, err)
	}

	if err := sourceService.SetDisabled("photo-source", true); err != nil {
		t.Fatalf("disable source: %v", err)
	}
	if _, ok, err := service.RedirectPath("/photos/2026/a.jpg"); err != nil || ok {
		t.Fatalf("disabled source redirect remained active: ok=%v err=%v", ok, err)
	}

	if err := sourceService.SetDisabled("photo-source", false); err != nil {
		t.Fatalf("enable source: %v", err)
	}
	publicEnabled = false
	if _, err := sourceService.Update("photo-source", sources.UpdateInput{PublicReadEnabled: &publicEnabled}); err != nil {
		t.Fatalf("disable public access: %v", err)
	}
	if _, ok, err := service.RedirectPath("/photos/2026/a.jpg"); err != nil || ok {
		t.Fatalf("private source redirect remained active: ok=%v err=%v", ok, err)
	}
}
