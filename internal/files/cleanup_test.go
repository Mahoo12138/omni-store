package files

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestCleanupStaleUploadsInRootOnlyRemovesReservedOldFiles(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "nested")
	if err := os.Mkdir(nested, 0o755); err != nil {
		t.Fatalf("create nested directory: %v", err)
	}
	now := time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC)
	old := now.Add(-25 * time.Hour)
	fresh := now.Add(-23 * time.Hour)

	writeFileAt := func(path string, modTime time.Time) {
		t.Helper()
		if err := os.WriteFile(path, []byte("temporary"), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
		if err := os.Chtimes(path, modTime, modTime); err != nil {
			t.Fatalf("set time for %s: %v", path, err)
		}
	}

	stale := filepath.Join(nested, ".omnistore-upload-0123456789abcdef.tmp")
	freshReserved := filepath.Join(root, ".omnistore-upload-fedcba9876543210.tmp")
	wrongLength := filepath.Join(root, ".omnistore-upload-0123.tmp")
	userFile := filepath.Join(root, ".omnistore-upload-not-ours.tmp")
	writeFileAt(stale, old)
	writeFileAt(freshReserved, fresh)
	writeFileAt(wrongLength, old)
	writeFileAt(userFile, old)

	reservedDir := filepath.Join(root, ".omnistore-upload-aaaaaaaaaaaaaaaa.tmp")
	if err := os.Mkdir(reservedDir, 0o755); err != nil {
		t.Fatalf("create reserved-looking directory: %v", err)
	}
	if err := os.Chtimes(reservedDir, old, old); err != nil {
		t.Fatalf("set directory time: %v", err)
	}

	symlink := filepath.Join(root, ".omnistore-upload-bbbbbbbbbbbbbbbb.tmp")
	target := filepath.Join(root, "symlink-target.txt")
	writeFileAt(target, old)
	symlinkCreated := os.Symlink(target, symlink) == nil

	removed, err := cleanupStaleUploadsInRoot(root, now.Add(-24*time.Hour))
	if err != nil {
		t.Fatalf("cleanup stale uploads: %v", err)
	}
	if removed != 1 {
		t.Fatalf("expected one removal, got %d", removed)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatalf("stale reserved file still exists or stat failed: %v", err)
	}
	for _, path := range []string{freshReserved, wrongLength, userFile, reservedDir, target} {
		if _, err := os.Lstat(path); err != nil {
			t.Errorf("protected path %s was changed: %v", path, err)
		}
	}
	if symlinkCreated {
		if info, err := os.Lstat(symlink); err != nil || info.Mode()&os.ModeSymlink == 0 {
			t.Errorf("symlink should not be removed: info=%v err=%v", info, err)
		}
	}
}

func TestCleanupStaleUploadsInRootRejectsMissingRoot(t *testing.T) {
	removed, err := cleanupStaleUploadsInRoot(filepath.Join(t.TempDir(), "missing"), time.Now())
	if err == nil || removed != 0 {
		t.Fatalf("expected missing root error, removed=%d err=%v", removed, err)
	}
}

func TestCleanupStaleUploadsScansRegisteredSources(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	if err := os.Mkdir(dataDir, 0o755); err != nil {
		t.Fatalf("create data directory: %v", err)
	}
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	sourceService := sources.NewService(conn, dataDir)
	old := time.Now().UTC().Add(-25 * time.Hour)
	for index, id := range []string{"source-one", "source-two"} {
		root := filepath.Join(base, id)
		if err := os.Mkdir(root, 0o755); err != nil {
			t.Fatalf("create source root: %v", err)
		}
		if _, err := sourceService.Create(sources.CreateInput{
			SourceID: id, Name: id, RootPath: root, HasPatterns: true,
		}); err != nil {
			t.Fatalf("register source %s: %v", id, err)
		}
		name := []string{
			".omnistore-upload-1111111111111111.tmp",
			".omnistore-upload-2222222222222222.tmp",
		}[index]
		path := filepath.Join(root, name)
		if err := os.WriteFile(path, []byte("stale"), 0o644); err != nil {
			t.Fatalf("write stale file: %v", err)
		}
		if err := os.Chtimes(path, old, old); err != nil {
			t.Fatalf("set stale file time: %v", err)
		}
	}

	service := NewService(conn, sourceService, locks.NewManager())
	result, err := service.CleanupStaleUploads(24 * time.Hour)
	if err != nil {
		t.Fatalf("cleanup registered sources: %v", err)
	}
	if result.ScannedSources != 2 || result.RemovedFiles != 2 {
		t.Fatalf("unexpected cleanup result: %+v", result)
	}
}
