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
	"github.com/omni-store/omnistore/internal/transfers"
	"github.com/omni-store/omnistore/internal/users"
)

func newOperationsFixture(t *testing.T) (*Service, *sources.Service, *models.StorageSource, *files.Service, int64) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	userService := users.NewService(conn)
	owner, err := userService.Create("ops-user", "Ops User", "ops-password", models.RoleUser)
	if err != nil {
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
	if _, err := capabilityService.UpdateBinding(capabilities.CapabilityTransferCenter, capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &source.Key,
	}); err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	transferService := transfers.NewService(conn, sourceService, capabilityService, fileService, dataDir, "ops-master-key")
	imagebedCache := filepath.Join(dataDir, "cache", "thumbnails")
	thumbService, err := imagebed.NewService(conn, "https://ops.test", imagebedCache, sourceService, capabilityService, fileService)
	if err != nil {
		t.Fatal(err)
	}
	sessions := auth.NewSessions(conn, time.Hour)
	service := NewService(conn, filepath.Join(dataDir, "omnistore.db"), dataDir, "2.0.0-test",
		sourceService, fileService, thumbService, transferService, sessions, nil)
	return service, sourceService, source, fileService, owner.ID
}

func TestGetStatusAggregatesHealth(t *testing.T) {
	service, _, source, fileService, owner := newOperationsFixture(t)

	// 经文件服务上传普通文件（入台账）+ 创建活跃发件包（托管载荷），验证统计口径。
	if _, _, err := fileService.Upload(source, "", "a.txt", strings.NewReader("12345"), false); err != nil {
		t.Fatal(err)
	}
	send, _, err := service.transfers.CreateSend(transfers.CreateSendInput{OwnerUserID: owner, Title: "活跃包"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.transfers.AddSendUpload(send.ID, owner, "payload.bin", strings.NewReader("PAYLOAD")); err != nil {
		t.Fatal(err)
	}

	status, err := service.GetStatus()
	if err != nil {
		t.Fatal(err)
	}
	if status.Version != "2.0.0-test" || status.Database.QuickCheck != "ok" {
		t.Fatalf("system/db health: %+v", status.Database)
	}
	if status.Database.TableRows["transfers"] != 1 {
		t.Fatalf("table rows=%+v", status.Database.TableRows)
	}
	var sourceHealth *SourceHealth
	for i := range status.Sources {
		if status.Sources[i].Key == source.Key {
			sourceHealth = &status.Sources[i]
		}
	}
	if sourceHealth == nil {
		t.Fatalf("source missing: %+v", status.Sources)
	}
	// 物理用量 = 台账文件(5) + 托管根标识 + 托管载荷(7)；台账只计普通文件。
	if !sourceHealth.RootAccessible || sourceHealth.LedgerBytes != 5 || sourceHealth.UsageBytes < 12 {
		t.Fatalf("source health=%+v", sourceHealth)
	}
	if sourceHealth.LedgerBytes > sourceHealth.UsageBytes {
		t.Fatalf("ledger %d must not exceed physical %d", sourceHealth.LedgerBytes, sourceHealth.UsageBytes)
	}
	// 物理用量包含 .omnistore 托管载荷（7 字节），台账只计普通文件（5 字节）。
	if sourceHealth.ActiveTransfers != 1 {
		t.Fatalf("active transfers=%d", sourceHealth.ActiveTransfers)
	}
	var transferCap *CapabilityHealth
	for i := range status.Capabilities {
		if status.Capabilities[i].Capability == "transfer_center" {
			transferCap = &status.Capabilities[i]
		}
	}
	if transferCap == nil || !transferCap.Enabled || transferCap.SourceDisabled {
		t.Fatalf("transfer capability=%+v", transferCap)
	}
	if status.Transfers.PayloadBytes != 7 || status.Transfers.DraftSends != 1 {
		t.Fatalf("transfer usage=%+v", status.Transfers)
	}
}

func TestRunIntegrityCheckAndCleanup(t *testing.T) {
	service, _, source, _, owner := newOperationsFixture(t)
	send, _, err := service.transfers.CreateSend(transfers.CreateSendInput{OwnerUserID: owner})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.transfers.AddSendUpload(send.ID, owner, "gone.txt", strings.NewReader("X")); err != nil {
		t.Fatal(err)
	}

	report, err := service.RunIntegrityCheck()
	if err != nil {
		t.Fatal(err)
	}
	if !report.OK || report.Integrity[0] != "ok" || report.FKViolations != 0 {
		t.Fatalf("integrity=%+v", report)
	}

	// 撤销后载荷应被清理编排删除。
	if err := service.transfers.RevokeSend(send.ID, owner); err != nil {
		t.Fatal(err)
	}
	result, err := service.RunCleanup(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result.TransferGC.TransfersSwept != 1 {
		t.Fatalf("cleanup=%+v", result)
	}
	if _, err := os.Stat(filepath.Join(source.RootPath, ".omnistore", "transfer", "send", send.PublicKey)); !os.IsNotExist(err) {
		t.Fatalf("revoked payload survived cleanup: %v", err)
	}
}
