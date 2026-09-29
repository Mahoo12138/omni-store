package publicdisk

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/sources"
)

// /public 固定映射全局绑定的唯一 Source；未开启/禁用一律按不存在处理。
func TestPublicDriveSingleBindingResolveAndBrowse(t *testing.T) {
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

	fileService := files.NewService(conn, sourceService, locks.NewManager())
	capabilityService := capabilities.NewService(conn, sourceService)
	service := NewService(fileService, capabilityService)

	// 未绑定时公开盘不可用。
	if _, _, err := service.Resolve("hello.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unbound Resolve() error=%v", err)
	}
	summary, err := service.Summary()
	if err != nil || summary.Enabled {
		t.Fatalf("unbound Summary()=%+v err=%v", summary, err)
	}

	enabled := true
	if _, err := capabilityService.UpdateBinding(capabilities.CapabilityPublicDrive, capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &publicSource.Key,
	}); err != nil {
		t.Fatal(err)
	}

	resolved, rel, err := service.Resolve("")
	if err != nil || resolved.ID != publicSource.ID || rel != "" {
		t.Fatalf("Resolve(root) source=%+v rel=%q err=%v", resolved, rel, err)
	}
	resolved, rel, err = service.Resolve("docs/guide.md")
	if err != nil || resolved.ID != publicSource.ID || rel != "docs/guide.md" {
		t.Fatalf("Resolve(child) source=%+v rel=%q err=%v", resolved, rel, err)
	}
	// 路径穿越在解析层拒绝；托管命名空间由 files 层统一 404。
	for _, path := range []string{"../escape"} {
		if _, _, err := service.Resolve(path); !errors.Is(err, ErrNotFound) {
			t.Errorf("Resolve(%q) error=%v", path, err)
		}
	}
	if _, err := service.List(".omnistore/x", files.ListOptions{}); !errors.Is(err, files.ErrNotFound) {
		t.Errorf("List managed namespace error=%v, want ErrNotFound", err)
	}

	listing, err := service.List("", files.ListOptions{Page: 1, PageSize: 20, Sort: "name", Order: "asc"})
	if err != nil || listing.Total != 2 || len(listing.Items) != 2 || listing.Items[0].Name != "docs" || listing.Items[1].Name != "hello.txt" {
		t.Fatalf("List()=%+v, %v", listing, err)
	}
	if service.Files() != fileService {
		t.Fatal("Files() did not return the shared file service")
	}
	summary, err = service.Summary()
	if err != nil || !summary.Enabled || summary.SourceKey != publicSource.Key {
		t.Fatalf("enabled Summary()=%+v err=%v", summary, err)
	}

	// 禁用源后公开盘整体不可用。
	if err := sourceService.SetDisabled(publicSource.Key, true); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.Resolve("hello.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("disabled source Resolve() error=%v", err)
	}

	// 关闭能力后同样不可用。
	if err := sourceService.SetDisabled(publicSource.Key, false); err != nil {
		t.Fatal(err)
	}
	disabled := false
	if _, err := capabilityService.UpdateBinding(capabilities.CapabilityPublicDrive, capabilities.UpdateInput{
		Enabled: &disabled,
	}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.Resolve("hello.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("disabled capability Resolve() error=%v", err)
	}
}
