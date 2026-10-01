package httpserver

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

type transferFixture struct {
	handler     http.Handler
	app         *Server
	cookie      *http.Cookie
	csrf        string
	adminCookie *http.Cookie
	adminCSRF   string
	carrier     *models.StorageSource
	store       *models.StorageSource
	storeRoot   string
	target      *models.StorageSource
}

func newTransferHTTPFixture(t *testing.T) *transferFixture {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	cfg.Server.PublicURL = "https://store.example.test"
	httpServer, app := New(cfg, conn, newTransferLogger())

	user, err := app.users.Create("transfer-user", "Transfer User", "user-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	sessionID, csrf, err := app.sessions.Create(user.ID, "transfer-test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	admin, err := app.users.Create("transfer-admin", "Transfer Admin", "admin-password", models.RoleSuperAdmin)
	if err != nil {
		t.Fatal(err)
	}
	adminSessionID, adminCSRF, err := app.sessions.Create(admin.ID, "transfer-test-admin", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	sourceService := app.sources
	mkSource := func(name string) *models.StorageSource {
		root := filepath.Join(base, strings.ToLower(name))
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}
		source, err := sourceService.Create(sources.CreateInput{Name: name, RootPath: root})
		if err != nil {
			t.Fatal(err)
		}
		return source
	}
	carrier := mkSource("Carrier")
	store := mkSource("Store")
	target := mkSource("Target")
	if _, err := sourceService.CreatePolicy(sources.PolicyInput{
		Name:    "Transfer policies",
		UserIDs: []int64{user.ID},
		Sources: []sources.PolicySourceInput{
			{SourceKey: store.Key, Permission: models.PermissionReadWrite},
			{SourceKey: target.Key, Permission: models.PermissionReadWrite},
		},
	}); err != nil {
		t.Fatal(err)
	}
	enabled := true
	if _, err := app.capabilities.UpdateBinding("transfer_center", capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &carrier.Key,
	}); err != nil {
		t.Fatal(err)
	}
	return &transferFixture{
		handler: httpServer.Handler, app: app,
		cookie: &http.Cookie{Name: SessionCookieName(), Value: sessionID}, csrf: csrf,
		adminCookie: &http.Cookie{Name: SessionCookieName(), Value: adminSessionID}, adminCSRF: adminCSRF,
		carrier: carrier, store: store, storeRoot: store.RootPath, target: target,
	}
}

func newTransferLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

type transferJSON struct {
	Data  map[string]any `json:"data"`
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

func decodeTransferJSON(t *testing.T, recorder *httptest.ResponseRecorder) transferJSON {
	t.Helper()
	var out transferJSON
	if err := json.Unmarshal(recorder.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode body: %v\n%s", err, recorder.Body.String())
	}
	return out
}

func (f *transferFixture) postJSON(t *testing.T, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	return serveTestRequest(t, f.handler, http.MethodPost, target, body, f.cookie, f.csrf)
}

func (f *transferFixture) uploadMultipart(t *testing.T, target string, fields map[string]string, fileName string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, target, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("X-CSRF-Token", f.csrf)
	request.AddCookie(f.cookie)
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, request)
	return recorder
}

func publicGet(t *testing.T, handler http.Handler, target string, token string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, target, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func publicPostJSON(t *testing.T, handler http.Handler, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

// 全链路：创建草稿 → 直传 + 从存储源复制 → 定稿 → 公开取件 → 下载与 ZIP。
func TestTransferSendEndToEndHTTP(t *testing.T) {
	fixture := newTransferHTTPFixture(t)

	created := fixture.postJSON(t, "/api/v1/transfers",
		`{"title":"客户交付","description":"第二版方案","expires_in_hours":48,"max_downloads":2}`)
	if created.Code != http.StatusOK {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	createdData := decodeTransferJSON(t, created).Data
	pickupCode, _ := createdData["pickup_code"].(string)
	sendMap, _ := createdData["send"].(map[string]any)
	publicKey, _ := sendMap["public_key"].(string)
	sendID := int64(sendMap["id"].(float64))
	if !strings.HasPrefix(publicKey, "tr-") || len(pickupCode) != 8 {
		t.Fatalf("public key=%q pickup=%q", publicKey, pickupCode)
	}

	// 直传嵌套结构 + 从存储源复制。
	upload := fixture.uploadMultipart(t, "/api/v1/transfers/"+int64String(sendID)+"/files/upload",
		map[string]string{"relative_path": "docs/方案 v2.pdf"}, "whatever.pdf", []byte("PDF-CONTENT"))
	if upload.Code != http.StatusOK {
		t.Fatalf("upload status=%d body=%s", upload.Code, upload.Body.String())
	}
	if err := os.WriteFile(filepath.Join(fixture.storeRoot, "report.txt"), []byte("REPORT"), 0o600); err != nil {
		t.Fatal(err)
	}
	copied := fixture.postJSON(t, "/api/v1/transfers/"+int64String(sendID)+"/files/from-store",
		`{"source_key":"`+fixture.store.Key+`","paths":["report.txt"]}`)
	if copied.Code != http.StatusOK {
		t.Fatalf("copy status=%d body=%s", copied.Code, copied.Body.String())
	}

	// 定稿。
	finalized := fixture.postJSON(t, "/api/v1/transfers/"+int64String(sendID)+"/finalize", "")
	if finalized.Code != http.StatusOK {
		t.Fatalf("finalize status=%d body=%s", finalized.Code, finalized.Body.String())
	}

	// 公开：未解锁只能看到摘要；下载需要会话。
	lookup := publicGet(t, fixture.handler, "/api/v1/public/transfers/"+publicKey, "")
	if lookup.Code != http.StatusOK || !strings.Contains(lookup.Body.String(), `"file_count":2`) {
		t.Fatalf("lookup status=%d body=%s", lookup.Code, lookup.Body.String())
	}
	noToken := publicGet(t, fixture.handler, "/api/v1/public/transfers/"+publicKey+"/files", "")
	if noToken.Code != http.StatusNotFound {
		t.Fatalf("no-token files status=%d", noToken.Code)
	}
	badUnlock := publicPostJSON(t, fixture.handler, "/api/v1/public/transfers/"+publicKey+"/unlock",
		`{"pickup_code":"XXXXXXXX"}`)
	if badUnlock.Code != http.StatusBadRequest {
		t.Fatalf("bad unlock status=%d", badUnlock.Code)
	}
	unlock := publicPostJSON(t, fixture.handler, "/api/v1/public/transfers/"+publicKey+"/unlock",
		`{"pickup_code":"`+strings.ToLower(pickupCode)+`"}`)
	if unlock.Code != http.StatusOK {
		t.Fatalf("unlock status=%d body=%s", unlock.Code, unlock.Body.String())
	}
	token, _ := decodeTransferJSON(t, unlock).Data["token"].(string)

	filesList := publicGet(t, fixture.handler, "/api/v1/public/transfers/"+publicKey+"/files", token)
	if filesList.Code != http.StatusOK || !strings.Contains(filesList.Body.String(), "docs/方案 v2.pdf") {
		t.Fatalf("files status=%d body=%s", filesList.Code, filesList.Body.String())
	}

	// 单文件下载两次占满名额，第三次（archive）被拒。
	first := publicGet(t, fixture.handler, "/api/v1/public/transfers/"+publicKey+"/files/1/download", token)
	if first.Code != http.StatusOK || !strings.Contains(first.Body.String(), "PDF-CONTENT") {
		t.Fatalf("download status=%d body=%s", first.Code, first.Body.String())
	}
	second := publicGet(t, fixture.handler, "/api/v1/public/transfers/"+publicKey+"/archive", token)
	if second.Code != http.StatusOK {
		t.Fatalf("archive status=%d", second.Code)
	}
	zipReader, err := zip.NewReader(bytes.NewReader(second.Body.Bytes()), int64(second.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if len(zipReader.File) != 2 {
		t.Fatalf("zip entries=%d", len(zipReader.File))
	}
	exhausted := publicGet(t, fixture.handler, "/api/v1/public/transfers/"+publicKey+"/files/1/download", token)
	if exhausted.Code != http.StatusForbidden {
		t.Fatalf("exhausted status=%d body=%s", exhausted.Code, exhausted.Body.String())
	}

	// 撤销后公开 404。
	revoke := serveTestRequest(t, fixture.handler, http.MethodDelete, "/api/v1/transfers/"+int64String(sendID), "", fixture.cookie, fixture.csrf)
	if revoke.Code != http.StatusOK {
		t.Fatalf("revoke status=%d", revoke.Code)
	}
	if lookup := publicGet(t, fixture.handler, "/api/v1/public/transfers/"+publicKey, ""); lookup.Code != http.StatusNotFound {
		t.Fatalf("revoked lookup status=%d", lookup.Code)
	}
}

// 收集链路：创建约束 → 匿名解锁提交（成功与各种被拒）→ 收件箱 → 保存到文件。
func TestTransferCollectEndToEndHTTP(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	created := fixture.postJSON(t, "/api/v1/transfer-collections",
		`{"title":"作业收集","require_name":true,"allowed_exts":["pdf"],"max_total_size_mb":1}`)
	if created.Code != http.StatusOK {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	createdData := decodeTransferJSON(t, created).Data
	code, _ := createdData["code"].(string)
	collectionMap, _ := createdData["collection"].(map[string]any)
	publicKey, _ := collectionMap["public_key"].(string)

	lookup := publicGet(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey, "")
	if lookup.Code != http.StatusOK || !strings.Contains(lookup.Body.String(), `"require_name":true`) {
		t.Fatalf("lookup status=%d body=%s", lookup.Code, lookup.Body.String())
	}
	unlock := publicPostJSON(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey+"/unlock",
		`{"code":"`+strings.ToLower(code)+`"}`)
	if unlock.Code != http.StatusOK {
		t.Fatalf("unlock status=%d body=%s", unlock.Code, unlock.Body.String())
	}
	token, _ := decodeTransferJSON(t, unlock).Data["token"].(string)

	// 未解锁提交 → 401；解锁后缺姓名 → 400；类型不允许 → 400。
	noAuth := publicPostJSON(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey+"/submit", "")
	if noAuth.Code != http.StatusUnauthorized {
		t.Fatalf("no-auth submit status=%d", noAuth.Code)
	}
	submit := func(fields map[string]string, fileName, content string) *httptest.ResponseRecorder {
		return fixture.uploadMultipart(t, "/api/v1/public/transfer-collections/"+publicKey+"/submit",
			fields, fileName, []byte(content))
	}
	if resp := submit(map[string]string{}, "a.pdf", "PDF"); resp.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous submit status=%d", resp.Code)
	}
	missingName := submitMultipart(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey+"/submit",
		token, map[string]string{"note": "no name"}, "a.pdf", "PDF")
	if missingName.Code != http.StatusBadRequest {
		t.Fatalf("missing name status=%d body=%s", missingName.Code, missingName.Body.String())
	}
	badType := submitMultipart(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey+"/submit",
		token, map[string]string{"name": "小明"}, "evil.exe", "MZ")
	if badType.Code != http.StatusBadRequest {
		t.Fatalf("bad type status=%d body=%s", badType.Code, badType.Body.String())
	}

	okSubmit := submitMultipart(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey+"/submit",
		token, map[string]string{"name": "小明", "note": "第一次"}, "作业/第一周.pdf", "WEEK1")
	if okSubmit.Code != http.StatusOK {
		t.Fatalf("submit status=%d body=%s", okSubmit.Code, okSubmit.Body.String())
	}
	submissionID := int64(decodeTransferJSON(t, okSubmit).Data["id"].(float64))

	// 匿名访客无法列举他人提交（无列举端点）；收件箱只属于 owner。
	if resp := publicGet(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey, ""); resp.Code != http.StatusOK {
		t.Fatal("lookup broken")
	}
	inbox := serveTestRequest(t, fixture.handler, http.MethodGet,
		"/api/v1/transfer-collections/"+int64String(int64(collectionMap["id"].(float64)))+"/submissions", "", fixture.cookie, fixture.csrf)
	if inbox.Code != http.StatusOK || !strings.Contains(inbox.Body.String(), "小明") {
		t.Fatalf("inbox status=%d body=%s", inbox.Code, inbox.Body.String())
	}

	// 保存到文件（复制语义）。
	if err := os.MkdirAll(filepath.Join(fixture.target.RootPath, "hw"), 0o755); err != nil {
		t.Fatal(err)
	}
	saved := fixture.postJSON(t, "/api/v1/transfer-collections/"+int64String(int64(collectionMap["id"].(float64)))+
		"/submissions/"+int64String(submissionID)+"/save-to-files",
		`{"source_key":"`+fixture.target.Key+`","path":"hw"}`)
	if saved.Code != http.StatusOK {
		t.Fatalf("save status=%d body=%s", saved.Code, saved.Body.String())
	}
	if content, err := os.ReadFile(filepath.Join(fixture.target.RootPath, "hw", "作业", "第一周.pdf")); err != nil || string(content) != "WEEK1" {
		t.Fatalf("saved content=%q err=%v", content, err)
	}

	// 关闭后提交 409。
	closed := fixture.postJSON(t, "/api/v1/transfer-collections/"+int64String(int64(collectionMap["id"].(float64)))+"/close", "")
	if closed.Code != http.StatusOK {
		t.Fatal(closed.Body.String())
	}
	if resp := publicGet(t, fixture.handler, "/api/v1/public/transfer-collections/"+publicKey, ""); resp.Code != http.StatusConflict {
		t.Fatalf("closed lookup status=%d", resp.Code)
	}
}

// 源删除守卫：活跃流转任务阻止删除源。
func TestSourceDeletionGuardBlockedByActiveTransfer(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	created := fixture.postJSON(t, "/api/v1/transfers", `{"title":"活跃包"}`)
	sendMap := decodeTransferJSON(t, created).Data["send"].(map[string]any)
	publicKey := sendMap["public_key"].(string)
	transferID := int64(sendMap["id"].(float64))
	if _, err := fixture.app.transfers.AddSendUpload(transferID, ownerIDOf(t, fixture), "a.txt", strings.NewReader("A")); err != nil {
		t.Fatal(err)
	}
	_ = publicKey
	// 先解除能力绑定，验证独立的活跃任务守卫。
	disabled := false
	if _, err := fixture.app.capabilities.UpdateBinding("transfer_center", capabilities.UpdateInput{
		Enabled: &disabled, StorageSourceKey: &[]string{""}[0],
	}); err != nil {
		t.Fatal(err)
	}
	resp := serveTestRequest(t, fixture.handler, http.MethodDelete, "/api/v1/admin/sources/"+fixture.carrier.Key, "", fixture.adminCookie, fixture.adminCSRF)
	if resp.Code != http.StatusConflict || !strings.Contains(resp.Body.String(), "active_transfer_tasks") {
		t.Fatalf("guard status=%d body=%s", resp.Code, resp.Body.String())
	}
}

// submitMultipart 匿名提交（Bearer 会话 Token）。
func submitMultipart(t *testing.T, handler http.Handler, target, token string, fields map[string]string, fileName, content string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.WriteField("relative_path", fileName); err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, target, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func ownerIDOf(t *testing.T, fixture *transferFixture) int64 {
	t.Helper()
	user, err := fixture.app.users.GetByUsername("transfer-user")
	if err != nil {
		t.Fatal(err)
	}
	return user.ID
}

func int64String(value int64) string {
	return strconv.FormatInt(value, 10)
}
