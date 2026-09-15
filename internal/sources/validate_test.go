package sources

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateRootPathDoesNotExposeWriteProbePath(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root can write a read-only directory; run this regression test as a non-root user")
	}

	base := t.TempDir()
	root := filepath.Join(base, "read-only-source")
	if err := os.Mkdir(root, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(root, 0o755) })

	_, err := ValidateRootPath(root, filepath.Join(base, "data"), nil)
	if err == nil {
		t.Fatal("expected read-only source to fail validation")
	}
	if !strings.Contains(err.Error(), "目录不可写") {
		t.Fatalf("unexpected validation error: %v", err)
	}
	if strings.Contains(err.Error(), ".omnistore-write-test-") {
		t.Fatalf("write probe path leaked in validation error: %v", err)
	}
}
