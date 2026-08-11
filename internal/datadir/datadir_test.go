package datadir

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPrepareCreatesAndTightensPrivateDirectories(t *testing.T) {
	root := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(filepath.Join(root, "cache"), 0o777); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(root, "cache"), 0o777); err != nil {
		t.Fatal(err)
	}

	if err := Prepare(root); err != nil {
		t.Fatal(err)
	}
	for _, path := range append([]string{root}, subdirectoryPaths(root)...) {
		info, err := os.Lstat(path)
		if err != nil {
			t.Fatal(err)
		}
		if !info.IsDir() || info.Mode().Perm() != 0o700 {
			t.Fatalf("directory %s mode=%s", path, info.Mode())
		}
	}
}

func TestPrepareRejectsSymlinkedSubdirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("符号链接权限依赖 Unix 测试环境")
	}
	base := t.TempDir()
	root := filepath.Join(base, "data")
	target := filepath.Join(base, "outside")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(root, "cache")); err != nil {
		t.Fatal(err)
	}

	if err := Prepare(root); err == nil {
		t.Fatal("symlinked system subdirectory was accepted")
	}
	info, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Fatalf("symlink target permissions changed: %s", info.Mode())
	}
}

func TestPrepareRejectsBroadRoot(t *testing.T) {
	volumeRoot := filepath.VolumeName(t.TempDir()) + string(os.PathSeparator)
	if err := Prepare(volumeRoot); err == nil {
		t.Fatal("filesystem root was accepted as system data directory")
	}
	if err := Prepare("."); err == nil {
		t.Fatal("current working directory was accepted as system data directory")
	}
}

func subdirectoryPaths(root string) []string {
	paths := make([]string, 0, len(privateSubdirectories))
	for _, name := range privateSubdirectories {
		paths = append(paths, filepath.Join(root, name))
	}
	return paths
}
