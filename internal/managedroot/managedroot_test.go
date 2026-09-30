package managedroot

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

func newManagedRootEnv(t *testing.T) (*Service, *models.StorageSource, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	sourceService := sources.NewService(conn, dataDir)
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	src, err := sourceService.Create(sources.CreateInput{Name: "managed", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	return NewService(conn), src, root
}

func TestEnsureInitializesRootMarkerAndRegistration(t *testing.T) {
	service, src, root := newManagedRootEnv(t)
	managedRoot := filepath.Join(root, security.ManagedNamespaceSegment)

	if err := service.Ensure(src); err != nil {
		t.Fatalf("first Ensure: %v", err)
	}
	info, err := os.Lstat(managedRoot)
	if err != nil || !info.IsDir() {
		t.Fatalf("managed root missing: %v", err)
	}
	markerInfo, err := os.Lstat(filepath.Join(managedRoot, markerFileName))
	if err != nil || !markerInfo.Mode().IsRegular() {
		t.Fatalf("marker missing: %v", err)
	}
	if markerInfo.Mode().Perm() != 0o600 {
		t.Fatalf("marker permission = %o, want 600", markerInfo.Mode().Perm())
	}

	// 重复调用幂等，且登记与标识一致。
	if err := service.Ensure(src); err != nil {
		t.Fatalf("second Ensure: %v", err)
	}
}

func TestEnsureRejectsUnknownSameNameDirectory(t *testing.T) {
	service, src, root := newManagedRootEnv(t)
	managedRoot := filepath.Join(root, security.ManagedNamespaceSegment)
	if err := os.MkdirAll(filepath.Join(managedRoot, "someone-elses-data"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(managedRoot, "someone-elses-data", "keep.txt"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := service.Ensure(src); !errors.Is(err, ErrUnknownRoot) {
		t.Fatalf("Ensure error=%v, want ErrUnknownRoot", err)
	}
	// 未登记目录不接管、不删除、不写入任何内容。
	entries, err := os.ReadDir(managedRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "someone-elses-data" {
		t.Fatalf("unknown root was modified: %v", entries)
	}
}

func TestEnsureAdoptsMarkerWrittenBeforeRegistrationCrash(t *testing.T) {
	service, src, root := newManagedRootEnv(t)
	managedRoot := filepath.Join(root, security.ManagedNamespaceSegment)
	if err := os.MkdirAll(managedRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	// 模拟崩溃：初始化已写入完整标识文件，但数据库登记缺失。
	instanceID := "inst-adoption-test"
	marker := markerFile{Version: 1, InstanceID: instanceID, Nonce: "nonce-crash-gap", StorageSourceID: src.ID}
	content, err := json.Marshal(marker)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(managedRoot, markerFileName), content, 0o600); err != nil {
		t.Fatal(err)
	}
	// 预置实例标识，保证 marker.InstanceID 能被采纳。
	if _, err := service.db.Exec(`INSERT INTO system_settings (key, value, updated_at)
  VALUES (?, ?, datetime('now'))`, SettingInstanceID, instanceID); err != nil {
		t.Fatal(err)
	}

	if err := service.Ensure(src); err != nil {
		t.Fatalf("Ensure after crash gap: %v", err)
	}
	var nonce string
	if err := service.db.QueryRow(`SELECT ownership_nonce FROM managed_root_registrations WHERE storage_source_id = ?`,
		src.ID).Scan(&nonce); err != nil {
		t.Fatal(err)
	}
	if nonce != "nonce-crash-gap" {
		t.Fatalf("adopted nonce=%q", nonce)
	}
}

func TestEnsureRejectsForeignInstanceMarkerAndTamperedMarker(t *testing.T) {
	service, src, root := newManagedRootEnv(t)
	managedRoot := filepath.Join(root, security.ManagedNamespaceSegment)
	if err := os.MkdirAll(managedRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	// 其他实例写入的标识：本实例不能采纳，也不能删除。
	foreign := markerFile{Version: 1, InstanceID: "inst-other", Nonce: "nonce-foreign", StorageSourceID: src.ID}
	content, err := json.Marshal(foreign)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(managedRoot, markerFileName), content, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.Ensure(src); !errors.Is(err, ErrUnknownRoot) {
		t.Fatalf("foreign marker error=%v, want ErrUnknownRoot", err)
	}

	// 登记后篡改标识内容：所有权核验失败。
	if err := service.Ensure(src); err == nil {
		t.Fatal("precondition failed: Ensure should still fail")
	}
	if _, err := service.db.Exec(`INSERT INTO managed_root_registrations
  (storage_source_id, ownership_nonce, instance_id, registered_at) VALUES (?, 'nonce-reg', 'inst-other', datetime('now'))`,
		src.ID); err != nil {
		t.Fatal(err)
	}
	if err := service.Ensure(src); !errors.Is(err, ErrOwnershipMismatch) {
		t.Fatalf("tampered marker error=%v, want ErrOwnershipMismatch", err)
	}
}

func TestEnsureReinitializesWhenRootDeletedAfterRegistration(t *testing.T) {
	service, src, root := newManagedRootEnv(t)
	if err := service.Ensure(src); err != nil {
		t.Fatal(err)
	}
	managedRoot := filepath.Join(root, security.ManagedNamespaceSegment)
	if err := os.RemoveAll(managedRoot); err != nil {
		t.Fatal(err)
	}
	// 登记还在而目录被宿主机删除：重新初始化而不是永久阻塞。
	if err := service.Ensure(src); err != nil {
		t.Fatalf("re-init Ensure: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(managedRoot, markerFileName)); err != nil {
		t.Fatalf("marker after re-init: %v", err)
	}
}
