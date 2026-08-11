package s3api

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/models"
)

func stagedMultipartCompletion(t *testing.T, f *s3Fixture, key, content string) (multipartCompletion, string) {
	t.Helper()
	uploadID := initiateMultipart(t, f, key)
	partETag := uploadMultipartPart(t, f, key, uploadID, 1, []byte(content))
	parts, err := f.multipart.partsByNumber(uploadID)
	if err != nil {
		t.Fatal(err)
	}
	selected := []MultipartPart{parts[1]}
	contentSHA256, err := f.multipart.hashSelectedParts(uploadID, selected)
	if err != nil {
		t.Fatal(err)
	}
	digest, err := hex.DecodeString(normalizeETag(partETag))
	if err != nil {
		t.Fatal(err)
	}
	combined := md5.Sum(digest)
	etag := `"` + hex.EncodeToString(combined[:]) + "-1" + `"`
	previousExists, previousSize, previousMTimeNano, err := f.multipart.previousObjectState(mustFixtureSource(t, f), key)
	if err != nil {
		t.Fatal(err)
	}
	op := f.multipart.newMultipartCompletion(uploadID, 1, f.storageSourceID, key, etag, int64(len(content)), contentSHA256,
		previousExists, previousSize, previousMTimeNano)
	if err := f.multipart.writeMultipartCompletion(op); err != nil {
		t.Fatal(err)
	}
	if count, err := f.multipart.UserCompletionOperationCount(op.OwnerUserID); err != nil || count != 1 {
		t.Fatalf("user completion operation count=%d err=%v", count, err)
	}
	return op, partETag
}

func uploadCompletionObject(t *testing.T, f *s3Fixture, op multipartCompletion, content string) {
	t.Helper()
	source, err := f.handler.sources.Get(f.bucket)
	if err != nil {
		t.Fatal(err)
	}
	dir, name := filepath.ToSlash(filepath.Dir(op.ObjectKey)), filepath.Base(op.ObjectKey)
	if dir == "." {
		dir = ""
	} else if err := f.handler.files.EnsureObjectParents(source, op.ObjectKey); err != nil {
		t.Fatal(err)
	}
	ownerID := op.OwnerUserID
	if _, _, err := f.handler.files.UploadWithLockTokens(source, dir, name, strings.NewReader(content), true, nil, &ownerID); err != nil {
		t.Fatal(err)
	}
}

func assertNoMultipartCompletion(t *testing.T, store *MultipartStore, uploadID string) {
	t.Helper()
	if _, err := os.Lstat(store.completionOperationPath(uploadID)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("completion journal remains: %v", err)
	}
}

func TestRecoverMultipartCompletionRollsBackIntentWithoutFinalObject(t *testing.T) {
	f := newS3Fixture(t)
	op, _ := stagedMultipartCompletion(t, f, "pending.bin", "content")

	result, err := f.multipart.RecoverMultipartCompletions()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackUploads != 1 || result.CompletedUploads != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if _, err := f.multipart.Get(1, f.storageSourceID, op.ObjectKey, op.UploadID); err != nil {
		t.Fatalf("retryable upload was removed: %v", err)
	}
	if _, err := os.Stat(f.multipart.uploadDir(op.UploadID)); err != nil {
		t.Fatalf("retryable parts were removed: %v", err)
	}
	assertNoMultipartCompletion(t, f.multipart, op.UploadID)
}

func TestRecoverMultipartCompletionDoesNotMistakeIdenticalOldObjectForInstalledUpload(t *testing.T) {
	f := newS3Fixture(t)
	source := mustFixtureSource(t, f)
	ownerID := int64(1)
	if _, _, err := f.handler.files.UploadWithLockTokens(source, "", "identical.bin", strings.NewReader("content"), true, nil, &ownerID); err != nil {
		t.Fatal(err)
	}
	op, _ := stagedMultipartCompletion(t, f, "identical.bin", "content")
	if !op.PreviousObjectExists {
		t.Fatal("previous object state was not captured")
	}

	result, err := f.multipart.RecoverMultipartCompletions()
	if err != nil {
		t.Fatal(err)
	}
	if result.RolledBackUploads != 1 || result.CompletedUploads != 0 {
		t.Fatalf("identical old object was treated as installed: %+v", result)
	}
	if _, err := f.multipart.Get(1, f.storageSourceID, op.ObjectKey, op.UploadID); err != nil {
		t.Fatalf("retryable upload was removed: %v", err)
	}
	if content, err := os.ReadFile(filepath.Join(f.root, op.ObjectKey)); err != nil || string(content) != "content" {
		t.Fatalf("old object changed=%q err=%v", content, err)
	}
}

func TestRecoverMultipartCompletionFinalizesObjectMetadata(t *testing.T) {
	f := newS3Fixture(t)
	op, _ := stagedMultipartCompletion(t, f, "complete.bin", "content")
	uploadCompletionObject(t, f, op, "content")

	result, err := f.multipart.RecoverMultipartCompletions()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 || result.RolledBackUploads != 0 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if _, err := f.multipart.Get(1, f.storageSourceID, op.ObjectKey, op.UploadID); !errors.Is(err, ErrNoSuchUpload) {
		t.Fatalf("completed upload remains: %v", err)
	}
	entry, err := f.handler.files.Stat(mustFixtureSource(t, f), op.ObjectKey)
	if err != nil {
		t.Fatal(err)
	}
	if etag, found, err := f.multipart.ObjectETag(f.storageSourceID, op.ObjectKey, entry.Size, entry.MTime); err != nil || !found || etag != op.ETag {
		t.Fatalf("etag=%q found=%t err=%v", etag, found, err)
	}
	var ownerType string
	var ownerUserID int64
	if err := f.multipart.db.QueryRow(`SELECT owner_type, owner_user_id FROM file_records
  WHERE storage_source_id = ? AND relative_path = ?`, f.storageSourceID, op.ObjectKey).
		Scan(&ownerType, &ownerUserID); err != nil || ownerType != models.FileOwnerUser || ownerUserID != 1 {
		t.Fatalf("file owner=%s/%d err=%v", ownerType, ownerUserID, err)
	}
	if _, err := os.Stat(f.multipart.uploadDir(op.UploadID)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("part directory remains: %v", err)
	}
	assertNoMultipartCompletion(t, f.multipart, op.UploadID)
}

func TestRecoverMultipartCompletionAfterDatabaseCommitDoesNotReviveObject(t *testing.T) {
	f := newS3Fixture(t)
	op, _ := stagedMultipartCompletion(t, f, "deleted-after-commit.bin", "content")
	uploadCompletionObject(t, f, op, "content")
	source := mustFixtureSource(t, f)
	matches, info, release, err := f.multipart.objectMatchesCompletion(source, op)
	if err != nil || !matches {
		t.Fatalf("matches=%t err=%v", matches, err)
	}
	if err := f.multipart.commitMultipartCompletion(op, info); err != nil {
		release()
		t.Fatal(err)
	}
	release()
	if err := os.Remove(filepath.Join(f.root, filepath.FromSlash(op.ObjectKey))); err != nil {
		t.Fatal(err)
	}

	result, err := f.multipart.RecoverMultipartCompletions()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if _, err := os.Stat(filepath.Join(f.root, filepath.FromSlash(op.ObjectKey))); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("deleted object was revived: %v", err)
	}
	assertNoMultipartCompletion(t, f.multipart, op.UploadID)
}

func TestMultipartCompleteDatabaseFailureRecoversOnRestart(t *testing.T) {
	f := newS3Fixture(t)
	key := "db-failure.bin"
	uploadID := initiateMultipart(t, f, key)
	partETag := uploadMultipartPart(t, f, key, uploadID, 1, []byte("content"))
	if _, err := f.multipart.db.Exec(`CREATE TRIGGER fail_multipart_completion
  BEFORE DELETE ON s3_multipart_uploads BEGIN SELECT RAISE(FAIL, 'injected completion failure'); END`); err != nil {
		t.Fatal(err)
	}
	_, _, err := f.multipart.Complete(1, mustFixtureSource(t, f), key, uploadID,
		[]CompletedPart{{PartNumber: 1, ETag: partETag}})
	if err == nil {
		t.Fatal("completion unexpectedly succeeded")
	}
	if _, err := os.Stat(filepath.Join(f.root, key)); err != nil {
		t.Fatalf("final object missing after database failure: %v", err)
	}
	if _, err := os.Stat(f.multipart.completionOperationPath(uploadID)); err != nil {
		t.Fatalf("completion journal missing: %v", err)
	}
	var etagCount int
	if err := f.multipart.db.QueryRow(`SELECT COUNT(*) FROM s3_object_etags WHERE storage_source_id = ? AND object_key = ?`,
		f.storageSourceID, key).Scan(&etagCount); err != nil || etagCount != 0 {
		t.Fatalf("failed transaction left etag count=%d err=%v", etagCount, err)
	}
	if _, err := f.multipart.db.Exec(`DROP TRIGGER fail_multipart_completion`); err != nil {
		t.Fatal(err)
	}

	result, err := f.multipart.RecoverMultipartCompletions()
	if err != nil {
		t.Fatal(err)
	}
	if result.CompletedUploads != 1 {
		t.Fatalf("unexpected recovery result: %+v", result)
	}
	if _, err := f.multipart.Get(1, f.storageSourceID, key, uploadID); !errors.Is(err, ErrNoSuchUpload) {
		t.Fatalf("upload remains after recovery: %v", err)
	}
}

func TestMultipartCleanupSkipsPendingCompletion(t *testing.T) {
	f := newS3Fixture(t)
	f.multipart.now = func() time.Time { return f.now }
	op, _ := stagedMultipartCompletion(t, f, "cleanup-pending.bin", "content")
	old := f.now.Add(-MultipartMaxAge - time.Minute)
	if _, err := f.multipart.db.Exec(`UPDATE s3_multipart_uploads SET updated_at = ? WHERE upload_id = ?`, old, op.UploadID); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(f.multipart.uploadDir(op.UploadID), old, old); err != nil {
		t.Fatal(err)
	}
	result, err := f.multipart.CleanupExpired(MultipartMaxAge)
	if err != nil {
		t.Fatal(err)
	}
	if result.UploadsRemoved != 0 || result.OrphansRemoved != 0 {
		t.Fatalf("pending completion was cleaned: %+v", result)
	}
	if _, err := f.multipart.Get(1, f.storageSourceID, op.ObjectKey, op.UploadID); err != nil {
		t.Fatalf("pending upload missing: %v", err)
	}
}

func TestRecoverMultipartCompletionRejectsCorruptJournal(t *testing.T) {
	f := newS3Fixture(t)
	if err := os.MkdirAll(f.multipart.completionOperationsDir(), 0o700); err != nil {
		t.Fatal(err)
	}
	uploadID := "mpu_" + strings.Repeat("a", 48)
	if err := os.WriteFile(f.multipart.completionOperationPath(uploadID), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := f.multipart.RecoverMultipartCompletions(); err == nil || !strings.Contains(err.Error(), "读取 Multipart 完成操作日志") {
		t.Fatalf("expected corrupt journal error, got %v", err)
	}
}

func TestRecoverMultipartCompletionRejectsJournalDatabaseMismatch(t *testing.T) {
	f := newS3Fixture(t)
	op, _ := stagedMultipartCompletion(t, f, "database-mismatch.bin", "content")
	if _, err := f.multipart.db.Exec(`UPDATE s3_multipart_uploads SET object_key = 'changed.bin' WHERE upload_id = ?`, op.UploadID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.multipart.RecoverMultipartCompletions(); err == nil || !strings.Contains(err.Error(), "日志与 Upload 状态不一致") {
		t.Fatalf("expected journal/database mismatch, got %v", err)
	}
	if _, err := os.Stat(f.multipart.completionOperationPath(op.UploadID)); err != nil {
		t.Fatalf("mismatched journal was removed: %v", err)
	}
	if _, err := os.Stat(f.multipart.uploadDir(op.UploadID)); err != nil {
		t.Fatalf("mismatched parts were removed: %v", err)
	}
}

func TestSourceCompletionOperationCount(t *testing.T) {
	f := newS3Fixture(t)
	op, _ := stagedMultipartCompletion(t, f, "source-guard.bin", "content")
	count, err := f.multipart.SourceCompletionOperationCount(f.storageSourceID)
	if err != nil || count != 1 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	if count, err := f.multipart.SourceCompletionOperationCount(f.storageSourceID + 1); err != nil || count != 0 {
		t.Fatalf("other source count=%d err=%v", count, err)
	}
	if !strings.HasSuffix(op.ETag, "-"+strconv.Itoa(1)+`"`) {
		t.Fatalf("unexpected etag %s", op.ETag)
	}
}

func TestConcurrentMultipartCompletionsLeaveNoRecoveryArtifacts(t *testing.T) {
	f := newS3Fixture(t)
	const total = 20
	type pending struct {
		key, uploadID, etag string
	}
	items := make([]pending, 0, total)
	for index := range total {
		key := fmt.Sprintf("parallel/complete-%02d.bin", index)
		uploadID := initiateMultipart(t, f, key)
		etag := uploadMultipartPart(t, f, key, uploadID, 1, []byte(key))
		items = append(items, pending{key: key, uploadID: uploadID, etag: etag})
	}
	source := mustFixtureSource(t, f)
	errs := make(chan error, total)
	for _, item := range items {
		go func() {
			_, _, err := f.multipart.Complete(1, source, item.key, item.uploadID,
				[]CompletedPart{{PartNumber: 1, ETag: item.etag}})
			errs <- err
		}()
	}
	for range total {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(f.multipart.completionOperationsDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("completion artifacts remain: %v", entries)
	}
	var uploads, etags int
	if err := f.multipart.db.QueryRow(`SELECT COUNT(*) FROM s3_multipart_uploads`).Scan(&uploads); err != nil {
		t.Fatal(err)
	}
	if err := f.multipart.db.QueryRow(`SELECT COUNT(*) FROM s3_object_etags`).Scan(&etags); err != nil {
		t.Fatal(err)
	}
	if uploads != 0 || etags != total {
		t.Fatalf("uploads=%d etags=%d", uploads, etags)
	}
}

func mustFixtureSource(t *testing.T, f *s3Fixture) *models.StorageSource {
	t.Helper()
	source, err := f.handler.sources.Get(f.bucket)
	if err != nil {
		t.Fatal(err)
	}
	return source
}

func TestMultipartCompletionJournalRejectsInvalidPartCount(t *testing.T) {
	f := newS3Fixture(t)
	op := multipartCompletion{
		Version: multipartCompletionVersion, UploadID: "mpu_" + strings.Repeat("b", 48), OwnerUserID: 1,
		StorageSourceID: f.storageSourceID, ObjectKey: "invalid.bin",
		ETag: `"` + strings.Repeat("0", 32) + "-" + fmt.Sprint(MaxMultipartParts+1) + `"`,
		Size: 1, ContentSHA256: strings.Repeat("0", 64), CreatedAt: time.Now().UTC(),
	}
	if err := validateMultipartCompletion(op); err == nil {
		t.Fatal("invalid part count was accepted")
	}
}
