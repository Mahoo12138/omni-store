package files

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestUserListsHideReservedNamespaceWhileStorageUsageCountsIt(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	reservedFile := ".omnistore-upload-hello.txt"
	reservedDir := ".omnistore-copy-manual"
	for name, content := range map[string]string{
		"visible.txt": "visible",
		reservedFile:  "reserved",
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(root, reservedDir), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, reservedDir, "nested.bin"), []byte("nested"), 0o600); err != nil {
		t.Fatal(err)
	}

	listing, err := service.List(source, "", ListOptions{Page: 1, PageSize: 20}, true)
	if err != nil || listing.Total != 1 || len(listing.Items) != 1 || listing.Items[0].Name != "visible.txt" {
		t.Fatalf("user listing=%+v err=%v", listing, err)
	}
	objects, err := service.ListObjects(source)
	if err != nil || len(objects) != 1 || objects[0].Key != "visible.txt" {
		t.Fatalf("object listing=%+v err=%v", objects, err)
	}
	if _, err := service.Stat(source, reservedFile); !errors.Is(err, ErrInvalid) {
		t.Fatalf("reserved file stat error=%v, want ErrInvalid", err)
	}
	usage, err := service.StorageUsage(source)
	wantUsage := int64(len("visible") + len("reserved") + len("nested"))
	if err != nil || usage != wantUsage {
		t.Fatalf("storage usage=%d err=%v, want %d", usage, err, wantUsage)
	}
}
