package publicdisk

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestListMountsResolveAndBrowse(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	sourceService := sources.NewService(conn, dataDir)

	publicRoot := filepath.Join(base, "public")
	if err := os.MkdirAll(filepath.Join(publicRoot, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(publicRoot, "hello.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(publicRoot, "docs", "guide.md"), []byte("guide"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(publicRoot, "hello.txt"), filepath.Join(publicRoot, "hidden-link")); err != nil {
		t.Logf("symlink fixture unavailable: %v", err)
	}
	publicSource, err := sourceService.Create(sources.CreateInput{
		Name: "Public files", Description: "Public fixture", RootPath: publicRoot, ImportExisting: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	publicEnabled, publicMount := true, "/public"
	publicSource, err = sourceService.Update(publicSource.Key, sources.UpdateInput{PublicReadEnabled: &publicEnabled, PublicMountPath: &publicMount})
	if err != nil {
		t.Fatal(err)
	}

	secondRoot := filepath.Join(base, "second")
	if err := os.Mkdir(secondRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	second, err := sourceService.Create(sources.CreateInput{Name: "Second", RootPath: secondRoot})
	if err != nil {
		t.Fatal(err)
	}
	secondMount := "/zeta"
	if _, err := sourceService.Update(second.Key, sources.UpdateInput{PublicReadEnabled: &publicEnabled, PublicMountPath: &secondMount}); err != nil {
		t.Fatal(err)
	}

	fileService := files.NewService(conn, sourceService, locks.NewManager())
	service := NewService(conn, sourceService, fileService)
	mounts, err := service.ListMounts()
	if err != nil || len(mounts) != 2 || mounts[0].MountPath != "/public" || mounts[0].Description != "Public fixture" || mounts[1].MountPath != "/zeta" {
		t.Fatalf("ListMounts()=%+v, %v", mounts, err)
	}
	resolved, inner, err := service.Resolve("/public")
	if err != nil || resolved.ID != publicSource.ID || inner != "" {
		t.Fatalf("Resolve(root) source=%+v inner=%q err=%v", resolved, inner, err)
	}
	resolved, inner, err = service.Resolve("public/docs/guide.md")
	if err != nil || resolved.ID != publicSource.ID || inner != "docs/guide.md" {
		t.Fatalf("Resolve(child) source=%+v inner=%q err=%v", resolved, inner, err)
	}
	for _, path := range []string{"", "/", "/publicity/file.txt", "/../public"} {
		if _, _, err := service.Resolve(path); !errors.Is(err, ErrNotFound) {
			t.Errorf("Resolve(%q) error=%v", path, err)
		}
	}

	listing, err := service.List("/public", files.ListOptions{Page: 1, PageSize: 20, Sort: "name", Order: "asc"})
	if err != nil || listing.Total != 2 || len(listing.Items) != 2 || listing.Items[0].Name != "docs" || listing.Items[1].Name != "hello.txt" {
		t.Fatalf("List()=%+v, %v", listing, err)
	}
	if service.Files() != fileService {
		t.Fatal("Files() did not return the shared file service")
	}

	if err := sourceService.SetDisabled(publicSource.Key, true); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.Resolve("/public/hello.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("disabled source Resolve() error=%v", err)
	}
	mounts, err = service.ListMounts()
	if err != nil || len(mounts) != 1 || mounts[0].MountPath != "/zeta" {
		t.Fatalf("disabled ListMounts()=%+v, %v", mounts, err)
	}
}

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
	source, err := sourceService.Create(sources.CreateInput{Name: "photo-source", RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	publicEnabled := true
	oldPath := "/photos"
	newPath := "/archive"
	if _, err := sourceService.Update(source.Key, sources.UpdateInput{
		PublicReadEnabled: &publicEnabled, PublicMountPath: &oldPath,
	}); err != nil {
		t.Fatalf("set initial mount: %v", err)
	}
	if _, err := sourceService.Update(source.Key, sources.UpdateInput{PublicMountPath: &newPath}); err != nil {
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

	if err := sourceService.SetDisabled(source.Key, true); err != nil {
		t.Fatalf("disable source: %v", err)
	}
	if _, ok, err := service.RedirectPath("/photos/2026/a.jpg"); err != nil || ok {
		t.Fatalf("disabled source redirect remained active: ok=%v err=%v", ok, err)
	}

	if err := sourceService.SetDisabled(source.Key, false); err != nil {
		t.Fatalf("enable source: %v", err)
	}
	publicEnabled = false
	if _, err := sourceService.Update(source.Key, sources.UpdateInput{PublicReadEnabled: &publicEnabled}); err != nil {
		t.Fatalf("disable public access: %v", err)
	}
	if _, ok, err := service.RedirectPath("/photos/2026/a.jpg"); err != nil || ok {
		t.Fatalf("private source redirect remained active: ok=%v err=%v", ok, err)
	}
}
