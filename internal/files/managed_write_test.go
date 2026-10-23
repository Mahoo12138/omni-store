package files

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestManagedWriteWithJournalTempRejectsUnsafePathsBeforeMkdir(t *testing.T) {
	service, source, _, _ := newManagedNamespaceService(t)
	final := ".omnistore/transfer/send/package/file.txt"
	for _, temp := range []string{
		".omnistore/transfer/send/other/.omnistore-upload-0123456789abcdef.tmp",
		".omnistore/image-bed/.omnistore-upload-0123456789abcdef.tmp",
		"ordinary/.omnistore-upload-0123456789abcdef.tmp",
		".omnistore/transfer/send/package/not-internal.tmp",
		".omnistore/transfer/send/package/.omnistore-upload-invalid.tmp",
		".omnistore/transfer/send/package/../../../../outside.tmp",
		final,
	} {
		t.Run(temp, func(t *testing.T) {
			if _, err := service.WriteManagedFileWithTemp(source, final, temp, "transfer", strings.NewReader("payload"), 0, false); !errors.Is(err, ErrInvalid) {
				t.Fatalf("unsafe temp returned %v", err)
			}
			if _, err := os.Stat(filepath.Join(source.RootPath, ".omnistore")); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("invalid path created a managed directory: %v", err)
			}
		})
	}
}

type managedReadFunc func([]byte) (int, error)

func (f managedReadFunc) Read(p []byte) (int, error) { return f(p) }

func TestManagedWriteWithJournalTempPreservesOldContentOnFailure(t *testing.T) {
	service, source, _, _ := newManagedNamespaceService(t)
	final := ".omnistore/transfer/send/package/file.txt"
	temp := ".omnistore/transfer/send/package/.omnistore-upload-0123456789abcdef.tmp"
	finalAbs := filepath.Join(source.RootPath, filepath.FromSlash(final))
	tempAbs := filepath.Join(source.RootPath, filepath.FromSlash(temp))
	if err := os.MkdirAll(filepath.Dir(finalAbs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(finalAbs, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	readFailure := errors.New("interrupted upstream")
	for _, tc := range []struct {
		name    string
		body    io.Reader
		max     int64
		limited bool
		want    error
	}{
		{"quota", strings.NewReader("new payload"), 3, true, ErrQuotaExceeded},
		{"reader", managedReadFunc(func(p []byte) (int, error) { return copy(p, "partial"), readFailure }), 0, false, readFailure},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := service.WriteManagedFileWithTemp(source, final, temp, "transfer", tc.body, tc.max, tc.limited); !errors.Is(err, tc.want) {
				t.Fatalf("write error = %v", err)
			}
			if data, err := os.ReadFile(finalAbs); err != nil || string(data) != "old" {
				t.Fatalf("old payload changed: %q, %v", data, err)
			}
			if _, err := os.Stat(tempAbs); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("temporary payload remains: %v", err)
			}
		})
	}
	// A collision belongs to somebody else; neither overwrite nor remove it.
	if err := os.WriteFile(tempAbs, []byte("foreign"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.WriteManagedFileWithTemp(source, final, temp, "transfer", strings.NewReader("new"), 0, false); !errors.Is(err, os.ErrExist) {
		t.Fatalf("collision = %v", err)
	}
	if data, err := os.ReadFile(tempAbs); err != nil || string(data) != "foreign" {
		t.Fatalf("foreign temp changed: %q, %v", data, err)
	}
	if err := os.Remove(tempAbs); err != nil {
		t.Fatal(err)
	}
	read := false
	body := managedReadFunc(func(p []byte) (int, error) {
		if read {
			return 0, io.EOF
		}
		read = true
		if _, err := os.Stat(tempAbs); err != nil {
			t.Errorf("journaled temp missing during write: %v", err)
		}
		if data, err := os.ReadFile(finalAbs); err != nil || string(data) != "old" {
			t.Errorf("published before EOF: %q, %v", data, err)
		}
		return copy(p, "complete"), io.EOF
	})
	if n, err := service.WriteManagedFileWithTemp(source, final, temp, "transfer", body, 0, false); err != nil || n != 8 {
		t.Fatalf("publish = %d, %v", n, err)
	}
	if data, err := os.ReadFile(finalAbs); err != nil || string(data) != "complete" {
		t.Fatalf("published payload = %q, %v", data, err)
	}
	if _, err := os.Stat(tempAbs); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("published temp remains: %v", err)
	}
}

func TestManagedWriteWithJournalTempRejectsSymlink(t *testing.T) {
	service, source, _, _ := newManagedNamespaceService(t)
	parent := filepath.Join(source.RootPath, ".omnistore", "transfer")
	outside := t.TempDir()
	if err := os.MkdirAll(parent, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(parent, "linked")); err != nil {
		t.Fatal(err)
	}
	final := ".omnistore/transfer/linked/new/file.txt"
	temp := ".omnistore/transfer/linked/new/.omnistore-upload-0123456789abcdef.tmp"
	if _, err := service.WriteManagedFileWithTemp(source, final, temp, "transfer", strings.NewReader("payload"), 0, false); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("symlink = %v", err)
	}
	entries, err := os.ReadDir(outside)
	if err != nil || len(entries) != 0 {
		t.Fatalf("symlink target modified: %v, %v", entries, err)
	}
}
