package shares

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

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

func TestUnlockRejectsUnknownSharesWithoutAllocatingLimiterState(t *testing.T) {
	service, _, _, _, _ := newShareTestService(t)
	for i := 0; i < 100; i++ {
		if _, _, err := service.Unlock("shr-random-"+strconv.Itoa(i), "wrong", "198.51.100.10"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("unknown share unlock error=%v", err)
		}
	}
	if got := len(service.limiter.byShare); got != 0 {
		t.Fatalf("unknown shares allocated %d share limiter keys", got)
	}
	if got := len(service.limiter.byIP); got != 0 {
		t.Fatalf("unknown shares allocated %d IP limiter keys", got)
	}
}

func TestUnlockLimiterBoundsShareAndIPWindowsAndSweepsState(t *testing.T) {
	now := time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)
	limiter := newUnlockLimiter(time.Minute, 2, 3, 2)
	limiter.now = func() time.Time { return now }

	if !limiter.allow("198.51.100.1", 1) || !limiter.allow("198.51.100.1", 1) {
		t.Fatal("share attempts below threshold were rejected")
	}
	if limiter.allow("198.51.100.1", 1) {
		t.Fatal("share threshold was not enforced")
	}
	if !limiter.allow("198.51.100.1", 2) {
		t.Fatal("second share attempt was rejected before IP threshold")
	}
	if limiter.allow("198.51.100.1", 2) {
		t.Fatal("IP total threshold was not enforced across shares")
	}

	if !limiter.allow("198.51.100.2", 2) || !limiter.allow("198.51.100.3", 3) {
		t.Fatal("independent IP attempts were rejected")
	}
	if len(limiter.byIP) > 2 || len(limiter.byShare) > 2 {
		t.Fatalf("limiter exceeded key cap: IP=%d share=%d", len(limiter.byIP), len(limiter.byShare))
	}

	now = now.Add(2 * time.Minute)
	if !limiter.allow("198.51.100.4", 4) {
		t.Fatal("expired limiter window was not released")
	}
	if len(limiter.byIP) != 1 || len(limiter.byShare) != 1 {
		t.Fatalf("TTL sweep retained expired state: IP=%d share=%d", len(limiter.byIP), len(limiter.byShare))
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
