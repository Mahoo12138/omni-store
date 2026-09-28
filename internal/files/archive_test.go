package files

import (
	"archive/zip"
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestCreateArchivePreservesTreesAndFiltersHiddenContent(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	if err := service.sources.SetExcludePatterns(source.ID, []string{"folder/private/**"}); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{
		"note.txt":                                   "note",
		filepath.Join("folder", "visible.txt"):       "visible",
		filepath.Join("folder", "empty", ".keep"):    "placeholder",
		filepath.Join("folder", "private", "x.txt"):  "secret",
		filepath.Join("folder", ".omnistore-copy-x"): "internal",
	} {
		absolute := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(absolute, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(root, "folder", "actually-empty"), 0o755); err != nil {
		t.Fatal(err)
	}

	pkg, err := service.CreateArchive(source, []string{"folder", "note.txt"})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(pkg.Path)
	zr, err := zip.OpenReader(pkg.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	entries := make(map[string]bool, len(zr.File))
	for _, entry := range zr.File {
		entries[entry.Name] = true
	}
	for _, expected := range []string{"folder/", "folder/visible.txt", "folder/actually-empty/", "note.txt"} {
		if !entries[expected] {
			t.Errorf("missing archive entry %q; got %v", expected, entries)
		}
	}
	for _, hidden := range []string{"folder/private/", "folder/private/x.txt", "folder/.omnistore-copy-x"} {
		if entries[hidden] {
			t.Errorf("hidden entry leaked into archive: %q", hidden)
		}
	}
}

func TestCreateArchiveRejectsInvalidSelectionsWithoutLeavingTemporaryFiles(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CreateArchive(source, nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("empty selection error=%v, want ErrInvalid", err)
	}
	if _, err := service.CreateArchive(source, []string{"missing.txt"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing selection error=%v, want ErrNotFound", err)
	}
	leftovers, err := filepath.Glob(filepath.Join(service.sources.DataDir(), "tmp", "omnistore-download-*.zip"))
	if err != nil {
		t.Fatal(err)
	}
	if len(leftovers) != 0 {
		t.Fatalf("temporary archives were not cleaned up: %v", leftovers)
	}
}

// 1.2.0：分享目录打包下载必须流式写出，并沿用 CreateArchive 的排除与安全过滤。
func TestPrepareStreamArchiveWritesZipWithFilters(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	if err := service.sources.SetExcludePatterns(source.ID, []string{"folder/private/**"}); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{
		"top.txt":                                   "top",
		filepath.Join("folder", "visible.txt"):      "visible",
		filepath.Join("folder", "private", "x.txt"): "secret",
	} {
		absolute := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(absolute, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	plan, err := service.PrepareStreamArchive(source, "folder")
	if err != nil {
		t.Fatal(err)
	}
	if plan.Filename() != "folder.zip" {
		t.Fatalf("filename=%q", plan.Filename())
	}
	var buf bytes.Buffer
	if err := plan.Write(&buf); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	entries := make(map[string]bool, len(zr.File))
	for _, entry := range zr.File {
		entries[entry.Name] = true
	}
	if !entries["folder/visible.txt"] || entries["folder/private/x.txt"] {
		t.Fatalf("streamed archive filter wrong: %v", entries)
	}

	// 打包目标是文件或不存在路径时应直接失败，调用方仍能返回明确错误。
	if _, err := service.PrepareStreamArchive(source, "top.txt"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("file target error=%v, want ErrInvalid", err)
	}
	if _, err := service.PrepareStreamArchive(source, "missing-dir"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing target error=%v, want ErrNotFound", err)
	}
}
