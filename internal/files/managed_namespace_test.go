package files

import (
	"archive/zip"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

// newManagedNamespaceService 建立带第二个源的测试环境，用于跨源复制。
func newManagedNamespaceService(t *testing.T) (*Service, *models.StorageSource, *models.StorageSource, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	sourceService := sources.NewService(conn, dataDir)
	firstRoot := filepath.Join(base, "first")
	secondRoot := filepath.Join(base, "second")
	if err := os.Mkdir(firstRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(secondRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	first, err := sourceService.Create(sources.CreateInput{Name: "first", RootPath: firstRoot})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	second, err := sourceService.Create(sources.CreateInput{Name: "second", RootPath: secondRoot})
	if err != nil {
		t.Fatalf("create second source: %v", err)
	}
	return NewService(conn, sourceService, locks.NewManager()), first, second, base
}

// 托管根在磁盘上真实存在时：读取一律 404，写入按不存在拒绝且无副作用。
func TestManagedNamespaceReadsAndWritesReturnNotFound(t *testing.T) {
	service, source, _, root := newManagedNamespaceService(t)
	if err := os.Mkdir(filepath.Join(root, "first", security.ManagedNamespaceSegment), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "first", security.ManagedNamespaceSegment, "payload.bin"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	managed := []string{".omnistore", ".omnistore/payload.bin", "nested/.omnistore/x"}
	for _, rel := range managed {
		if _, err := service.Stat(source, rel); !errors.Is(err, ErrNotFound) {
			t.Errorf("Stat(%q) = %v, want ErrNotFound", rel, err)
		}
		if _, _, _, err := service.OpenForRead(source, rel); !errors.Is(err, ErrNotFound) {
			t.Errorf("OpenForRead(%q) = %v, want ErrNotFound", rel, err)
		}
		if _, err := service.List(source, rel, ListOptions{}, true); !errors.Is(err, ErrNotFound) {
			t.Errorf("List(%q) = %v, want ErrNotFound", rel, err)
		}
	}

	// 写入同样按不存在拒绝，且不允许产生任何文件系统副作用。
	if _, err := service.Mkdir(source, "", ".omnistore"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Mkdir managed name = %v, want ErrNotFound", err)
	}
	if _, _, err := service.Upload(source, ".omnistore", "evil.txt", strings.NewReader("x"), false); !errors.Is(err, ErrNotFound) {
		t.Errorf("Upload into managed = %v, want ErrNotFound", err)
	}
	if _, _, err := service.Upload(source, "", ".omnistore", strings.NewReader("x"), false); !errors.Is(err, ErrNotFound) {
		t.Errorf("Upload named managed = %v, want ErrNotFound", err)
	}
	if err := service.EnsureObjectParents(source, ".omnistore/sub/evil.txt"); !errors.Is(err, ErrNotFound) {
		t.Errorf("EnsureObjectParents managed = %v, want ErrNotFound", err)
	}
	if _, err := service.Rename(source, "nested/.omnistore/x", "renamed.txt"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Rename from managed = %v, want ErrNotFound", err)
	}
	if _, err := service.Rename(source, "nested/.omnistore/x", ".omnistore"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Rename to managed name = %v, want ErrNotFound", err)
	}
	if _, err := service.Move(source, "nested/.omnistore/x", "moved.txt"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Move from managed = %v, want ErrNotFound", err)
	}
	if _, err := service.Move(source, "nested/.omnistore/x", ".omnistore/moved.txt"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Move into managed = %v, want ErrNotFound", err)
	}
	if err := service.Delete(source, ".omnistore"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Delete managed = %v, want ErrNotFound", err)
	}
	if err := service.Delete(source, "nested/.omnistore/x"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Delete nested managed = %v, want ErrNotFound", err)
	}

	// 失败的请求不能在磁盘留下任何痕迹。
	if _, err := os.Stat(filepath.Join(root, "first", "nested")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed writes must not create directories, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "first", "evil.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed upload must not create files, stat err=%v", err)
	}
	managedContent, err := os.ReadFile(filepath.Join(root, "first", security.ManagedNamespaceSegment, "payload.bin"))
	if err != nil || string(managedContent) != "secret" {
		t.Fatalf("managed payload changed: %q err=%v", managedContent, err)
	}
}

func TestManagedNamespaceHiddenFromListingsButCountedInUsage(t *testing.T) {
	service, source, _, root := newManagedNamespaceService(t)
	firstRoot := filepath.Join(root, "first")
	if err := os.MkdirAll(filepath.Join(firstRoot, security.ManagedNamespaceSegment, "transfer", "send"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firstRoot, security.ManagedNamespaceSegment, "transfer", "send", "pack.bin"), []byte("packpack"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firstRoot, ".omnistore.txt"), []byte("plain"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firstRoot, "normal.txt"), []byte("normal"), 0o600); err != nil {
		t.Fatal(err)
	}

	listing, err := service.List(source, "", ListOptions{Page: 1, PageSize: 20}, true)
	if err != nil || listing.Total != 2 {
		t.Fatalf("root listing=%+v err=%v, want 2 visible entries", listing, err)
	}
	for _, item := range listing.Items {
		if item.Name == security.ManagedNamespaceSegment {
			t.Fatal("managed namespace must not be listed")
		}
	}
	objects, err := service.ListObjects(source)
	if err != nil || len(objects) != 2 {
		t.Fatalf("object listing=%+v err=%v", objects, err)
	}
	for _, object := range objects {
		if security.ContainsManagedNamespace(object.Key) {
			t.Fatalf("object listing leaked managed key %q", object.Key)
		}
	}

	// 物理用量必须包含托管目录真实字节（NS-05）。
	usage, err := service.StorageUsage(source)
	if err != nil {
		t.Fatal(err)
	}
	want := int64(len("packpack") + len("plain") + len("normal"))
	if usage != want {
		t.Fatalf("storage usage=%d, want %d", usage, want)
	}
}

// 普通目录树的递归删除/移动/回收站/复制不能触碰其中的托管目录（NS-04/NS-06）。
func TestRecursiveOperationsRejectSubtreesContainingManagedRoot(t *testing.T) {
	service, source, target, root := newManagedNamespaceService(t)
	firstRoot := filepath.Join(root, "first")
	tree := filepath.Join(firstRoot, "legacy")
	if err := os.MkdirAll(filepath.Join(tree, security.ManagedNamespaceSegment, "private"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tree, "keep.txt"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tree, security.ManagedNamespaceSegment, "private", "data.bin"), []byte("internal"), 0o600); err != nil {
		t.Fatal(err)
	}
	managedFile := filepath.Join(tree, security.ManagedNamespaceSegment, "private", "data.bin")

	if err := service.Delete(source, "legacy"); err == nil {
		t.Fatal("recursive delete must reject subtrees containing the managed root")
	}
	if _, err := service.Move(source, "legacy", "renamed"); err == nil {
		t.Fatal("recursive move must reject subtrees containing the managed root")
	}
	if _, err := os.Stat(managedFile); err != nil {
		t.Fatalf("managed payload must survive rejected operations: %v", err)
	}
	if _, err := os.Stat(filepath.Join(firstRoot, "renamed")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("rejected move must not leave a partial target: %v", err)
	}

	if _, err := service.Copy(source, target, "legacy", "copy", nil); err == nil {
		t.Fatal("cross-source copy must reject subtrees containing the managed root")
	}
	if _, err := os.Stat(filepath.Join(root, "second", "copy")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("rejected copy must not leave a partial target: %v", err)
	}

	if _, err := service.MoveToTrash(source, "legacy", 1); err == nil {
		t.Fatal("trash must reject subtrees containing the managed root")
	}
	if _, err := os.Stat(managedFile); err != nil {
		t.Fatalf("managed payload must survive rejected trash: %v", err)
	}

	// 删除托管路径本身仍按不存在拒绝，绝不能触碰真实文件。
	if err := service.Delete(source, "legacy/"+security.ManagedNamespaceSegment); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete managed subtree = %v, want ErrNotFound", err)
	}
	if _, err := os.Stat(managedFile); err != nil {
		t.Fatalf("managed payload must survive direct managed delete: %v", err)
	}
}

func TestArchiveSkipsManagedNamespaceButKeepsNormalFiles(t *testing.T) {
	service, source, _, root := newManagedNamespaceService(t)
	firstRoot := filepath.Join(root, "first")
	if err := os.MkdirAll(filepath.Join(firstRoot, "docs", security.ManagedNamespaceSegment), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firstRoot, "docs", "a.txt"), []byte("AAA"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firstRoot, "docs", security.ManagedNamespaceSegment, "hidden.bin"), []byte("HIDDEN"), 0o600); err != nil {
		t.Fatal(err)
	}

	pkg, err := service.CreateArchive(source, []string{"docs"})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(pkg.Path)
	file, err := os.Open(pkg.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	reader, err := zip.NewReader(file, pkg.Size)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range reader.File {
		names[f.Name] = true
	}
	if !names["docs/a.txt"] {
		t.Fatalf("archive missing normal file: %v", names)
	}
	for name := range names {
		if security.ContainsManagedNamespace(strings.TrimSuffix(name, "/")) {
			t.Fatalf("archive leaked managed path %q", name)
		}
	}
}

// 普通 Reconcile 不导入托管子树，也不删除其中的既有台账行（NS-05）。
func TestReconcileKeepsManagedNamespaceLedgerRows(t *testing.T) {
	service, source, _, root := newManagedNamespaceService(t)
	firstRoot := filepath.Join(root, "first")
	if err := os.MkdirAll(filepath.Join(firstRoot, security.ManagedNamespaceSegment, "image-bed"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firstRoot, security.ManagedNamespaceSegment, "image-bed", "img.bin"), []byte("imgimgimg"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(firstRoot, "fresh.txt"), []byte("fresh"), 0o600); err != nil {
		t.Fatal(err)
	}
	// 预放一条托管路径上的普通台账行，模拟升级前遗留或服务自己的 scope。
	managedRel := security.ManagedNamespaceSegment + "/image-bed/img.bin"
	_, err := service.db.Exec(`INSERT INTO file_records
	  (storage_source_id, relative_path, size, owner_type, mtime_unix_nano, record_status, created_at, updated_at)
	  VALUES (?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
		source.ID, managedRel, 9, models.FileOwnerUnowned, models.FileRecordActive)
	if err != nil {
		t.Fatal(err)
	}
	// 一条已不存在的普通文件行，必须被校准删除。
	_, err = service.db.Exec(`INSERT INTO file_records
	  (storage_source_id, relative_path, size, owner_type, mtime_unix_nano, record_status, created_at, updated_at)
	  VALUES (?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
		source.ID, "gone.txt", 4, models.FileOwnerUnowned, models.FileRecordActive)
	if err != nil {
		t.Fatal(err)
	}

	result, err := service.ReconcileSource(source)
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	var managedCount, goneCount, freshCount int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ? AND relative_path = ?`,
		source.ID, managedRel).Scan(&managedCount); err != nil {
		t.Fatal(err)
	}
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ? AND relative_path = ?`,
		source.ID, "gone.txt").Scan(&goneCount); err != nil {
		t.Fatal(err)
	}
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ? AND relative_path = ?`,
		source.ID, "fresh.txt").Scan(&freshCount); err != nil {
		t.Fatal(err)
	}
	if managedCount != 1 {
		t.Fatalf("managed ledger row must survive reconcile, count=%d result=%+v", managedCount, result)
	}
	if goneCount != 0 {
		t.Fatal("stale normal row must be removed by reconcile")
	}
	if freshCount != 1 {
		t.Fatal("fresh normal file must be imported as unowned")
	}
	if _, err := os.Stat(filepath.Join(firstRoot, security.ManagedNamespaceSegment, "image-bed", "img.bin")); err != nil {
		t.Fatalf("managed file must survive reconcile: %v", err)
	}
}

// FTS 命中托管路径的旧行必须在查询时被强制排除规则过滤（NS-07）。
func TestSearchFiltersManagedNamespaceRows(t *testing.T) {
	service, source, _, _ := newManagedNamespaceService(t)
	userService := users.NewService(service.db)
	user, err := userService.Create("searcher", "Searcher", "search-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.sources.CreatePolicy(sources.PolicyInput{
		Name:    "Managed namespace search",
		UserIDs: []int64{user.ID},
		Sources: []sources.PolicySourceInput{{SourceKey: source.Key, Permission: models.PermissionReadWrite}},
	}); err != nil {
		t.Fatal(err)
	}
	_, err = service.db.Exec(`INSERT INTO file_records
	  (storage_source_id, relative_path, size, owner_type, mtime_unix_nano, record_status, created_at, updated_at)
	  VALUES (?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
		source.ID, security.ManagedNamespaceSegment+"/transfer/send/secret-report.txt", 3, models.FileOwnerUser, models.FileRecordActive)
	if err != nil {
		t.Fatal(err)
	}

	result, err := service.SearchFiles(user, SearchOptions{Query: "secret", Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 0 {
		t.Fatalf("search leaked managed namespace rows: %+v", result.Items)
	}
}

// 回收站恢复目标是包含托管目录的旧树时必须整体拒绝。
func TestRestoreTrashRejectsManagedNamespaceInPayload(t *testing.T) {
	service, source, _, root := newManagedNamespaceService(t)
	firstRoot := filepath.Join(root, "first")
	// 构造一个升级前遗留的回收站条目：payload 内含托管目录。
	trashKey := "trh-legacy-managed"
	payloadDir := filepath.Join(service.trashDir, trashKey, "payload")
	if err := os.MkdirAll(filepath.Join(payloadDir, security.ManagedNamespaceSegment), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(payloadDir, "doc.txt"), []byte("doc"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(payloadDir, security.ManagedNamespaceSegment, "keep.bin"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	owner, err := users.NewService(service.db).Create("trash-owner", "Trash Owner", "trash-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.db.Exec(`INSERT INTO trash_entries
	  (trash_key, storage_source_id, original_relative_path, entry_type, file_count, size, deleted_by_user_id, deleted_at)
	  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
		trashKey, source.ID, "old-doc", "dir", 2, 7, owner.ID)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.RestoreTrash(source, trashKey, "restored", owner.ID); err == nil {
		t.Fatal("restore must reject payloads containing the managed root")
	}
	if _, err := os.Stat(filepath.Join(payloadDir, security.ManagedNamespaceSegment, "keep.bin")); err != nil {
		t.Fatalf("payload must survive rejected restore: %v", err)
	}
	if _, err := os.Stat(filepath.Join(firstRoot, "restored")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("rejected restore must not leave a partial target: %v", err)
	}
}
