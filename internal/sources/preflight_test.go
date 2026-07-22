package sources

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
)

func newPreflightService(t *testing.T) (*Service, string) {
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

func TestPreflightExistingDirectoryUsesDefaultExcludes(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "existing")
	if err := os.MkdirAll(filepath.Join(root, "album"), 0o755); err != nil {
		t.Fatalf("create directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "photo.jpg"), []byte("image"), 0o644); err != nil {
		t.Fatalf("write visible file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("secret"), 0o600); err != nil {
		t.Fatalf("write excluded file: %v", err)
	}

	preview, err := service.Preflight(PreflightInput{RootPath: root})
	if err != nil {
		t.Fatalf("preflight directory: %v", err)
	}
	if preview.RootPath != filepath.Clean(root) || preview.IsEmpty {
		t.Fatalf("unexpected root preview: %+v", preview)
	}
	if preview.Summary.TotalEntries != 3 || preview.Summary.VisibleEntries != 2 ||
		preview.Summary.Files != 1 || preview.Summary.Directories != 1 ||
		preview.Summary.ExcludedEntries != 1 {
		t.Fatalf("unexpected summary: %+v", preview.Summary)
	}
	if len(preview.Entries) != 2 || len(preview.Warnings) < 2 {
		t.Fatalf("unexpected entries or warnings: %+v", preview)
	}
	if _, err := os.Stat(filepath.Join(root, ".env")); err != nil {
		t.Fatalf("preflight changed existing file: %v", err)
	}
	matches, err := filepath.Glob(filepath.Join(root, ".omnistore-write-test-*"))
	if err != nil || len(matches) != 0 {
		t.Fatalf("write precheck residue: matches=%v err=%v", matches, err)
	}
}

func TestPreflightHonorsExplicitEmptyExcludePatterns(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "custom-patterns")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("visible"), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}

	preview, err := service.Preflight(PreflightInput{
		RootPath: root, ExcludePatterns: []string{}, HasPatterns: true,
	})
	if err != nil {
		t.Fatalf("preflight directory: %v", err)
	}
	if preview.Summary.Files != 1 || preview.Summary.ExcludedEntries != 0 || len(preview.ExcludePatterns) != 0 {
		t.Fatalf("explicit empty patterns were not honored: %+v", preview)
	}
}

func TestPreflightRejectsPathOverlappingExistingSource(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "registered")
	nested := filepath.Join(root, "nested")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}
	if _, err := service.Create(CreateInput{SourceID: "registered-source", RootPath: root}); err != nil {
		t.Fatalf("create source: %v", err)
	}

	if _, err := service.Preflight(PreflightInput{RootPath: nested}); err == nil {
		t.Fatal("expected overlapping path to be rejected")
	}
}

func TestPreflightLimitsVisibleEntrySample(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "many-files")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}
	for i := 0; i < preflightEntryLimit+2; i++ {
		name := filepath.Join(root, "item-"+string(rune('a'+i)))
		if err := os.WriteFile(name, []byte("x"), 0o644); err != nil {
			t.Fatalf("write file: %v", err)
		}
	}

	preview, err := service.Preflight(PreflightInput{RootPath: root})
	if err != nil {
		t.Fatalf("preflight directory: %v", err)
	}
	if len(preview.Entries) != preflightEntryLimit || !preview.SampleTruncated ||
		preview.Summary.VisibleEntries != preflightEntryLimit+2 {
		t.Fatalf("unexpected limited preview: %+v", preview)
	}
}
