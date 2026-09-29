package sources

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 源根存在未知同名 .omnistore 目录时，预检不失败、不接管，只输出诊断告警。
func TestPreflightWarnsOnUnknownManagedRoot(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".omnistore"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".omnistore", "unknown.bin"), []byte("unknown"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "normal.txt"), []byte("normal"), 0o600); err != nil {
		t.Fatal(err)
	}

	preview, err := previewDirectory(root, DefaultExcludePatterns)
	if err != nil {
		t.Fatalf("preview must not fail on unknown managed root: %v", err)
	}
	foundWarning := false
	for _, warning := range preview.Warnings {
		if strings.Contains(warning, ".omnistore") {
			foundWarning = true
		}
	}
	if !foundWarning {
		t.Fatalf("preview must warn about unknown managed root: %+v", preview.Warnings)
	}
	// 内容必须保持原样：不清理、不重命名。
	if _, err := os.Stat(filepath.Join(root, ".omnistore", "unknown.bin")); err != nil {
		t.Fatalf("unknown managed content must be untouched: %v", err)
	}
}
