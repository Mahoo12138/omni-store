package files

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestStorageQuotaRejectsOverflowAndPreservesOverwriteTarget(t *testing.T) {
	service, source, root := newQuotaTestService(t, 6)
	if err := os.WriteFile(filepath.Join(root, "old.txt"), []byte("1234"), 0o644); err != nil {
		t.Fatalf("seed old file: %v", err)
	}

	if _, _, err := service.Upload(source, "", "new.txt", strings.NewReader("123"), false); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("overflow upload error=%v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "new.txt")); !os.IsNotExist(err) {
		t.Fatalf("overflow upload left final file: %v", err)
	}

	if _, written, err := service.Upload(source, "", "old.txt", strings.NewReader("123456"), true); err != nil || written != 6 {
		t.Fatalf("quota-aware overwrite: written=%d err=%v", written, err)
	}
	if _, _, err := service.Upload(source, "", "old.txt", strings.NewReader("1234567"), true); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("oversized overwrite error=%v", err)
	}
	content, err := os.ReadFile(filepath.Join(root, "old.txt"))
	if err != nil || string(content) != "123456" {
		t.Fatalf("failed overwrite changed target: content=%q err=%v", content, err)
	}
	quota, err := service.StorageQuota(source)
	if err != nil || quota.UsageBytes != 6 || quota.RemainingBytes != 0 || quota.Unlimited {
		t.Fatalf("unexpected quota summary: quota=%+v err=%v", quota, err)
	}
	lowered := int64(3)
	if _, err := service.sources.Update(source.Key, sources.UpdateInput{QuotaBytes: &lowered}); err != nil {
		t.Fatalf("lower source quota: %v", err)
	}
	if _, _, err := service.Upload(source, "", "old.txt", strings.NewReader("12"), true); err != nil {
		t.Fatalf("shrink source while over quota: %v", err)
	}
}

func TestStorageQuotaSerializesConcurrentUploads(t *testing.T) {
	service, source, root := newQuotaTestService(t, 5)
	start := make(chan struct{})
	results := make(chan error, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	for _, name := range []string{"first.txt", "second.txt"} {
		go func() {
			ready.Done()
			<-start
			_, _, err := service.Upload(source, "", name, strings.NewReader("1234"), false)
			results <- err
		}()
	}
	ready.Wait()
	close(start)

	succeeded, rejected := 0, 0
	for range 2 {
		switch err := <-results; {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrQuotaExceeded):
			rejected++
		default:
			t.Fatalf("unexpected concurrent upload error: %v", err)
		}
	}
	if succeeded != 1 || rejected != 1 {
		t.Fatalf("concurrent uploads: succeeded=%d rejected=%d", succeeded, rejected)
	}
	quota, err := service.StorageQuota(source)
	if err != nil || quota.UsageBytes != 4 || quota.RemainingBytes != 1 {
		t.Fatalf("unexpected concurrent quota: quota=%+v err=%v", quota, err)
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 1 {
		t.Fatalf("unexpected files after concurrent uploads: entries=%v err=%v", entries, err)
	}
}

func TestStorageUsageCountsExcludedAndUserReservedNamesButNotInternalTemps(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	for name, content := range map[string]string{
		"visible.txt":                            "12",
		".env":                                   "345",
		".omnistore-upload-not-ours.tmp":         "6789",
		".omnistore-upload-0123456789abcdef.tmp": "not-counted",
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	usage, err := service.StorageUsage(source)
	if err != nil || usage != 9 {
		t.Fatalf("usage=%d err=%v", usage, err)
	}
	quota, err := service.StorageQuota(source)
	if err != nil || !quota.Unlimited || quota.QuotaBytes != 0 || quota.UsageBytes != 9 {
		t.Fatalf("unlimited quota=%+v err=%v", quota, err)
	}
}

func TestBeginQuotaWriteReloadsLatestQuota(t *testing.T) {
	service, staleSource, _ := newQuotaTestService(t, 0)
	quotaBytes := int64(3)
	if _, err := service.sources.Update(staleSource.Key, sources.UpdateInput{QuotaBytes: &quotaBytes}); err != nil {
		t.Fatalf("update quota: %v", err)
	}

	guard, err := service.BeginQuotaWrite(staleSource, "")
	if err != nil {
		t.Fatalf("begin quota write: %v", err)
	}
	defer guard.Close()
	if maxBytes, limited := guard.MaxBytes(); !limited || maxBytes != 3 {
		t.Fatalf("stale source used old quota: max=%d limited=%v", maxBytes, limited)
	}
}

func TestUserQuotaRejectsOverflowAndAllowsShrinkingWhileOverQuota(t *testing.T) {
	service, source, _ := newQuotaTestService(t, 0)
	userID := int64(77)
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, 'u-quota-owner', 'quota-owner', 'Quota Owner', 'hash', 'user', 0, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, userID); err != nil {
		t.Fatalf("insert quota owner: %v", err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "", "first.txt", strings.NewReader("1234"), false, nil, &userID); err != nil {
		t.Fatalf("first upload: %v", err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "", "second.txt", strings.NewReader("12"), false, nil, &userID); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("overflow error=%v", err)
	}
	if _, err := service.db.Exec(`UPDATE users SET quota_bytes = 2 WHERE id = ?`, userID); err != nil {
		t.Fatalf("lower quota: %v", err)
	}
	if _, _, err := service.UploadWithLockTokens(source, "", "first.txt", strings.NewReader("12"), true, nil, &userID); err != nil {
		t.Fatalf("shrink while over quota: %v", err)
	}
	usage, err := service.UserUsage(userID)
	if err != nil || usage != 2 {
		t.Fatalf("usage=%d err=%v", usage, err)
	}
}

func newQuotaTestService(t *testing.T, quotaBytes int64) (*Service, *models.StorageSource, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	sourceService := sources.NewService(conn, dataDir)
	source, err := sourceService.Create(sources.CreateInput{Name: "quota", RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	if quotaBytes > 0 {
		source, err = sourceService.Update(source.Key, sources.UpdateInput{QuotaBytes: &quotaBytes})
		if err != nil {
			t.Fatalf("set quota: %v", err)
		}
	}
	return NewService(conn, sourceService, locks.NewManager()), source, root
}
