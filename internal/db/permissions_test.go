package db

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestOpenCreatesPrivateDatabaseAndDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "database")
	path := filepath.Join(dir, "omnistore.db")
	conn, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	assertPrivatePathMode(t, dir, 0o700)
	assertPrivatePathMode(t, path, 0o600)
	for _, suffix := range []string{"-wal", "-shm"} {
		sidecar := path + suffix
		info, err := os.Lstat(sidecar)
		if err != nil {
			t.Fatalf("SQLite sidecar %s missing: %v", sidecar, err)
		}
		if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 {
			t.Fatalf("SQLite sidecar %s mode=%s", sidecar, info.Mode())
		}
	}
}

func TestOpenTightensExistingDatabasePermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "wide.db")
	if err := os.WriteFile(path, nil, 0o666); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o666); err != nil {
		t.Fatal(err)
	}

	conn, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	assertPrivatePathMode(t, path, 0o600)
}

func TestOpenRejectsSymlinkDatabasePath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("符号链接权限依赖 Unix 测试环境")
	}
	dir := t.TempDir()
	target := filepath.Join(dir, "target.db")
	if err := os.WriteFile(target, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "omnistore.db")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}

	if _, err := Open(link); err == nil || !strings.Contains(err.Error(), "不能是符号链接") {
		t.Fatalf("expected symlink rejection, got %v", err)
	}
}

func assertPrivatePathMode(t *testing.T, path string, want os.FileMode) {
	t.Helper()
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != want {
		t.Fatalf("path %s mode=%s want=%#o", path, info.Mode(), want)
	}
}
