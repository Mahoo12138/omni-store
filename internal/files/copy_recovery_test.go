package files

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
)

func TestRecoverCopyRemovesPartialStagingAndBoundsSourceDeletion(t *testing.T) {
	service, source, target, _, targetRoot, _ := newTransferRecoveryFixture(t)
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	op := service.newCopyOperation(source.ID, target.ID, "archive/copied", true)
	if err := service.writeCopyOperation(op); err != nil {
		t.Fatal(err)
	}
	stagingAbs, targetAbs, err := service.copyOperationPaths(op, target)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(stagingAbs, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stagingAbs, "partial.txt"), []byte("partial"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, sourceID := range []int64{source.ID, target.ID} {
		if count, err := service.SourceCopyOperationCount(sourceID); err != nil || count != 1 {
			t.Fatalf("source %d copy count=%d err=%v", sourceID, count, err)
		}
	}
	listing, err := service.List(target, "archive", ListOptions{Page: 1, PageSize: 20}, true)
	if err != nil || listing.Total != 0 {
		t.Fatalf("staging leaked into list: %+v err=%v", listing, err)
	}
	objects, err := service.ListObjects(target)
	if err != nil || len(objects) != 0 {
		t.Fatalf("staging leaked into object list: %+v err=%v", objects, err)
	}

	result, err := service.RecoverCopyOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackCopies != 1 || result.CompletedCopies != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	for _, item := range []string{stagingAbs, targetAbs} {
		if _, err := os.Lstat(item); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("partial copy artifact remains at %s: %v", item, err)
		}
	}
	assertNoCopyOperation(t, service, op.OperationID)
}

func TestRecoverCopyRollsBackPublishedTargetBeforeDatabaseMarker(t *testing.T) {
	service, source, target, _, targetRoot, userID := newTransferRecoveryFixture(t)
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	op := service.newCopyOperation(source.ID, target.ID, "archive/copied.txt", false)
	if err := service.writeCopyOperation(op); err != nil {
		t.Fatal(err)
	}
	_, targetAbs, err := service.copyOperationPaths(op, target)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(targetAbs, []byte("published"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := service.RecordFile(target, op.TargetRelativePath, models.FileOwnerUser, &userID, &userID); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverCopyOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackCopies != 1 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if _, err := os.Lstat(targetAbs); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("uncommitted target remains: %v", err)
	}
	assertNoFileRecord(t, service, target.ID, op.TargetRelativePath)
	assertNoCopyOperation(t, service, op.OperationID)
}

func TestRecoverCopyKeepsDatabaseCommittedTarget(t *testing.T) {
	service, source, target, _, targetRoot, userID := newTransferRecoveryFixture(t)
	if err := os.Mkdir(filepath.Join(targetRoot, "archive"), 0o755); err != nil {
		t.Fatal(err)
	}
	op := service.newCopyOperation(source.ID, target.ID, "archive/committed.txt", false)
	if err := service.writeCopyOperation(op); err != nil {
		t.Fatal(err)
	}
	_, targetAbs, err := service.copyOperationPaths(op, target)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(targetAbs, []byte("committed"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := service.RecordFile(target, op.TargetRelativePath, models.FileOwnerUser, &userID, &userID); err != nil {
		t.Fatal(err)
	}
	if err := service.markCopyDatabaseReady(op.OperationID); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverCopyOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedCopies != 1 || result.RolledBackCopies != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if content, err := os.ReadFile(targetAbs); err != nil || string(content) != "committed" {
		t.Fatalf("committed target=%q err=%v", content, err)
	}
	assertFileRecord(t, service, target.ID, op.TargetRelativePath, op.TargetRelativePath, 9, models.FileOwnerUser, &userID)
	assertNoCopyOperation(t, service, op.OperationID)
}

func assertNoCopyOperation(t *testing.T, service *Service, operationID string) {
	t.Helper()
	for _, item := range []string{service.copyOperationPath(operationID), service.copyDatabaseReadyPath(operationID)} {
		if _, err := os.Lstat(item); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("copy recovery artifact remains at %s: %v", item, err)
		}
	}
}
