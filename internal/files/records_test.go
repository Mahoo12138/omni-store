package files

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestCreateSourceImportsLedgerAtomicallyUnderConcurrentRequests(t *testing.T) {
	service, _, existingRoot := newQuotaTestService(t, 0)
	root := filepath.Join(filepath.Dir(existingRoot), "concurrent-import")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "existing.txt"), []byte("data"), 0o600); err != nil {
		t.Fatal(err)
	}
	const attempts = 20
	type outcome struct {
		sourceID int64
		err      error
	}
	start := make(chan struct{})
	results := make(chan outcome, attempts)
	for i := range attempts {
		go func(index int) {
			<-start
			source, result, err := service.CreateSource(sources.CreateInput{
				Name: fmt.Sprintf("import-%02d", index), RootPath: root, ImportExisting: true,
			})
			if err == nil && (result.Added != 1 || result.Unowned != 1) {
				err = fmt.Errorf("unexpected reconcile result: %+v", result)
			}
			var sourceID int64
			if source != nil {
				sourceID = source.ID
			}
			results <- outcome{sourceID: sourceID, err: err}
		}(i)
	}
	close(start)
	var createdSourceID int64
	rejected := 0
	for range attempts {
		result := <-results
		if result.err == nil {
			if createdSourceID != 0 {
				t.Fatalf("multiple imports succeeded: %d and %d", createdSourceID, result.sourceID)
			}
			createdSourceID = result.sourceID
		} else if strings.Contains(result.err.Error(), "路径重叠") {
			rejected++
		} else {
			t.Fatalf("unexpected import error: %v", result.err)
		}
	}
	if createdSourceID == 0 || rejected != attempts-1 {
		t.Fatalf("createdSourceID=%d rejected=%d", createdSourceID, rejected)
	}
	var records int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ?`, createdSourceID).Scan(&records); err != nil || records != 1 {
		t.Fatalf("atomic imported records=%d err=%v", records, err)
	}
}

func TestReconcileSourceImportsUpdatesAndRemovesFiles(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	if err := os.Mkdir(filepath.Join(root, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "one.txt"), []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".omnistore-upload-0123456789abcdef01234567.backup"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}

	first, err := service.ReconcileSource(source)
	if err != nil {
		t.Fatalf("first reconcile: %v", err)
	}
	if first.ScannedFiles != 1 || first.Added != 1 || first.Unowned != 1 || first.UsageBytes != 3 {
		t.Fatalf("unexpected first result: %+v", first)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "one.txt"), []byte("updated"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(root, ".env")); err != nil {
		t.Fatal(err)
	}

	second, err := service.ReconcileSource(source)
	if err != nil {
		t.Fatalf("second reconcile: %v", err)
	}
	if second.ScannedFiles != 1 || second.Updated != 1 || second.Removed != 0 || second.Unowned != 1 {
		t.Fatalf("unexpected second result: %+v", second)
	}
	usage, err := service.LedgerSourceUsage(source.ID)
	if err != nil || usage != 7 {
		t.Fatalf("ledger usage=%d err=%v", usage, err)
	}
}

func TestOwnedUploadMoveAndDeleteMaintainFileRecord(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := int64(42)
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-record-owner', 'record-owner', 'Record Owner', 'hash', 'user', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, userID); err != nil {
		t.Fatalf("insert owner: %v", err)
	}

	relPath, _, err := service.UploadWithLockTokens(source, "", "owned.txt", strings.NewReader("owned"), false, nil, &userID)
	if err != nil {
		t.Fatalf("owned upload: %v", err)
	}
	assertFileRecord(t, service, source.ID, relPath, "owned.txt", 5, models.FileOwnerUser, &userID)

	moved, err := service.MoveWithLockTokens(source, relPath, "moved.txt", nil, &userID)
	if err != nil {
		t.Fatalf("move: %v", err)
	}
	assertFileRecord(t, service, source.ID, moved, "moved.txt", 5, models.FileOwnerUser, &userID)
	if _, err := os.Stat(filepath.Join(root, "moved.txt")); err != nil {
		t.Fatalf("moved file: %v", err)
	}

	if err := service.Delete(source, moved); err != nil {
		t.Fatalf("delete: %v", err)
	}
	var count int
	if err := service.db.QueryRow(`SELECT COUNT(*) FROM file_records WHERE storage_source_id = ?`, source.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("records after delete=%d err=%v", count, err)
	}
}

func assertFileRecord(t *testing.T, service *Service, sourceID int64, relPath, wantPath string, wantSize int64, wantType string, wantUserID *int64) {
	t.Helper()
	var gotPath, ownerType string
	var size int64
	var ownerUserID *int64
	if err := service.db.QueryRow(`SELECT relative_path, size, owner_type, owner_user_id
  FROM file_records WHERE storage_source_id = ? AND relative_path = ?`, sourceID, relPath).
		Scan(&gotPath, &size, &ownerType, &ownerUserID); err != nil {
		t.Fatalf("query record: %v", err)
	}
	if gotPath != wantPath || size != wantSize || ownerType != wantType || ownerUserID == nil || wantUserID == nil || *ownerUserID != *wantUserID {
		t.Fatalf("record path=%q size=%d owner=%s/%v", gotPath, size, ownerType, ownerUserID)
	}
}
