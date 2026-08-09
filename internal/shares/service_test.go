package shares

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

func TestPasswordShareDownloadLimitAndDirectoryBrowse(t *testing.T) {
	service, fileService, source, user, root := newShareTestService(t)
	if _, _, err := fileService.UploadWithLockTokens(source, "", "note.txt", strings.NewReader("note"), false, nil, &user.ID); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, _, err := fileService.UploadWithLockTokens(source, "docs", "guide.txt", strings.NewReader("guide"), false, nil, &user.ID); err != nil {
		t.Fatal(err)
	}

	share, err := service.Create(user, CreateInput{SourceKey: source.Key, Path: "/note.txt", Password: "open-sesame", MaxDownloads: 1})
	if err != nil {
		t.Fatal(err)
	}
	info, err := service.PublicInfo(share.Key, "")
	if err != nil || !info.Protected || info.AccessGranted {
		t.Fatalf("locked info=%+v err=%v", info, err)
	}
	if _, _, err := service.Unlock(share.Key, "wrong", "127.0.0.1"); !errors.Is(err, ErrPassword) {
		t.Fatalf("wrong password error=%v", err)
	}
	token, _, err := service.Unlock(share.Key, "open-sesame", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	info, err = service.PublicInfo(share.Key, token)
	if err != nil || !info.AccessGranted {
		t.Fatalf("unlocked info=%+v err=%v", info, err)
	}
	resolved, _, relPath, err := service.Resolve(share.Key, token, "")
	if err != nil || relPath != "note.txt" {
		t.Fatalf("resolve path=%q share=%+v err=%v", relPath, resolved, err)
	}
	if err := service.ReserveDownload(share.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.PublicInfo(share.Key, token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("exhausted share error=%v", err)
	}

	directory, err := service.Create(user, CreateInput{SourceKey: source.Key, Path: "/docs"})
	if err != nil {
		t.Fatal(err)
	}
	listing, err := service.Browse(directory.Key, "", "", files.ListOptions{Page: 1, PageSize: 20})
	if err != nil || listing.Total != 1 || listing.Items[0].Name != "guide.txt" {
		t.Fatalf("directory listing=%+v err=%v", listing, err)
	}
}

func TestShareFollowsMoveTrashRestoreAndPurge(t *testing.T) {
	service, fileService, source, user, _ := newShareTestService(t)
	if _, _, err := fileService.UploadWithLockTokens(source, "", "move-me.txt", strings.NewReader("data"), false, nil, &user.ID); err != nil {
		t.Fatal(err)
	}
	share, err := service.Create(user, CreateInput{SourceKey: source.Key, Path: "/move-me.txt"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fileService.MoveWithLockTokens(source, "move-me.txt", "renamed.txt", nil, &user.ID); err != nil {
		t.Fatal(err)
	}
	share, err = service.get(share.Key)
	if err != nil || share.RelativePath != "renamed.txt" {
		t.Fatalf("share after move=%+v err=%v", share, err)
	}
	trash, err := fileService.MoveToTrash(source, "renamed.txt", user.ID)
	if err != nil {
		t.Fatal(err)
	}
	share, err = service.get(share.Key)
	if err != nil || !share.InTrash {
		t.Fatalf("share after trash=%+v err=%v", share, err)
	}
	if _, err := service.PublicInfo(share.Key, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("trashed share remained public: %v", err)
	}
	if _, err := fileService.RestoreTrash(source, trash.Key, "restored.txt", user.ID); err != nil {
		t.Fatal(err)
	}
	share, err = service.get(share.Key)
	if err != nil || share.InTrash || share.RelativePath != "restored.txt" {
		t.Fatalf("share after restore=%+v err=%v", share, err)
	}
	trash, err = fileService.MoveToTrash(source, "restored.txt", user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := fileService.PurgeTrash(source, trash.Key); err != nil {
		t.Fatal(err)
	}
	if _, err := service.get(share.Key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("purged share error=%v", err)
	}
}

func newShareTestService(t *testing.T) (*Service, *files.Service, *models.StorageSource, *models.User, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	user, err := users.NewService(conn).Create("share-user", "Share User", "test-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	sourceService := sources.NewService(conn, dataDir)
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := sourceService.Create(sources.CreateInput{Name: "Shared files", RootPath: root, ExcludePatterns: []string{}, HasPatterns: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sourceService.CreatePolicy(sources.PolicyInput{Name: "Share editors", UserIDs: []int64{user.ID}, Sources: []sources.PolicySourceInput{{SourceKey: source.Key, Permission: models.PermissionReadWrite}}}); err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	return NewService(conn, sourceService, fileService, "http://example.test"), fileService, source, user, root
}
