package httpserver

import (
	"archive/zip"
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// 1.2.0 Preview & Sharing：inline 预览端点、分享目录流式 ZIP、
// 公开分享状态区分与实例品牌信息。

func TestRawFileEndpointServesInlinePreviewWithGuards(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)
	primaryBase := "/api/v1/sources/" + fixture.primary.Key
	root := fixture.primary.RootPath
	if err := os.WriteFile(filepath.Join(root, "photo.png"), []byte("png-bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "page.html"), []byte("<html><body>x</body></html>"), 0o600); err != nil {
		t.Fatal(err)
	}

	raw := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/raw?path=%2Fphoto.png", "", fixture.cookie, "")
	if raw.Code != http.StatusOK || raw.Body.String() != "png-bytes" {
		t.Fatalf("raw preview status=%d body=%q", raw.Code, raw.Body.String())
	}
	if ct := raw.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/png") {
		t.Fatalf("raw preview content-type=%q", ct)
	}
	if cd := raw.Header().Get("Content-Disposition"); strings.Contains(cd, "attachment") {
		t.Fatalf("inline preview forced attachment: %q", cd)
	}

	rangeRequest := httptest.NewRequest(http.MethodGet, primaryBase+"/raw?path=%2Fphoto.png", nil)
	rangeRequest.AddCookie(fixture.cookie)
	rangeRequest.Header.Set("Range", "bytes=0-2")
	rangeResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(rangeResponse, rangeRequest)
	if rangeResponse.Code != http.StatusPartialContent || rangeResponse.Body.String() != "png" {
		t.Fatalf("range preview status=%d body=%q", rangeResponse.Code, rangeResponse.Body.String())
	}

	html := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/raw?path=%2Fpage.html", "", fixture.cookie, "")
	if html.Code != http.StatusOK || !strings.Contains(html.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("active content must stay attachment status=%d headers=%v", html.Code, html.Header())
	}

	unauthorized := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/raw?path=%2Fphoto.png", "", fixture.otherCookie, "")
	assertErrorResponse(t, unauthorized, http.StatusForbidden, CodeForbidden)
}

func TestPublicShareArchiveStreamsZipAndConsumesDownload(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)
	root := fixture.primary.RootPath
	if err := os.MkdirAll(filepath.Join(root, "docs", "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "guide.txt"), []byte("guide"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "nested", "deep.txt"), []byte("deep"), 0o600); err != nil {
		t.Fatal(err)
	}

	created := serveTestRequest(t, fixture.handler, http.MethodPost, "/api/v1/shares",
		`{"source_key":"`+fixture.primary.Key+`","path":"/docs","max_downloads":1}`, fixture.cookie, fixture.csrf)
	if created.Code != http.StatusOK {
		t.Fatalf("create share status=%d body=%s", created.Code, created.Body.String())
	}
	var shareEnvelope struct {
		Data struct {
			Key string `json:"key"`
		} `json:"data"`
	}
	decodeTestJSON(t, created, &shareEnvelope)
	shareKey := shareEnvelope.Data.Key

	archive := serveTestRequest(t, fixture.handler, http.MethodGet, "/share/"+shareKey+"/archive", "", nil, "")
	if archive.Code != http.StatusOK || archive.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("share archive status=%d headers=%v", archive.Code, archive.Header())
	}
	zr, err := zip.NewReader(bytes.NewReader(archive.Body.Bytes()), int64(archive.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	entries := make(map[string]bool, len(zr.File))
	for _, entry := range zr.File {
		entries[entry.Name] = true
	}
	if !entries["docs/guide.txt"] || !entries["docs/nested/deep.txt"] {
		t.Fatalf("share archive entries=%v", entries)
	}

	// max_downloads=1 已被打包下载消耗，再次请求应失败。
	exhausted := serveTestRequest(t, fixture.handler, http.MethodGet, "/share/"+shareKey+"/archive", "", nil, "")
	if exhausted.Code != http.StatusNotFound {
		t.Fatalf("exhausted archive status=%d", exhausted.Code)
	}
	info := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/public/shares/"+shareKey, "", nil, "")
	if info.Code != http.StatusGone || !strings.Contains(info.Body.String(), "SHARE_EXHAUSTED") {
		t.Fatalf("exhausted info status=%d body=%s", info.Code, info.Body.String())
	}
}

func TestPublicShareInfoDistinguishesExpiredFromMissing(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)
	root := fixture.primary.RootPath
	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("note"), 0o600); err != nil {
		t.Fatal(err)
	}

	created := serveTestRequest(t, fixture.handler, http.MethodPost, "/api/v1/shares",
		`{"source_key":"`+fixture.primary.Key+`","path":"/note.txt"}`, fixture.cookie, fixture.csrf)
	var shareEnvelope struct {
		Data struct {
			Key string `json:"key"`
		} `json:"data"`
	}
	decodeTestJSON(t, created, &shareEnvelope)

	// 直接把过期时间改到过去，绕过创建时的校验。
	past := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano)
	if _, err := fixture.app.db.Exec(`UPDATE file_shares SET expires_at = ? WHERE share_key = ?`, past, shareEnvelope.Data.Key); err != nil {
		t.Fatal(err)
	}

	info := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/public/shares/"+shareEnvelope.Data.Key, "", nil, "")
	if info.Code != http.StatusGone || !strings.Contains(info.Body.String(), "SHARE_EXPIRED") {
		t.Fatalf("expired info status=%d body=%s", info.Code, info.Body.String())
	}

	missing := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/public/shares/shr-missing", "", nil, "")
	assertErrorResponse(t, missing, http.StatusNotFound, CodeFileNotFound)
}

func TestBrandingEndpointsUpdateInstanceName(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)

	forbidden := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/admin/branding", "", fixture.cookie, fixture.csrf)
	assertErrorResponse(t, forbidden, http.StatusForbidden, CodeForbidden)

	status := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/system/status", "", nil, "")
	if status.Code != http.StatusOK || !strings.Contains(status.Body.String(), `"instance_name":"OmniStore"`) {
		t.Fatalf("default instance name status=%d body=%s", status.Code, status.Body.String())
	}

	updated := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/branding",
		`{"instance_name":"  木屋存储  "}`, fixture.adminCookie, fixture.adminCSRF)
	if updated.Code != http.StatusOK || !strings.Contains(updated.Body.String(), `"instance_name":"木屋存储"`) {
		t.Fatalf("update branding status=%d body=%s", updated.Code, updated.Body.String())
	}

	status = serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/system/status", "", nil, "")
	if !strings.Contains(status.Body.String(), `"instance_name":"木屋存储"`) {
		t.Fatalf("instance name not exposed: %s", status.Body.String())
	}

	tooLong := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/branding",
		`{"instance_name":"`+strings.Repeat("字", 65)+`"}`, fixture.adminCookie, fixture.adminCSRF)
	assertErrorResponse(t, tooLong, http.StatusBadRequest, CodeValidationError)

	reset := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/branding",
		`{"instance_name":""}`, fixture.adminCookie, fixture.adminCSRF)
	if reset.Code != http.StatusOK || !strings.Contains(reset.Body.String(), `"instance_name":"OmniStore"`) {
		t.Fatalf("reset branding status=%d body=%s", reset.Code, reset.Body.String())
	}
}
