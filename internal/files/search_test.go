package files

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
)

func TestSearchFilesTracksActiveLedgerAcrossRenameAndTrash(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	adminID := int64(201)
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-search-admin', 'search-admin', 'Search Admin', 'hash', 'super_admin', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, adminID); err != nil {
		t.Fatal(err)
	}
	admin := &models.User{ID: adminID, Role: models.RoleSuperAdmin}
	if err := os.Mkdir(filepath.Join(root, "reports"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "reports", "quarterly-summary.txt", strings.NewReader("report"), false, nil, &adminID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "reports", "年度报告.txt", strings.NewReader("annual"), false, nil, &adminID); err != nil {
		t.Fatal(err)
	}

	result, err := service.SearchFiles(admin, SearchOptions{Query: "quarterly", Page: 1, PageSize: 20})
	if err != nil || result.Total != 1 || len(result.Items) != 1 || result.Items[0].Path != "reports/quarterly-summary.txt" {
		t.Fatalf("fts search result=%+v err=%v", result, err)
	}
	shortResult, err := service.SearchFiles(admin, SearchOptions{Query: "年度", Page: 1, PageSize: 20})
	if err != nil || shortResult.Total != 1 || shortResult.Items[0].Name != "年度报告.txt" {
		t.Fatalf("short search result=%+v err=%v", shortResult, err)
	}

	renamed, err := service.RenameAs(source, "reports/quarterly-summary.txt", "final-summary.txt", &adminID)
	if err != nil {
		t.Fatal(err)
	}
	oldResult, err := service.SearchFiles(admin, SearchOptions{Query: "quarterly", Page: 1, PageSize: 20})
	if err != nil || oldResult.Total != 0 {
		t.Fatalf("old path remained indexed: result=%+v err=%v", oldResult, err)
	}
	newResult, err := service.SearchFiles(admin, SearchOptions{Query: "final", Page: 1, PageSize: 20})
	if err != nil || newResult.Total != 1 || newResult.Items[0].Path != renamed {
		t.Fatalf("renamed path not indexed: result=%+v err=%v", newResult, err)
	}

	entry, err := service.MoveToTrash(source, renamed, adminID)
	if err != nil {
		t.Fatal(err)
	}
	trashedResult, err := service.SearchFiles(admin, SearchOptions{Query: "final", Page: 1, PageSize: 20})
	if err != nil || trashedResult.Total != 0 {
		t.Fatalf("trash path remained indexed: result=%+v err=%v", trashedResult, err)
	}
	if _, err := service.RestoreTrash(source, entry.Key, renamed, adminID); err != nil {
		t.Fatal(err)
	}
	restoredResult, err := service.SearchFiles(admin, SearchOptions{Query: "final", Page: 1, PageSize: 20})
	if err != nil || restoredResult.Total != 1 {
		t.Fatalf("restored path missing from index: result=%+v err=%v", restoredResult, err)
	}
}

func TestSearchFilesValidatesQueryAndSourceFilter(t *testing.T) {
	service, _, _ := newQuotaTestService(t, 0)
	admin := &models.User{ID: 1, Role: models.RoleSuperAdmin}
	if _, err := service.SearchFiles(admin, SearchOptions{Query: "x"}); !errors.Is(err, ErrSearchQuery) {
		t.Fatalf("short query error=%v", err)
	}
	result, err := service.SearchFiles(admin, SearchOptions{Query: "missing", SourceKey: "src-does-not-exist"})
	if err != nil || result.Total != 0 || len(result.Items) != 0 {
		t.Fatalf("unknown source result=%+v err=%v", result, err)
	}
}
