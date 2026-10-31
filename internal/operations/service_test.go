package operations

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/imagebed"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

func newOperationsFixture(t *testing.T) (*Service, *sources.Service, *models.StorageSource, *files.Service) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	userService := users.NewService(conn)
	if _, err := userService.Create("ops-user", "Ops User", "ops-password", models.RoleUser); err != nil {
		t.Fatal(err)
	}
	sourceService := sources.NewService(conn, dataDir)
	root := filepath.Join(base, "source")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := sourceService.Create(sources.CreateInput{Name: "Ops Source", RootPath: root, ImportExisting: true})
	if err != nil {
		t.Fatal(err)
	}
	capabilityService := capabilities.NewService(conn, sourceService)
	enabled := true
	if _, err := capabilityService.UpdateBinding(capabilities.CapabilityPublicDrive, capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &source.Key,
	}); err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	imagebedCache := filepath.Join(dataDir, "cache", "thumbnails")
	thumbService, err := imagebed.NewService(conn, "https://ops.test", imagebedCache, sourceService, capabilityService, fileService)
	if err != nil {
		t.Fatal(err)
	}
	sessions := auth.NewSessions(conn, time.Hour)
	service := NewService(conn, filepath.Join(dataDir, "omnistore.db"), dataDir, "2.0.0-test",
		sourceService, fileService, thumbService, sessions, nil)
	return service, sourceService, source, fileService
}

func TestGetStatusAggregatesHealth(t *testing.T) {
	service, _, source, fileService := newOperationsFixture(t)

	if _, _, err := fileService.Upload(source, "", "a.txt", strings.NewReader("12345"), false); err != nil {
		t.Fatal(err)
	}

	status, err := service.GetStatus()
	if err != nil {
		t.Fatal(err)
	}
	if status.Version != "2.0.0-test" || status.Database.QuickCheck != "ok" {
		t.Fatalf("system/db health: %+v", status.Database)
	}
	if status.Database.TableRows["users"] != 1 || status.Database.TableRows["file_records"] != 1 {
		t.Fatalf("table rows=%+v", status.Database.TableRows)
	}
	if _, ok := status.Database.TableRows["transfers"]; ok {
		t.Fatalf("removed transfer table still reported: %+v", status.Database.TableRows)
	}
	var sourceHealth *SourceHealth
	for i := range status.Sources {
		if status.Sources[i].Key == source.Key {
			sourceHealth = &status.Sources[i]
		}
	}
	if sourceHealth == nil || !sourceHealth.RootAccessible || sourceHealth.LedgerBytes != 5 {
		t.Fatalf("source health=%+v", sourceHealth)
	}
	if sourceHealth.LedgerBytes > sourceHealth.UsageBytes {
		t.Fatalf("ledger %d must not exceed physical %d", sourceHealth.LedgerBytes, sourceHealth.UsageBytes)
	}
	if len(status.Capabilities) != 2 {
		t.Fatalf("capabilities=%+v", status.Capabilities)
	}
	for _, capability := range status.Capabilities {
		if capability.Capability == "transfer_center" {
			t.Fatalf("removed transfer capability still reported: %+v", status.Capabilities)
		}
	}
}

func TestRunIntegrityCheckAndCleanup(t *testing.T) {
	service, _, _, _ := newOperationsFixture(t)

	report, err := service.RunIntegrityCheck()
	if err != nil {
		t.Fatal(err)
	}
	if !report.OK || report.Integrity[0] != "ok" || report.FKViolations != 0 {
		t.Fatalf("integrity=%+v", report)
	}

	result, err := service.RunCleanup(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result.WebDAVLocks != 0 || result.Sessions != 0 || result.Thumbnails != 0 {
		t.Fatalf("cleanup=%+v", result)
	}
}
