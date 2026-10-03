package sources

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
)

// 备份恢复/磁盘迁移后：重新绑定源根路径（ValidateRootPath 全规则 + 拓扑锁）。
func TestUpdateRootPathRebindsSource(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	service := NewService(conn, dataDir)

	oldRoot := filepath.Join(base, "old")
	newRoot := filepath.Join(base, "new")
	for _, dir := range []string{oldRoot, newRoot} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	source, err := service.Create(CreateInput{Name: "Migrated", RootPath: oldRoot})
	if err != nil {
		t.Fatal(err)
	}

	rebound, err := service.UpdateRootPath(source.Key, newRoot)
	if err != nil {
		t.Fatal(err)
	}
	// ValidateRootPath 返回符号链接解析后的真实路径。
	resolvedNew, err := filepath.EvalSymlinks(newRoot)
	if err != nil {
		t.Fatal(err)
	}
	if rebound.RootPath != resolvedNew {
		t.Fatalf("root=%q, want %q", rebound.RootPath, resolvedNew)
	}

	// 旧路径不再占用：可以创建源。
	resolvedOld, err := filepath.EvalSymlinks(oldRoot)
	if err != nil {
		t.Fatal(err)
	}
	reuse, err := service.Create(CreateInput{Name: "Reuse", RootPath: resolvedOld})
	if err != nil {
		t.Fatalf("old root must be reusable: %v", err)
	}
	_ = reuse

	// 拒绝与其他源重叠、不存在的路径。
	if _, err := service.UpdateRootPath(source.Key, reuse.RootPath); err == nil {
		t.Fatal("overlapping root must be rejected")
	}
	if _, err := service.UpdateRootPath(source.Key, filepath.Join(base, "missing")); err == nil {
		t.Fatal("missing root must be rejected")
	}
	// 拒绝数据目录。
	if _, err := service.UpdateRootPath(source.Key, dataDir); err == nil {
		t.Fatal("data dir must be rejected")
	}
	// 未知源。
	if _, err := service.UpdateRootPath("src-unknown", newRoot); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown source error=%v", err)
	}
}
