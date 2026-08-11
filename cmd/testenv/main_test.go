package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestWritePrivateTestFileTightensExistingPermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "credentials.txt")
	if err := os.WriteFile(path, []byte("old"), 0o666); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o666); err != nil {
		t.Fatal(err)
	}

	if err := writePrivateTestFile(path, []byte("secret")); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("credential mode=%s", info.Mode())
	}
	if content, err := os.ReadFile(path); err != nil || string(content) != "secret" {
		t.Fatalf("credential content=%q err=%v", content, err)
	}
}

func TestWritePrivateTestFileRejectsSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("符号链接权限依赖 Unix 测试环境")
	}
	dir := t.TempDir()
	target := filepath.Join(dir, "target.txt")
	if err := os.WriteFile(target, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "credentials.txt")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}

	if err := writePrivateTestFile(link, []byte("overwrite")); err == nil {
		t.Fatal("symlinked credential path was accepted")
	}
	if content, err := os.ReadFile(target); err != nil || string(content) != "keep" {
		t.Fatalf("symlink target changed=%q err=%v", content, err)
	}
}
