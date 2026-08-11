package s3api

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"hash/crc32"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

type s3Fixture struct {
	handler         *Handler
	multipart       *MultipartStore
	access          string
	secret          string
	now             time.Time
	root            string
	bucket          string
	storageSourceID int64
}

func newS3Fixture(t *testing.T) *s3Fixture {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	root := filepath.Join(base, "storage")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	userService := users.NewService(conn)
	user, err := userService.Create("admin", "Admin", "password123", models.RoleSuperAdmin)
	if err != nil {
		t.Fatal(err)
	}
	sourceService := sources.NewService(conn, dataDir)
	source, err := sourceService.Create(sources.CreateInput{Name: "Bucket", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	credentials := NewCredentials(conn, dataDir, base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32)))
	item, secret, err := credentials.Create(user.ID, "测试客户端")
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	multipart := NewMultipartStore(conn, dataDir, fileService, 10)
	handler := NewHandler(credentials, sourceService, fileService,
		audit.New(conn, true, 1000, logger), security.NewProxyResolver([]string{"127.0.0.1"}), logger, 10, multipart)
	now := time.Date(2026, 8, 4, 8, 30, 0, 0, time.UTC)
	handler.verifier.now = func() time.Time { return now }
	return &s3Fixture{handler: handler, multipart: multipart, access: item.AccessKeyID, secret: secret, now: now, root: root, bucket: source.Key, storageSourceID: source.ID}
}

func (f *s3Fixture) signedRequest(t *testing.T, method, target string, body []byte) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, target, bytes.NewReader(body))
	payloadHash := sha256Hex(body)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("X-Amz-Date", f.now.Format("20060102T150405Z"))
	signed := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	canonical, err := canonicalRequest(req, signed, payloadHash, false)
	if err != nil {
		t.Fatal(err)
	}
	date := f.now.Format("20060102")
	scope := date + "/us-east-1/s3/aws4_request"
	toSign := sigV4Algorithm + "\n" + f.now.Format("20060102T150405Z") + "\n" + scope + "\n" + sha256Hex([]byte(canonical))
	signature := hexString(hmacSHA256(signingKey(f.secret, date, "us-east-1", "s3"), toSign))
	req.Header.Set("Authorization", sigV4Algorithm+" Credential="+f.access+"/"+scope+
		",SignedHeaders="+strings.Join(signed, ";")+",Signature="+signature)
	return req
}

func hexString(value []byte) string {
	const chars = "0123456789abcdef"
	out := make([]byte, len(value)*2)
	for i, b := range value {
		out[i*2], out[i*2+1] = chars[b>>4], chars[b&15]
	}
	return string(out)
}

func perform(handler http.Handler, req *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestS3ObjectLifecycleAndList(t *testing.T) {
	f := newS3Fixture(t)
	keyPath := "/" + f.bucket + "/folder/hello%20world.txt"

	put := perform(f.handler, f.signedRequest(t, http.MethodPut, "http://s3.test"+keyPath, []byte("hello s3")))
	if put.Code != http.StatusOK {
		t.Fatalf("PUT status=%d body=%s", put.Code, put.Body.String())
	}
	if put.Header().Get("ETag") != `"b60d991fa6dbd33863c7cec70d15dbac"` {
		t.Fatalf("unexpected ETag: %s", put.Header().Get("ETag"))
	}
	if content, err := os.ReadFile(filepath.Join(f.root, "folder", "hello world.txt")); err != nil || string(content) != "hello s3" {
		t.Fatalf("stored object mismatch: %q, %v", content, err)
	}

	head := perform(f.handler, f.signedRequest(t, http.MethodHead, "http://s3.test"+keyPath, nil))
	if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") != "8" {
		t.Fatalf("HEAD status=%d length=%s body=%q", head.Code, head.Header().Get("Content-Length"), head.Body.String())
	}

	getReq := f.signedRequest(t, http.MethodGet, "http://s3.test"+keyPath, nil)
	getReq.Header.Set("Range", "bytes=1-4")
	get := perform(f.handler, getReq)
	if get.Code != http.StatusPartialContent || get.Body.String() != "ello" {
		t.Fatalf("GET range status=%d body=%q", get.Code, get.Body.String())
	}

	list := perform(f.handler, f.signedRequest(t, http.MethodGet,
		"http://s3.test/"+f.bucket+"?list-type=2&delimiter=%2F", nil))
	if list.Code != http.StatusOK {
		t.Fatalf("LIST status=%d body=%s", list.Code, list.Body.String())
	}
	var listed listBucketResult
	if err := xml.Unmarshal(list.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if listed.KeyCount != 1 || len(listed.CommonPrefixes) != 1 || listed.CommonPrefixes[0].Prefix != "folder/" {
		t.Fatalf("unexpected list result: %+v", listed)
	}

	deleteXML := []byte(`<Delete><Object><Key>folder/hello world.txt</Key></Object></Delete>`)
	deleteReq := f.signedRequest(t, http.MethodPost, "http://s3.test/"+f.bucket+"?delete=", deleteXML)
	delete := perform(f.handler, deleteReq)
	if delete.Code != http.StatusOK || !strings.Contains(delete.Body.String(), "<Deleted>") {
		t.Fatalf("DELETE multiple status=%d body=%s", delete.Code, delete.Body.String())
	}
	missing := perform(f.handler, f.signedRequest(t, http.MethodGet, "http://s3.test"+keyPath, nil))
	if missing.Code != http.StatusNotFound || !strings.Contains(missing.Body.String(), "NoSuchKey") {
		t.Fatalf("missing status=%d body=%s", missing.Code, missing.Body.String())
	}
}

func TestS3PutReturnsInsufficientStorageWhenQuotaExceeded(t *testing.T) {
	f := newS3Fixture(t)
	quotaBytes := int64(3)
	if _, err := f.handler.sources.Update(f.bucket, sources.UpdateInput{QuotaBytes: &quotaBytes}); err != nil {
		t.Fatalf("set quota: %v", err)
	}

	response := perform(f.handler, f.signedRequest(t, http.MethodPut,
		"http://s3.test/"+f.bucket+"/too-large.txt", []byte("1234")))
	if response.Code != http.StatusInsufficientStorage || !strings.Contains(response.Body.String(), "InsufficientStorage") {
		t.Fatalf("PUT status=%d body=%s", response.Code, response.Body.String())
	}
	if _, err := os.Stat(filepath.Join(f.root, "too-large.txt")); !os.IsNotExist(err) {
		t.Fatalf("quota rejection left final file: %v", err)
	}
}

func TestS3PresignedGetAndTamperedSignature(t *testing.T) {
	f := newS3Fixture(t)
	if err := os.WriteFile(filepath.Join(f.root, "demo.txt"), []byte("demo"), 0o644); err != nil {
		t.Fatal(err)
	}
	target := "http://s3.test/" + f.bucket + "/demo.txt"
	req := httptest.NewRequest(http.MethodGet, target, nil)
	date := f.now.Format("20060102")
	scope := date + "/us-east-1/s3/aws4_request"
	query := req.URL.Query()
	query.Set("X-Amz-Algorithm", sigV4Algorithm)
	query.Set("X-Amz-Credential", f.access+"/"+scope)
	query.Set("X-Amz-Date", f.now.Format("20060102T150405Z"))
	query.Set("X-Amz-Expires", "300")
	query.Set("X-Amz-SignedHeaders", "host")
	req.URL.RawQuery = query.Encode()
	canonical, err := canonicalRequest(req, []string{"host"}, "UNSIGNED-PAYLOAD", true)
	if err != nil {
		t.Fatal(err)
	}
	toSign := sigV4Algorithm + "\n" + f.now.Format("20060102T150405Z") + "\n" + scope + "\n" + sha256Hex([]byte(canonical))
	query.Set("X-Amz-Signature", hexString(hmacSHA256(signingKey(f.secret, date, "us-east-1", "s3"), toSign)))
	req.URL.RawQuery = query.Encode()

	response := perform(f.handler, req)
	if response.Code != http.StatusOK || response.Body.String() != "demo" {
		t.Fatalf("presigned GET status=%d body=%q", response.Code, response.Body.String())
	}

	tampered := httptest.NewRequest(http.MethodGet, target+"?"+req.URL.RawQuery, nil)
	values, _ := url.ParseQuery(tampered.URL.RawQuery)
	values.Set("X-Amz-Signature", strings.Repeat("0", 64))
	tampered.URL.RawQuery = values.Encode()
	response = perform(f.handler, tampered)
	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), "SignatureDoesNotMatch") {
		t.Fatalf("tampered status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestS3UnsupportedSubresourcesReturnNotImplemented(t *testing.T) {
	f := newS3Fixture(t)
	if err := os.WriteFile(filepath.Join(f.root, "demo.txt"), []byte("demo"), 0o644); err != nil {
		t.Fatal(err)
	}

	for _, item := range []struct {
		method string
		target string
	}{
		{http.MethodGet, "http://s3.test/" + f.bucket + "/demo.txt?acl="},
		{http.MethodHead, "http://s3.test/" + f.bucket + "?acl="},
	} {
		response := perform(f.handler, f.signedRequest(t, item.method, item.target, nil))
		if response.Code != http.StatusNotImplemented || (item.method != http.MethodHead && !strings.Contains(response.Body.String(), "NotImplemented")) {
			t.Fatalf("unsupported subresource %s %s status=%d body=%s", item.method, item.target, response.Code, response.Body.String())
		}
	}

	response := perform(f.handler, f.signedRequest(t, http.MethodGet,
		"http://s3.test/"+f.bucket+"/demo.txt?x-id=GetObject", nil))
	if response.Code != http.StatusOK || response.Body.String() != "demo" {
		t.Fatalf("SDK x-id query status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestS3UnsignedAWSChunkedUploadWithTrailer(t *testing.T) {
	f := newS3Fixture(t)
	payload := []byte("hello aws chunked")
	checksum := crc32.ChecksumIEEE(payload)
	checksumBytes := []byte{byte(checksum >> 24), byte(checksum >> 16), byte(checksum >> 8), byte(checksum)}
	trailerValue := base64.StdEncoding.EncodeToString(checksumBytes)
	encodedBody := []byte("11\r\nhello aws chunked\r\n0\r\nx-amz-checksum-crc32:" + trailerValue + "\r\n\r\n")
	req := httptest.NewRequest(http.MethodPut, "http://s3.test/"+f.bucket+"/chunked.txt", bytes.NewReader(encodedBody))
	req.Header.Set("Content-Encoding", "aws-chunked")
	req.Header.Set("X-Amz-Content-Sha256", streamingUnsignedTrailer)
	req.Header.Set("X-Amz-Date", f.now.Format("20060102T150405Z"))
	req.Header.Set("X-Amz-Decoded-Content-Length", strconv.Itoa(len(payload)))
	req.Header.Set("X-Amz-Trailer", "x-amz-checksum-crc32")
	signed := []string{"content-encoding", "host", "x-amz-content-sha256", "x-amz-date", "x-amz-decoded-content-length", "x-amz-trailer"}
	canonical, err := canonicalRequest(req, signed, streamingUnsignedTrailer, false)
	if err != nil {
		t.Fatal(err)
	}
	date := f.now.Format("20060102")
	scope := date + "/us-east-1/s3/aws4_request"
	toSign := sigV4Algorithm + "\n" + f.now.Format("20060102T150405Z") + "\n" + scope + "\n" + sha256Hex([]byte(canonical))
	req.Header.Set("Authorization", sigV4Algorithm+" Credential="+f.access+"/"+scope+
		",SignedHeaders="+strings.Join(signed, ";")+",Signature="+
		hexString(hmacSHA256(signingKey(f.secret, date, "us-east-1", "s3"), toSign)))

	response := perform(f.handler, req)
	if response.Code != http.StatusOK {
		t.Fatalf("chunked PUT status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("x-amz-checksum-crc32") != trailerValue {
		t.Fatalf("missing checksum response: %s", response.Header().Get("x-amz-checksum-crc32"))
	}
	stored, err := os.ReadFile(filepath.Join(f.root, "chunked.txt"))
	if err != nil || !bytes.Equal(stored, payload) {
		t.Fatalf("stored chunked payload=%q err=%v", stored, err)
	}
}

func TestCredentialsEncryptSecretAndDisable(t *testing.T) {
	f := newS3Fixture(t)
	items, err := f.handler.credentials.List(1)
	if err != nil || len(items) != 1 {
		t.Fatalf("list credentials: %v %+v", err, items)
	}
	if err := f.handler.credentials.SetDisabled(1, f.access, true); err != nil {
		t.Fatal(err)
	}
	response := perform(f.handler, f.signedRequest(t, http.MethodGet, "http://s3.test/", nil))
	if response.Code != http.StatusForbidden {
		t.Fatalf("disabled credential status=%d", response.Code)
	}
}

func TestLocalMasterKeyIsPersistentAndPrivate(t *testing.T) {
	dataDir := t.TempDir()
	credentials := NewCredentials(nil, dataDir, "")
	first, err := credentials.masterKey()
	if err != nil || len(first) != 32 {
		t.Fatalf("create master key: len=%d err=%v", len(first), err)
	}
	keyPath := filepath.Join(dataDir, "keys", "s3-master.key")
	if err := os.Chmod(keyPath, 0o644); err != nil {
		t.Fatal(err)
	}
	second, err := NewCredentials(nil, dataDir, "").masterKey()
	if err != nil || !bytes.Equal(first, second) {
		t.Fatalf("reload master key: equal=%v err=%v", bytes.Equal(first, second), err)
	}
	info, err := os.Stat(keyPath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("master key mode=%v", info.Mode().Perm())
	}
}

func TestCRC64NVMEKnownVector(t *testing.T) {
	checksum, err := checksumForTrailer("x-amz-checksum-crc64nvme")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = checksum.Write([]byte("123456789"))
	if actual := hexString(checksum.Sum(nil)); actual != "ae8b14860a799888" {
		t.Fatalf("CRC64NVME=%s", actual)
	}
}
