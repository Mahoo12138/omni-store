package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/auth"
)

func TestRecoverTrashOperationsRollsBackUncommittedMove(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	sourceAbs := filepath.Join(root, "interrupted.txt")
	if err := os.WriteFile(sourceAbs, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	trashKey := auth.NewRandomToken("trh-", 12)
	op := trashOperation{
		Version: trashOperationVersion, Kind: trashOperationMove, TrashKey: trashKey,
		StorageSourceID: source.ID, SourceRelativePath: "interrupted.txt",
	}
	if err := service.writeTrashOperation(op); err != nil {
		t.Fatal(err)
	}
	payloadAbs := service.trashPayloadPath(trashKey)
	if err := os.MkdirAll(filepath.Dir(payloadAbs), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := moveFilesystemTree(sourceAbs, payloadAbs); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.RolledBackMoves != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	content, err := os.ReadFile(sourceAbs)
	if err != nil || string(content) != "original" {
		t.Fatalf("rolled back source=%q err=%v", content, err)
	}
	assertTrashOperationRemoved(t, service, trashKey)
}

func TestRecoverTrashOperationsRecognizesCommittedMove(t *testing.T) {
	service, source, _ := newQuotaTestService(t, 0)
	userID := insertTrashRecoveryUser(t, service, 201)
	if _, _, err := service.UploadWithLockTokens(source, "", "committed.txt", strings.NewReader("data"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	entry, err := service.MoveToTrash(source, "committed.txt", userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.writeTrashOperation(trashOperation{
		Version: trashOperationVersion, Kind: trashOperationMove, TrashKey: entry.Key,
		StorageSourceID: source.ID, SourceRelativePath: "committed.txt",
	}); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.CompletedMoves != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	if _, err := os.Stat(service.trashPayloadPath(entry.Key)); err != nil {
		t.Fatalf("committed payload missing: %v", err)
	}
	if _, err := service.GetTrash(source, entry.Key); err != nil {
		t.Fatalf("committed metadata missing: %v", err)
	}
	assertTrashOperationRemoved(t, service, entry.Key)
}

func TestRecoverTrashOperationsUsesReadyPayloadAfterInterruptedCrossDeviceMove(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	trashKey := auth.NewRandomToken("trh-", 12)
	op := trashOperation{
		Version: trashOperationVersion, Kind: trashOperationMove, TrashKey: trashKey,
		StorageSourceID: source.ID, SourceRelativePath: "cross-device.txt",
	}
	if err := service.writeTrashOperation(op); err != nil {
		t.Fatal(err)
	}
	payloadAbs := service.trashPayloadPath(trashKey)
	if err := os.MkdirAll(filepath.Dir(payloadAbs), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(payloadAbs, []byte("complete payload"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "cross-device.txt"), []byte("partial source"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.markTrashOperationDestinationReady(trashKey); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.RolledBackMoves != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	content, err := os.ReadFile(filepath.Join(root, "cross-device.txt"))
	if err != nil || string(content) != "complete payload" {
		t.Fatalf("recovered source=%q err=%v", content, err)
	}
}

func TestRecoverTrashOperationsFinishesInterruptedMoveRollback(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	trashKey := auth.NewRandomToken("trh-", 12)
	if err := service.writeTrashOperation(trashOperation{
		Version: trashOperationVersion, Kind: trashOperationMove, TrashKey: trashKey,
		StorageSourceID: source.ID, SourceRelativePath: "rollback.txt",
	}); err != nil {
		t.Fatal(err)
	}
	payloadAbs := service.trashPayloadPath(trashKey)
	if err := os.MkdirAll(filepath.Dir(payloadAbs), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(payloadAbs, []byte("partial old payload"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "rollback.txt"), []byte("complete restored source"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.markTrashOperationDestinationReady(trashKey); err != nil {
		t.Fatal(err)
	}
	if err := service.markTrashOperationRollbackReady(trashKey); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.RolledBackMoves != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	content, err := os.ReadFile(filepath.Join(root, "rollback.txt"))
	if err != nil || string(content) != "complete restored source" {
		t.Fatalf("restored source=%q err=%v", content, err)
	}
	if _, err := os.Stat(payloadAbs); !os.IsNotExist(err) {
		t.Fatalf("old payload remains: %v", err)
	}
}

func TestRecoverTrashOperationsRollsBackUncommittedRestore(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := insertTrashRecoveryUser(t, service, 202)
	if _, _, err := service.UploadWithLockTokens(source, "", "restore.txt", strings.NewReader("data"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	entry, err := service.MoveToTrash(source, "restore.txt", userID)
	if err != nil {
		t.Fatal(err)
	}
	targetAbs := filepath.Join(root, "restored.txt")
	if err := service.writeTrashOperation(trashOperation{
		Version: trashOperationVersion, Kind: trashOperationRestore, TrashKey: entry.Key,
		StorageSourceID: source.ID, RestoreRelativePath: "restored.txt",
	}); err != nil {
		t.Fatal(err)
	}
	if err := moveFilesystemTree(service.trashPayloadPath(entry.Key), targetAbs); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.RolledBackRestores != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	if _, err := os.Stat(targetAbs); !os.IsNotExist(err) {
		t.Fatalf("uncommitted restore target remains: %v", err)
	}
	if _, err := os.Stat(service.trashPayloadPath(entry.Key)); err != nil {
		t.Fatalf("trash payload was not restored: %v", err)
	}
	if _, err := service.GetTrash(source, entry.Key); err != nil {
		t.Fatalf("trash metadata was not retained: %v", err)
	}
}

func TestRecoverTrashOperationsRecognizesCommittedRestore(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := insertTrashRecoveryUser(t, service, 203)
	if _, _, err := service.UploadWithLockTokens(source, "", "restore.txt", strings.NewReader("data"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	entry, err := service.MoveToTrash(source, "restore.txt", userID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.RestoreTrash(source, entry.Key, "restored.txt", userID); err != nil {
		t.Fatal(err)
	}
	if err := service.writeTrashOperation(trashOperation{
		Version: trashOperationVersion, Kind: trashOperationRestore, TrashKey: entry.Key,
		StorageSourceID: source.ID, RestoreRelativePath: "restored.txt",
	}); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.CompletedRestores != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	content, err := os.ReadFile(filepath.Join(root, "restored.txt"))
	if err != nil || string(content) != "data" {
		t.Fatalf("completed restore content=%q err=%v", content, err)
	}
	assertTrashOperationRemoved(t, service, entry.Key)
}

func TestRecoverTrashOperationsUsesReadyTargetAfterInterruptedCrossDeviceRestore(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := insertTrashRecoveryUser(t, service, 205)
	if _, _, err := service.UploadWithLockTokens(source, "", "restore.txt", strings.NewReader("complete target"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	entry, err := service.MoveToTrash(source, "restore.txt", userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.writeTrashOperation(trashOperation{
		Version: trashOperationVersion, Kind: trashOperationRestore, TrashKey: entry.Key,
		StorageSourceID: source.ID, RestoreRelativePath: "restored.txt",
	}); err != nil {
		t.Fatal(err)
	}
	targetAbs := filepath.Join(root, "restored.txt")
	if err := copyFilesystemTree(service.trashPayloadPath(entry.Key), targetAbs); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(service.trashPayloadPath(entry.Key), []byte("partial payload"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.markTrashOperationDestinationReady(entry.Key); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.RolledBackRestores != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	content, err := os.ReadFile(service.trashPayloadPath(entry.Key))
	if err != nil || string(content) != "complete target" {
		t.Fatalf("recovered payload=%q err=%v", content, err)
	}
	if _, err := os.Stat(targetAbs); !os.IsNotExist(err) {
		t.Fatalf("restore target remains after rollback: %v", err)
	}
}

func TestRecoverTrashOperationsFinishesInterruptedRestoreRollback(t *testing.T) {
	service, source, root := newQuotaTestService(t, 0)
	userID := insertTrashRecoveryUser(t, service, 206)
	if _, _, err := service.UploadWithLockTokens(source, "", "restore.txt", strings.NewReader("complete payload"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	entry, err := service.MoveToTrash(source, "restore.txt", userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.writeTrashOperation(trashOperation{
		Version: trashOperationVersion, Kind: trashOperationRestore, TrashKey: entry.Key,
		StorageSourceID: source.ID, RestoreRelativePath: "restored.txt",
	}); err != nil {
		t.Fatal(err)
	}
	targetAbs := filepath.Join(root, "restored.txt")
	if err := os.WriteFile(targetAbs, []byte("partial target"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.markTrashOperationDestinationReady(entry.Key); err != nil {
		t.Fatal(err)
	}
	if err := service.markTrashOperationRollbackReady(entry.Key); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.RolledBackRestores != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	content, err := os.ReadFile(service.trashPayloadPath(entry.Key))
	if err != nil || string(content) != "complete payload" {
		t.Fatalf("restored payload=%q err=%v", content, err)
	}
	if _, err := os.Stat(targetAbs); !os.IsNotExist(err) {
		t.Fatalf("partial target remains: %v", err)
	}
}

func TestRecoverTrashOperationsCompletesInterruptedPurge(t *testing.T) {
	service, source, _ := newQuotaTestService(t, 0)
	userID := insertTrashRecoveryUser(t, service, 204)
	if _, _, err := service.UploadWithLockTokens(source, "", "purge.txt", strings.NewReader("data"), false, nil, &userID); err != nil {
		t.Fatal(err)
	}
	entry, err := service.MoveToTrash(source, "purge.txt", userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.writeTrashOperation(trashOperation{
		Version: trashOperationVersion, Kind: trashOperationPurge, TrashKey: entry.Key,
		StorageSourceID: source.ID,
	}); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Dir(service.trashPayloadPath(entry.Key))); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecoverTrashOperations()
	if err != nil || result.CompletedPurges != 1 {
		t.Fatalf("RecoverTrashOperations()=%+v, %v", result, err)
	}
	if _, err := service.GetTrash(source, entry.Key); err != ErrTrashNotFound {
		t.Fatalf("purged metadata error=%v", err)
	}
	usage, err := service.UserUsage(userID)
	if err != nil || usage != 0 {
		t.Fatalf("purge recovery usage=%d err=%v", usage, err)
	}
	assertTrashOperationRemoved(t, service, entry.Key)
}

func TestRecoverTrashOperationsRejectsCorruptJournal(t *testing.T) {
	service, _, _ := newQuotaTestService(t, 0)
	if err := os.MkdirAll(service.trashOperationsDir(), 0o700); err != nil {
		t.Fatal(err)
	}
	journalPath := filepath.Join(service.trashOperationsDir(), "broken.json")
	if err := os.WriteFile(journalPath, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecoverTrashOperations(); err == nil {
		t.Fatal("corrupt operation journal must block recovery")
	}
	if _, err := os.Stat(journalPath); err != nil {
		t.Fatalf("corrupt journal must be retained for inspection: %v", err)
	}
}

func insertTrashRecoveryUser(t *testing.T, service *Service, userID int64) int64 {
	t.Helper()
	if _, err := service.db.Exec(`INSERT INTO users
  (id, user_public_id, username, display_name, password_hash, role, is_disabled, quota_bytes, created_at, updated_at)
  VALUES (?, ?, ?, 'Trash Recovery', 'hash', 'user', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		userID, auth.NewPublicID("u"), auth.NewRandomToken("trash-recovery-", 4)); err != nil {
		t.Fatal(err)
	}
	return userID
}

func assertTrashOperationRemoved(t *testing.T, service *Service, trashKey string) {
	t.Helper()
	if _, err := os.Stat(service.trashOperationPath(trashKey)); !os.IsNotExist(err) {
		t.Fatalf("operation journal still exists: %v", err)
	}
}
