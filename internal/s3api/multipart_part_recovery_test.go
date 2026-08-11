package s3api

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func stagedMultipartPartOperation(t *testing.T, f *s3Fixture, key, uploadID string, partNumber int,
	content string) (multipartPartOperation, *MultipartPart) {
	t.Helper()
	upload, err := f.multipart.Get(1, f.storageSourceID, key, uploadID)
	if err != nil {
		t.Fatal(err)
	}
	previous, err := f.multipart.currentMultipartPart(uploadID, partNumber)
	if err != nil {
		t.Fatal(err)
	}
	dir := f.multipart.uploadDir(uploadID)
	temp, err := os.CreateTemp(dir, ".part-*.tmp")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := temp.WriteString(content); err != nil {
		t.Fatal(err)
	}
	if err := temp.Sync(); err != nil {
		t.Fatal(err)
	}
	if err := temp.Close(); err != nil {
		t.Fatal(err)
	}
	if err := syncMultipartDirectory(dir); err != nil {
		t.Fatal(err)
	}
	digest := md5.Sum([]byte(content))
	createdAt := time.Now().UTC().Add(time.Second)
	op := f.multipart.newMultipartPartOperation(*upload, partNumber, filepath.Base(temp.Name()),
		`"`+hex.EncodeToString(digest[:])+`"`, int64(len(content)), createdAt, previous)
	if err := f.multipart.writeMultipartPartOperation(op); err != nil {
		t.Fatal(err)
	}
	return op, previous
}

func assertNoMultipartPartOperation(t *testing.T, store *MultipartStore, op multipartPartOperation) {
	t.Helper()
	if _, err := os.Lstat(store.partOperationPath(op.UploadID, op.PartNumber)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("part operation journal remains: %v", err)
	}
	_, _, backup := store.multipartPartOperationPaths(op)
	if _, err := os.Lstat(backup); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("part backup remains: %v", err)
	}
}

func assertMultipartPartState(t *testing.T, store *MultipartStore, op multipartPartOperation,
	etag string, size int64, createdAt time.Time, content string) {
	t.Helper()
	part, err := store.currentMultipartPart(op.UploadID, op.PartNumber)
	if err != nil {
		t.Fatal(err)
	}
	if part == nil || !sameMultipartPart(*part, etag, size, createdAt) {
		t.Fatalf("unexpected database part: %+v", part)
	}
	contentPath := store.partPath(op.UploadID, op.PartNumber)
	actual, err := os.ReadFile(contentPath)
	if err != nil || string(actual) != content {
		t.Fatalf("part content=%q err=%v", actual, err)
	}
}

func installStagedMultipartPart(t *testing.T, store *MultipartStore, op multipartPartOperation) {
	t.Helper()
	temp, final, backup := store.multipartPartOperationPaths(op)
	if op.PreviousExists {
		if err := os.Rename(final, backup); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Rename(temp, final); err != nil {
		t.Fatal(err)
	}
	if err := syncMultipartDirectory(store.uploadDir(op.UploadID)); err != nil {
		t.Fatal(err)
	}
}

func TestRecoverMultipartPartRollsBackDurableIntent(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-intent.bin"
	uploadID := initiateMultipart(t, f, key)
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "new")

	result, err := f.multipart.RecoverMultipartPartOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackParts != 1 || result.CompletedParts != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if part, err := f.multipart.currentMultipartPart(uploadID, 1); err != nil || part != nil {
		t.Fatalf("intent persisted part=%+v err=%v", part, err)
	}
	assertNoMultipartPartOperation(t, f.multipart, op)
}

func TestRecoverMultipartPartFinishesInterruptedNewPartRollback(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-rollback-cleanup.bin"
	uploadID := initiateMultipart(t, f, key)
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "new")
	temp, _, _ := f.multipart.multipartPartOperationPaths(op)
	if err := os.Remove(temp); err != nil {
		t.Fatal(err)
	}

	result, err := f.multipart.RecoverMultipartPartOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackParts != 1 || result.CompletedParts != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	assertNoMultipartPartOperation(t, f.multipart, op)
}

func TestRecoverMultipartPartRestoresPreviousFileAfterBackupRename(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-backup.bin"
	uploadID := initiateMultipart(t, f, key)
	uploadMultipartPart(t, f, key, uploadID, 1, []byte("old"))
	op, previous := stagedMultipartPartOperation(t, f, key, uploadID, 1, "new")
	_, final, backup := f.multipart.multipartPartOperationPaths(op)
	if err := os.Rename(final, backup); err != nil {
		t.Fatal(err)
	}
	if err := syncMultipartDirectory(f.multipart.uploadDir(uploadID)); err != nil {
		t.Fatal(err)
	}

	result, err := f.multipart.RecoverMultipartPartOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackParts != 1 || previous == nil {
		t.Fatalf("unexpected recovery=%+v previous=%+v", result, previous)
	}
	assertMultipartPartState(t, f.multipart, op, previous.ETag, previous.Size, previous.CreatedAt, "old")
	assertNoMultipartPartOperation(t, f.multipart, op)
}

func TestRecoverMultipartPartCommitsInstalledReplacement(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-installed.bin"
	uploadID := initiateMultipart(t, f, key)
	uploadMultipartPart(t, f, key, uploadID, 1, []byte("old"))
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "new-content")
	installStagedMultipartPart(t, f.multipart, op)

	result, err := f.multipart.RecoverMultipartPartOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedParts != 1 || result.RolledBackParts != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	assertMultipartPartState(t, f.multipart, op, op.ETag, op.Size, op.CreatedAt, "new-content")
	var updatedAt time.Time
	if err := f.multipart.db.QueryRow(`SELECT updated_at FROM s3_multipart_uploads WHERE upload_id = ?`, uploadID).Scan(&updatedAt); err != nil || !updatedAt.Equal(op.CreatedAt) {
		t.Fatalf("upload updated_at=%s want=%s err=%v", updatedAt, op.CreatedAt, err)
	}
	assertNoMultipartPartOperation(t, f.multipart, op)
}

func TestRecoverMultipartPartCleansDatabaseCommittedOperation(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-committed.bin"
	uploadID := initiateMultipart(t, f, key)
	uploadMultipartPart(t, f, key, uploadID, 1, []byte("old"))
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "committed")
	installStagedMultipartPart(t, f.multipart, op)
	if err := f.multipart.commitMultipartPartOperation(op); err != nil {
		t.Fatal(err)
	}

	result, err := f.multipart.RecoverMultipartPartOperations()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedParts != 1 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	assertMultipartPartState(t, f.multipart, op, op.ETag, op.Size, op.CreatedAt, "committed")
	assertNoMultipartPartOperation(t, f.multipart, op)
}

func TestMultipartPartDatabaseFailureRestoresPreviousPart(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-db-failure.bin"
	uploadID := initiateMultipart(t, f, key)
	uploadMultipartPart(t, f, key, uploadID, 1, []byte("old"))
	previous, err := f.multipart.currentMultipartPart(uploadID, 1)
	if err != nil || previous == nil {
		t.Fatalf("previous=%+v err=%v", previous, err)
	}
	if _, err := f.multipart.db.Exec(`CREATE TRIGGER fail_multipart_part
  BEFORE INSERT ON s3_multipart_parts BEGIN SELECT RAISE(FAIL, 'injected part failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.multipart.UploadPart(1, f.storageSourceID, key, uploadID, 1, strings.NewReader("new")); err == nil {
		t.Fatal("part upload unexpectedly succeeded")
	}
	if _, err := f.multipart.db.Exec(`DROP TRIGGER fail_multipart_part`); err != nil {
		t.Fatal(err)
	}
	op := multipartPartOperation{UploadID: uploadID, PartNumber: 1}
	assertMultipartPartState(t, f.multipart, op, previous.ETag, previous.Size, previous.CreatedAt, "old")
	if count, err := f.multipart.multipartPartOperationCountForUpload(uploadID); err != nil || count != 0 {
		t.Fatalf("part operation count=%d err=%v", count, err)
	}
	if _, err := os.Lstat(f.multipart.partPath(uploadID, 1) + ".previous"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("part backup remains: %v", err)
	}
}

func TestMultipartCleanupSkipsPendingPartOperation(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-cleanup.bin"
	uploadID := initiateMultipart(t, f, key)
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "pending")
	if count, err := f.multipart.UserPartOperationCount(op.OwnerUserID); err != nil || count != 1 {
		t.Fatalf("user part operation count=%d err=%v", count, err)
	}
	old := time.Now().UTC().Add(-2 * MultipartMaxAge)
	if _, err := f.multipart.db.Exec(`UPDATE s3_multipart_uploads SET updated_at = ? WHERE upload_id = ?`, old, uploadID); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(f.multipart.uploadDir(uploadID), old, old); err != nil {
		t.Fatal(err)
	}

	result, err := f.multipart.CleanupExpired(MultipartMaxAge)
	if err != nil {
		t.Fatal(err)
	}
	if result.UploadsRemoved != 0 || result.OrphansRemoved != 0 {
		t.Fatalf("pending operation was cleaned: %+v", result)
	}
	if _, err := os.Stat(f.multipart.partOperationPath(uploadID, 1)); err != nil {
		t.Fatalf("pending operation was removed: %v", err)
	}
	if _, err := f.multipart.Get(1, f.storageSourceID, key, uploadID); err != nil {
		t.Fatalf("pending upload was removed: %v", err)
	}
	if _, err := os.Stat(f.multipart.partOperationPath(op.UploadID, op.PartNumber)); err != nil {
		t.Fatalf("pending operation journal missing: %v", err)
	}
}

func TestMultipartAbortRemovesPendingPartOperation(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-abort.bin"
	uploadID := initiateMultipart(t, f, key)
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "pending")

	if err := f.multipart.Abort(1, f.storageSourceID, key, uploadID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.multipart.Get(1, f.storageSourceID, key, uploadID); !errors.Is(err, ErrNoSuchUpload) {
		t.Fatalf("aborted upload remains: %v", err)
	}
	if _, err := os.Stat(f.multipart.uploadDir(uploadID)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("aborted part directory remains: %v", err)
	}
	assertNoMultipartPartOperation(t, f.multipart, op)
}

func TestUnauthorizedMultipartPartRequestDoesNotTriggerRecovery(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-auth-boundary.bin"
	uploadID := initiateMultipart(t, f, key)
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "pending")

	if _, err := f.multipart.UploadPart(999, f.storageSourceID, key, uploadID, 1, strings.NewReader("attack")); !errors.Is(err, ErrNoSuchUpload) {
		t.Fatalf("unexpected unauthorized error: %v", err)
	}
	if _, err := os.Stat(f.multipart.partOperationPath(op.UploadID, op.PartNumber)); err != nil {
		t.Fatalf("unauthorized request changed journal: %v", err)
	}
	temp, _, _ := f.multipart.multipartPartOperationPaths(op)
	if content, err := os.ReadFile(temp); err != nil || string(content) != "pending" {
		t.Fatalf("unauthorized request changed temp=%q err=%v", content, err)
	}
}

func TestMultipartCompleteResolvesInstalledPartOperation(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-complete.bin"
	uploadID := initiateMultipart(t, f, key)
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "complete-me")
	installStagedMultipartPart(t, f.multipart, op)

	if _, _, err := f.multipart.Complete(1, mustFixtureSource(t, f), key, uploadID,
		[]CompletedPart{{PartNumber: 1, ETag: op.ETag}}); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(f.root, key))
	if err != nil || string(content) != "complete-me" {
		t.Fatalf("completed content=%q err=%v", content, err)
	}
	assertNoMultipartPartOperation(t, f.multipart, op)
}

func TestRecoverMultipartPartRejectsDatabaseMismatch(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-mismatch.bin"
	uploadID := initiateMultipart(t, f, key)
	op, _ := stagedMultipartPartOperation(t, f, key, uploadID, 1, "pending")
	if _, err := f.multipart.db.Exec(`UPDATE s3_multipart_uploads SET object_key = 'changed.bin' WHERE upload_id = ?`, uploadID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.multipart.RecoverMultipartPartOperations(); err == nil || !strings.Contains(err.Error(), "Upload 状态不一致") {
		t.Fatalf("expected journal/database mismatch, got %v", err)
	}
	if _, err := os.Stat(f.multipart.partOperationPath(op.UploadID, op.PartNumber)); err != nil {
		t.Fatalf("mismatched journal was removed: %v", err)
	}
}

func TestRecoverMultipartPartRejectsCorruptJournal(t *testing.T) {
	f := newS3Fixture(t)
	dir := f.multipart.partOperationsDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	uploadID := "mpu_" + strings.Repeat("3", 48)
	path := filepath.Join(dir, multipartPartOperationName(uploadID, 1)+".json")
	if err := os.WriteFile(path, []byte("not-json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := f.multipart.RecoverMultipartPartOperations(); err == nil || !strings.Contains(err.Error(), "读取 Multipart 分片操作日志") {
		t.Fatalf("expected corrupt journal error, got %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("corrupt journal was removed: %v", err)
	}
}

func TestRecoverMultipartPartPreservesAmbiguousReplacement(t *testing.T) {
	f := newS3Fixture(t)
	key := "part-ambiguous.bin"
	uploadID := initiateMultipart(t, f, key)
	uploadMultipartPart(t, f, key, uploadID, 1, []byte("old"))
	op, previous := stagedMultipartPartOperation(t, f, key, uploadID, 1, "new")
	temp, final, _ := f.multipart.multipartPartOperationPaths(op)
	newContent, err := os.ReadFile(temp)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(final, newContent, 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := f.multipart.RecoverMultipartPartOperations(); err == nil || !strings.Contains(err.Error(), "旧备份不存在") {
		t.Fatalf("expected ambiguous state error, got %v", err)
	}
	if previous == nil {
		t.Fatal("previous database part missing")
	}
	part, err := f.multipart.currentMultipartPart(uploadID, 1)
	if err != nil || part == nil || !sameMultipartPart(*part, previous.ETag, previous.Size, previous.CreatedAt) {
		t.Fatalf("database state changed: part=%+v err=%v", part, err)
	}
	if _, err := os.Stat(temp); err != nil {
		t.Fatalf("ambiguous temp was removed: %v", err)
	}
	if _, err := os.Stat(f.multipart.partOperationPath(uploadID, 1)); err != nil {
		t.Fatalf("ambiguous journal was removed: %v", err)
	}
}

func TestConcurrentMultipartPartUploadsLeaveNoRecoveryArtifacts(t *testing.T) {
	f := newS3Fixture(t)
	const total = 20
	type pending struct{ key, uploadID string }
	items := make([]pending, 0, total)
	for index := range total {
		key := fmt.Sprintf("parallel/part-%02d.bin", index)
		items = append(items, pending{key: key, uploadID: initiateMultipart(t, f, key)})
	}
	errs := make(chan error, total)
	for _, item := range items {
		go func() {
			_, err := f.multipart.UploadPart(1, f.storageSourceID, item.key, item.uploadID, 1,
				strings.NewReader(item.key))
			errs <- err
		}()
	}
	for range total {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(f.multipart.partOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("part operation artifacts remain: %v", entries)
	}
}
