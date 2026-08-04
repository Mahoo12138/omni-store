package s3api

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/locks"
)

func TestS3MultipartLifecycle(t *testing.T) {
	f := newS3Fixture(t)
	key := "large/demo.bin"
	uploadID := initiateMultipart(t, f, key)

	firstBody := bytes.Repeat([]byte("a"), MinMultipartPartSize)
	firstETag := uploadMultipartPart(t, f, key, uploadID, 1, firstBody)
	_ = uploadMultipartPart(t, f, key, uploadID, 2, []byte("old"))
	secondETag := uploadMultipartPart(t, f, key, uploadID, 2, []byte("end"))

	listTarget := fmt.Sprintf("http://s3.test/bucket-one/%s?uploadId=%s&max-parts=1", key, uploadID)
	listedResponse := perform(f.handler, f.signedRequest(t, http.MethodGet, listTarget, nil))
	if listedResponse.Code != http.StatusOK {
		t.Fatalf("ListParts status=%d body=%s", listedResponse.Code, listedResponse.Body.String())
	}
	var listed listPartsResult
	if err := xml.Unmarshal(listedResponse.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Parts) != 1 || listed.Parts[0].PartNumber != 1 || !listed.IsTruncated || listed.NextPartNumberMarker != 1 {
		t.Fatalf("unexpected ListParts result: %+v", listed)
	}

	completeBody := []byte(fmt.Sprintf(`<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>%s</ETag></Part><Part><PartNumber>2</PartNumber><ETag>%s</ETag></Part></CompleteMultipartUpload>`, firstETag, secondETag))
	completeTarget := fmt.Sprintf("http://s3.test/bucket-one/%s?uploadId=%s", key, uploadID)
	completedResponse := perform(f.handler, f.signedRequest(t, http.MethodPost, completeTarget, completeBody))
	if completedResponse.Code != http.StatusOK {
		t.Fatalf("CompleteMultipartUpload status=%d body=%s", completedResponse.Code, completedResponse.Body.String())
	}
	var completed completeMultipartUploadResult
	if err := xml.Unmarshal(completedResponse.Body.Bytes(), &completed); err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(strings.Trim(completed.ETag, `"`), "-2") || completed.Bucket != "bucket-one" || completed.Key != key {
		t.Fatalf("unexpected completion result: %+v", completed)
	}
	headTarget := "http://s3.test/bucket-one/" + key
	head := perform(f.handler, f.signedRequest(t, http.MethodHead, headTarget, nil))
	if head.Code != http.StatusOK || head.Header().Get("ETag") != completed.ETag {
		t.Fatalf("multipart HEAD ETag=%q want=%q status=%d", head.Header().Get("ETag"), completed.ETag, head.Code)
	}
	stored, err := os.ReadFile(filepath.Join(f.root, filepath.FromSlash(key)))
	if err != nil || !bytes.Equal(stored, append(firstBody, []byte("end")...)) {
		t.Fatalf("merged object mismatch: size=%d err=%v", len(stored), err)
	}
	if _, err := os.Stat(f.multipart.uploadDir(uploadID)); !os.IsNotExist(err) {
		t.Fatalf("multipart temporary directory still exists: %v", err)
	}
	missing := perform(f.handler, f.signedRequest(t, http.MethodGet, listTarget, nil))
	if missing.Code != http.StatusNotFound || !strings.Contains(missing.Body.String(), "NoSuchUpload") {
		t.Fatalf("completed upload remains visible: status=%d body=%s", missing.Code, missing.Body.String())
	}

	overwriteBody := []byte("ordinary put")
	overwrite := perform(f.handler, f.signedRequest(t, http.MethodPut, headTarget, overwriteBody))
	if overwrite.Code != http.StatusOK {
		t.Fatalf("ordinary overwrite status=%d body=%s", overwrite.Code, overwrite.Body.String())
	}
	head = perform(f.handler, f.signedRequest(t, http.MethodHead, headTarget, nil))
	wantETag, _ := etagReader(bytes.NewReader(overwriteBody))
	if head.Header().Get("ETag") != wantETag || head.Header().Get("ETag") == completed.ETag {
		t.Fatalf("ordinary PUT retained multipart ETag=%q want=%q", head.Header().Get("ETag"), wantETag)
	}
}

func TestS3MultipartValidationAndAbort(t *testing.T) {
	f := newS3Fixture(t)
	key := "invalid.bin"
	uploadID := initiateMultipart(t, f, key)
	firstETag := uploadMultipartPart(t, f, key, uploadID, 1, []byte("too small"))
	secondETag := uploadMultipartPart(t, f, key, uploadID, 2, []byte("last"))
	target := fmt.Sprintf("http://s3.test/bucket-one/%s?uploadId=%s", key, uploadID)

	badOrder := []byte(fmt.Sprintf(`<CompleteMultipartUpload><Part><PartNumber>2</PartNumber><ETag>%s</ETag></Part><Part><PartNumber>1</PartNumber><ETag>%s</ETag></Part></CompleteMultipartUpload>`, secondETag, firstETag))
	response := perform(f.handler, f.signedRequest(t, http.MethodPost, target, badOrder))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "InvalidPartOrder") {
		t.Fatalf("invalid order status=%d body=%s", response.Code, response.Body.String())
	}

	tooSmall := []byte(fmt.Sprintf(`<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>%s</ETag></Part><Part><PartNumber>2</PartNumber><ETag>%s</ETag></Part></CompleteMultipartUpload>`, firstETag, secondETag))
	response = perform(f.handler, f.signedRequest(t, http.MethodPost, target, tooSmall))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "EntityTooSmall") {
		t.Fatalf("small part status=%d body=%s", response.Code, response.Body.String())
	}

	response = perform(f.handler, f.signedRequest(t, http.MethodDelete, target, nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("AbortMultipartUpload status=%d body=%s", response.Code, response.Body.String())
	}
	response = perform(f.handler, f.signedRequest(t, http.MethodDelete, target, nil))
	if response.Code != http.StatusNotFound || !strings.Contains(response.Body.String(), "NoSuchUpload") {
		t.Fatalf("second abort status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestMultipartCleanupExpiredStateAndOrphans(t *testing.T) {
	f := newS3Fixture(t)
	f.multipart.now = func() time.Time { return f.now }
	uploadID := initiateMultipart(t, f, "expired.bin")
	old := f.now.Add(-MultipartMaxAge - time.Minute)
	if _, err := f.multipart.db.Exec(`UPDATE s3_multipart_uploads SET updated_at = ? WHERE upload_id = ?`, old, uploadID); err != nil {
		t.Fatal(err)
	}
	orphanID := "mpu_" + strings.Repeat("a", 48)
	orphanDir := f.multipart.uploadDir(orphanID)
	if err := os.MkdirAll(orphanDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(orphanDir, old, old); err != nil {
		t.Fatal(err)
	}
	result, err := f.multipart.CleanupExpired(MultipartMaxAge)
	if err != nil {
		t.Fatal(err)
	}
	if result.UploadsRemoved != 1 || result.OrphansRemoved != 1 {
		t.Fatalf("unexpected cleanup result: %+v", result)
	}
	for _, dir := range []string{f.multipart.uploadDir(uploadID), orphanDir} {
		if _, err := os.Stat(dir); !os.IsNotExist(err) {
			t.Fatalf("cleanup left %s: %v", dir, err)
		}
	}
}

func TestS3MultipartCompleteRespectsPersistentLock(t *testing.T) {
	f := newS3Fixture(t)
	key := "locked.bin"
	uploadID := initiateMultipart(t, f, key)
	etag := uploadMultipartPart(t, f, key, uploadID, 1, []byte("content"))
	if _, err := f.handler.files.PersistentLocks().Create(context.Background(), "bucket-one", key,
		locks.DepthZero, "", 1, time.Hour); err != nil {
		t.Fatal(err)
	}
	body := []byte(fmt.Sprintf(`<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>%s</ETag></Part></CompleteMultipartUpload>`, etag))
	target := fmt.Sprintf("http://s3.test/bucket-one/%s?uploadId=%s", key, uploadID)
	response := perform(f.handler, f.signedRequest(t, http.MethodPost, target, body))
	if response.Code != http.StatusLocked || !strings.Contains(response.Body.String(), "OperationAborted") {
		t.Fatalf("locked completion status=%d body=%s", response.Code, response.Body.String())
	}
	if _, err := f.multipart.Get(1, "bucket-one", key, uploadID); err != nil {
		t.Fatalf("failed completion removed upload state: %v", err)
	}
}

func TestS3UploadPartRejectsPayloadHashMismatch(t *testing.T) {
	f := newS3Fixture(t)
	key := "digest.bin"
	uploadID := initiateMultipart(t, f, key)
	target := fmt.Sprintf("http://s3.test/bucket-one/%s?partNumber=1&uploadId=%s", key, uploadID)
	request := f.signedRequest(t, http.MethodPut, target, []byte("signed content"))
	request.Body = io.NopCloser(strings.NewReader("tampered content"))
	request.ContentLength = int64(len("tampered content"))
	response := perform(f.handler, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "XAmzContentSHA256Mismatch") {
		t.Fatalf("payload mismatch status=%d body=%s", response.Code, response.Body.String())
	}
	parts, err := f.multipart.ListParts(1, "bucket-one", key, uploadID)
	if err != nil || len(parts) != 0 {
		t.Fatalf("payload mismatch persisted part: parts=%+v err=%v", parts, err)
	}
}

func initiateMultipart(t *testing.T, f *s3Fixture, key string) string {
	t.Helper()
	target := "http://s3.test/bucket-one/" + key + "?uploads="
	response := perform(f.handler, f.signedRequest(t, http.MethodPost, target, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("CreateMultipartUpload status=%d body=%s", response.Code, response.Body.String())
	}
	var result initiateMultipartUploadResult
	if err := xml.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if !uploadIDPattern.MatchString(result.UploadID) {
		t.Fatalf("invalid upload id %q", result.UploadID)
	}
	return result.UploadID
}

func uploadMultipartPart(t *testing.T, f *s3Fixture, key, uploadID string, partNumber int, body []byte) string {
	t.Helper()
	target := fmt.Sprintf("http://s3.test/bucket-one/%s?partNumber=%d&uploadId=%s", key, partNumber, uploadID)
	response := perform(f.handler, f.signedRequest(t, http.MethodPut, target, body))
	if response.Code != http.StatusOK {
		t.Fatalf("UploadPart %d status=%d body=%s", partNumber, response.Code, response.Body.String())
	}
	if etag := response.Header().Get("ETag"); etag != "" {
		return etag
	}
	t.Fatal("UploadPart did not return ETag")
	return ""
}
