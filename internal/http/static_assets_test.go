package httpserver

import (
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/web"
)

const staticPNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89rest"

type staticFixture struct {
	handler    http.Handler
	app        *Server
	cookie     *http.Cookie
	csrf       string
	source     *models.StorageSource
	sourceRoot string
}

func newStaticHTTPFixture(t *testing.T) *staticFixture {
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
	cfg.Server.PublicURL = "https://files.example.test"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	httpServer, app := New(cfg, conn, logger)

	admin, err := app.users.Create("static-admin", "Static Admin", "admin-password", models.RoleSuperAdmin)
	if err != nil {
		t.Fatal(err)
	}
	sessionID, csrf, err := app.sessions.Create(admin.ID, "static-test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	sourceRoot := filepath.Join(base, "source")
	if err := os.MkdirAll(filepath.Join(sourceRoot, "blog-assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := app.sources.Create(sources.CreateInput{Name: "Blog", RootPath: sourceRoot, ImportExisting: true})
	if err != nil {
		t.Fatal(err)
	}
	return &staticFixture{
		handler: httpServer.Handler, app: app,
		cookie: &http.Cookie{Name: SessionCookieName(), Value: sessionID}, csrf: csrf,
		source: source, sourceRoot: sourceRoot,
	}
}

func (f *staticFixture) configure(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return serveTestRequest(t, f.handler, http.MethodPost, "/api/v1/admin/static-assets/config", body, f.cookie, f.csrf)
}

func decodeStaticConfig(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var envelope struct {
		Data map[string]any `json:"data"`
	}
	decodeTestJSON(t, recorder, &envelope)
	return envelope.Data
}

// 端到端：配置发布空间 → 普通上传写入发布目录 → /assets/{id}/{path} 公开读取。
func TestStaticAssetsPublicServingLifecycle(t *testing.T) {
	fixture := newStaticHTTPFixture(t)
	created := fixture.configure(t, `{"source_key":"`+fixture.source.Key+`","publish_root":"blog-assets"}`)
	if created.Code != http.StatusOK {
		t.Fatalf("configure status=%d body=%s", created.Code, created.Body.String())
	}
	cfgData := decodeStaticConfig(t, created)
	assetID, _ := cfgData["public_asset_id"].(string)
	if !strings.HasPrefix(assetID, "ast-") {
		t.Fatalf("asset id=%v", cfgData["public_asset_id"])
	}
	if cfgData["base_url"] != "https://files.example.test/assets/"+assetID+"/" {
		t.Fatalf("base url=%v", cfgData["base_url"])
	}

	// 直接写盘模拟已经过普通上传/管线写入的文件（上传本身由文件管理器测试覆盖）。
	if err := os.MkdirAll(filepath.Join(fixture.sourceRoot, "blog-assets", "posts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixture.sourceRoot, "blog-assets", "posts", "cover.png"), []byte(staticPNG), 0o600); err != nil {
		t.Fatal(err)
	}

	base := "/assets/" + assetID
	get := serveTestRequest(t, fixture.handler, http.MethodGet, base+"/posts/cover.png", "", nil, "")
	if get.Code != http.StatusOK {
		t.Fatalf("GET status=%d body=%s", get.Code, get.Body.String())
	}
	if got := get.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("content type=%q", got)
	}
	if got := get.Header().Get("Cache-Control"); got != "public, max-age=300" {
		t.Fatalf("cache=%q", got)
	}
	if got := get.Header().Get("Cross-Origin-Resource-Policy"); got != "cross-origin" {
		t.Fatalf("corp=%q", got)
	}
	if !strings.HasPrefix(get.Header().Get("ETag"), `W/"`) {
		t.Fatalf("etag=%q", get.Header().Get("ETag"))
	}
	etag := get.Header().Get("ETag")

	// HEAD：与 GET 元数据一致、无响应体。
	head := serveTestRequest(t, fixture.handler, http.MethodHead, base+"/posts/cover.png", "", nil, "")
	if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") == "" {
		t.Fatalf("head status=%d bodyLen=%d", head.Code, head.Body.Len())
	}

	// 单段 Range：206 + Content-Range。
	rangeReq := httptest.NewRequest(http.MethodGet, base+"/posts/cover.png", nil)
	rangeReq.Header.Set("Range", "bytes=0-3")
	rangeResp := httptest.NewRecorder()
	fixture.handler.ServeHTTP(rangeResp, rangeReq)
	if rangeResp.Code != http.StatusPartialContent {
		t.Fatalf("range status=%d", rangeResp.Code)
	}
	if got := rangeResp.Header().Get("Content-Range"); !strings.HasPrefix(got, "bytes 0-3/") {
		t.Fatalf("content-range=%q", got)
	}

	// 不可满足 Range：416 + bytes */{size}。
	unsatisfiable := httptest.NewRequest(http.MethodGet, base+"/posts/cover.png", nil)
	unsatisfiable.Header.Set("Range", "bytes=999999-")
	unsatResp := httptest.NewRecorder()
	fixture.handler.ServeHTTP(unsatResp, unsatisfiable)
	if unsatResp.Code != http.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("416 status=%d", unsatResp.Code)
	}
	if got := unsatResp.Header().Get("Content-Range"); got != "bytes */"+strconv.Itoa(len(staticPNG)) {
		t.Fatalf("416 content-range=%q", got)
	}

	// 条件请求：弱 ETag 匹配返回 304。
	conditional := httptest.NewRequest(http.MethodGet, base+"/posts/cover.png", nil)
	conditional.Header.Set("If-None-Match", etag)
	condResp := httptest.NewRecorder()
	fixture.handler.ServeHTTP(condResp, conditional)
	if condResp.Code != http.StatusNotModified {
		t.Fatalf("conditional status=%d", condResp.Code)
	}

	// If-Range 携带弱 ETag：无强验证依据，返回完整 200（不假装匹配）。
	ifRange := httptest.NewRequest(http.MethodGet, base+"/posts/cover.png", nil)
	ifRange.Header.Set("Range", "bytes=0-3")
	ifRange.Header.Set("If-Range", etag)
	ifRangeResp := httptest.NewRecorder()
	fixture.handler.ServeHTTP(ifRangeResp, ifRange)
	if ifRangeResp.Code != http.StatusOK || ifRangeResp.Body.Len() != len(staticPNG) {
		t.Fatalf("if-range status=%d len=%d", ifRangeResp.Code, ifRangeResp.Body.Len())
	}

	// 404 语义：目录、发布根、不存在；必须 no-store。
	// （不带尾斜杠的 /assets/{id} 由 mux 307 到带斜杠形式，落点同样是 404。）
	for _, path := range []string{"/", "/posts", "/posts/absent.png"} {
		resp := serveTestRequest(t, fixture.handler, http.MethodGet, base+path, "", nil, "")
		if resp.Code != http.StatusNotFound {
			t.Errorf("GET %q status=%d, want 404", path, resp.Code)
		}
		if got := resp.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("GET %q cache=%q, want no-store", path, got)
		}
	}

	// 含 `..` 的原始 URL 会被 ServeMux 规范化重定向：落点绝不返回真实媒体内容。
	// 非 ast- 标识形状的落点交给 SPA 外壳（text/html），ast 形状但错误 ID 返回 404。
	for _, path := range []string{"/../escape.png", "/posts/../../blog-assets/cover.png"} {
		resp := serveTestRequest(t, fixture.handler, http.MethodGet, base+path, "", nil, "")
		if resp.Code == http.StatusOK {
			t.Errorf("dot-segment URL %q must not be served inline (status=%d)", path, resp.Code)
		}
		if resp.Code == http.StatusTemporaryRedirect || resp.Code == http.StatusMovedPermanently {
			location := resp.Header().Get("Location")
			if strings.Contains(location, "..") {
				t.Errorf("redirect target keeps dot segments: %q", location)
			}
			followed := httptest.NewRequest(http.MethodGet, location, nil)
			followedRec := httptest.NewRecorder()
			fixture.handler.ServeHTTP(followedRec, followed)
			if followedRec.Code == http.StatusOK {
				if got := followedRec.Header().Get("Content-Type"); !strings.Contains(got, "text/html") {
					t.Errorf("redirect target %q served %q with body len %d, want SPA shell",
						location, got, followedRec.Body.Len())
				}
				if strings.Contains(followedRec.Body.String(), "PNG rest") {
					t.Errorf("redirect target %q leaked media content", location)
				}
			}
		}
	}

	// 类型不允许：HTML 与签名矛盾文件不公开（404）。
	if err := os.WriteFile(filepath.Join(fixture.sourceRoot, "blog-assets", "page.html"), []byte("<html></html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixture.sourceRoot, "blog-assets", "fake.png"), []byte("not a png"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"page.html", "fake.png"} {
		resp := serveTestRequest(t, fixture.handler, http.MethodGet, base+"/"+name, "", nil, "")
		if resp.Code != http.StatusNotFound {
			t.Errorf("%s status=%d, want 404", name, resp.Code)
		}
	}

	// 非允许方法：405 而不是 SPA fallback 200。
	for _, method := range []string{http.MethodPut, http.MethodPost, http.MethodDelete} {
		resp := serveTestRequest(t, fixture.handler, method, base+"/posts/cover.png", "", nil, "")
		if resp.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s status=%d, want 405", method, resp.Code)
		}
	}

	// 关闭服务：后续原站请求 404；重新开启恢复。
	disabled := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/static-assets/config",
		`{"enabled":false}`, fixture.cookie, fixture.csrf)
	if disabled.Code != http.StatusOK {
		t.Fatalf("disable status=%d body=%s", disabled.Code, disabled.Body.String())
	}
	if resp := serveTestRequest(t, fixture.handler, http.MethodGet, base+"/posts/cover.png", "", nil, ""); resp.Code != http.StatusNotFound {
		t.Fatalf("disabled GET status=%d", resp.Code)
	}
	enabledResp := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/static-assets/config",
		`{"enabled":true}`, fixture.cookie, fixture.csrf)
	if enabledResp.Code != http.StatusOK {
		t.Fatalf("enable status=%d", enabledResp.Code)
	}
	if resp := serveTestRequest(t, fixture.handler, http.MethodGet, base+"/posts/cover.png", "", nil, ""); resp.Code != http.StatusOK {
		t.Fatalf("re-enabled GET status=%d", resp.Code)
	}
}

// CORS：public 通配、allowlist 精确匹配 + Vary、none 不加头；预检只开放 GET/HEAD。
func TestStaticAssetsCORS(t *testing.T) {
	fixture := newStaticHTTPFixture(t)
	created := fixture.configure(t, `{"source_key":"`+fixture.source.Key+`","publish_root":"blog-assets"}`)
	if created.Code != http.StatusOK {
		t.Fatal(created.Body.String())
	}
	assetID, _ := decodeStaticConfig(t, created)["public_asset_id"].(string)
	if err := os.WriteFile(filepath.Join(fixture.sourceRoot, "blog-assets", "a.png"), []byte(staticPNG), 0o600); err != nil {
		t.Fatal(err)
	}
	base := "/assets/" + assetID

	// public：ACAO: *。
	publicResp := httptest.NewRequest(http.MethodGet, base+"/a.png", nil)
	publicResp.Header.Set("Origin", "https://blog.example.net")
	recorder := httptest.NewRecorder()
	fixture.handler.ServeHTTP(recorder, publicResp)
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("public ACAO=%q", got)
	}

	// allowlist：精确匹配才返回 ACAO 并带 Vary。
	allowlist := `{"cors_mode":"allowlist","allowed_origins":["https://blog.example.net"]}`
	if resp := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/static-assets/config", allowlist, fixture.cookie, fixture.csrf); resp.Code != http.StatusOK {
		t.Fatalf("allowlist config status=%d body=%s", resp.Code, resp.Body.String())
	}
	matched := httptest.NewRequest(http.MethodGet, base+"/a.png", nil)
	matched.Header.Set("Origin", "https://blog.example.net")
	matchedRec := httptest.NewRecorder()
	fixture.handler.ServeHTTP(matchedRec, matched)
	if got := matchedRec.Header().Get("Access-Control-Allow-Origin"); got != "https://blog.example.net" {
		t.Fatalf("allowlist ACAO=%q", got)
	}
	if got := matchedRec.Header().Get("Vary"); !strings.Contains(got, "Origin") {
		t.Fatalf("allowlist Vary=%q", got)
	}
	foreign := httptest.NewRequest(http.MethodGet, base+"/a.png", nil)
	foreign.Header.Set("Origin", "https://evil.example.org")
	foreignRec := httptest.NewRecorder()
	fixture.handler.ServeHTTP(foreignRec, foreign)
	if got := foreignRec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("foreign origin ACAO=%q, want empty", got)
	}

	// none：不加 CORS 头（不等于阻止普通 <img> 嵌入）。
	if resp := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/static-assets/config",
		`{"cors_mode":"none"}`, fixture.cookie, fixture.csrf); resp.Code != http.StatusOK {
		t.Fatal(resp.Body.String())
	}
	noneRec := httptest.NewRecorder()
	noneReq := httptest.NewRequest(http.MethodGet, base+"/a.png", nil)
	noneReq.Header.Set("Origin", "https://blog.example.net")
	fixture.handler.ServeHTTP(noneRec, noneReq)
	if got := noneRec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("none ACAO=%q", got)
	}

	// 预检：只允许 GET/HEAD，不含凭据与写方法。
	if resp := serveTestRequest(t, fixture.handler, http.MethodPut, "/api/v1/admin/static-assets/config",
		`{"cors_mode":"public"}`, fixture.cookie, fixture.csrf); resp.Code != http.StatusOK {
		t.Fatal(resp.Body.String())
	}
	preflight := httptest.NewRequest(http.MethodOptions, base+"/a.png", nil)
	preflight.Header.Set("Origin", "https://blog.example.net")
	preflight.Header.Set("Access-Control-Request-Method", "PUT")
	preflightRec := httptest.NewRecorder()
	fixture.handler.ServeHTTP(preflightRec, preflight)
	if preflightRec.Code != http.StatusNoContent {
		t.Fatalf("preflight status=%d", preflightRec.Code)
	}
	if got := preflightRec.Header().Get("Access-Control-Allow-Methods"); got != "GET, HEAD" {
		t.Fatalf("preflight methods=%q", got)
	}
	if got := preflightRec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
		t.Fatalf("preflight credentials=%q, want empty", got)
	}
}

// AST-11：公开盘关闭/未绑定时静态资源照常工作。
func TestStaticAssetsIndependentOfPublicDrive(t *testing.T) {
	fixture := newStaticHTTPFixture(t)
	created := fixture.configure(t, `{"source_key":"`+fixture.source.Key+`","publish_root":"blog-assets"}`)
	assetID, _ := decodeStaticConfig(t, created)["public_asset_id"].(string)
	if err := os.WriteFile(filepath.Join(fixture.sourceRoot, "blog-assets", "a.png"), []byte(staticPNG), 0o600); err != nil {
		t.Fatal(err)
	}

	// 公开盘认证为未绑定（capability 未配置）时静态读取可用。
	summary := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/public/summary", "", nil, "")
	if !strings.Contains(summary.Body.String(), `"enabled":false`) {
		t.Fatalf("public drive should be unbound: %s", summary.Body.String())
	}
	if resp := serveTestRequest(t, fixture.handler, http.MethodGet, "/assets/"+assetID+"/a.png", "", nil, ""); resp.Code != http.StatusOK {
		t.Fatalf("static read status=%d", resp.Code)
	}

	// 托管命名空间内容永不经 /assets 公开。
	managedRel := filepath.Join(fixture.sourceRoot, "blog-assets", ".omnistore", "hidden.png")
	if err := os.MkdirAll(filepath.Dir(managedRel), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(managedRel, []byte(staticPNG), 0o600); err != nil {
		t.Fatal(err)
	}
	if resp := serveTestRequest(t, fixture.handler, http.MethodGet, "/assets/"+assetID+"/.omnistore/hidden.png", "", nil, ""); resp.Code != http.StatusNotFound {
		t.Fatalf("managed via assets status=%d", resp.Code)
	}

	// 绑定记录：static_assets 能力已绑定且 enabled。
	bindings := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/admin/capabilities", "", fixture.cookie, "")
	if !strings.Contains(bindings.Body.String(), `"capability":"static_assets"`) {
		t.Fatalf("capabilities body=%s", bindings.Body.String())
	}
}

// 回归：/assets/ 前缀同时承载前端构建产物（Vite dist/assets/*）。
// 公开静态资源路由不得遮蔽 JS/CSS bundle，否则页面白屏。
func TestAssetsPrefixServesFrontendBundles(t *testing.T) {
	fixture := newStaticHTTPFixture(t)
	dist, err := fs.Sub(web.DistFS, "dist")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(dist, "assets")
	if err != nil {
		t.Fatalf("dist assets missing: %v", err)
	}
	var bundle string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".js") {
			bundle = entry.Name()
			break
		}
	}
	if bundle == "" {
		t.Fatal("no JS bundle found in dist/assets")
	}

	resp := serveTestRequest(t, fixture.handler, http.MethodGet, "/assets/"+bundle, "", nil, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("frontend bundle /assets/%s status=%d, want 200 (SPA 静态文件)", bundle, resp.Code)
	}
	if got := resp.Header().Get("Content-Type"); !strings.Contains(got, "javascript") {
		t.Fatalf("bundle content-type=%q", got)
	}

	// 非 ast- 形状的多段路径同样是前端资源语义：交给 SPA（index.html 外壳）。
	shell := serveTestRequest(t, fixture.handler, http.MethodGet, "/assets/blog-assets/cover.png", "", nil, "")
	if shell.Code != http.StatusOK || !strings.Contains(shell.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("non-asset id path status=%d content-type=%q", shell.Code, shell.Header().Get("Content-Type"))
	}
	if strings.Contains(shell.Body.String(), "PNG rest") {
		t.Fatal("non-asset id path must never leak media content")
	}

	// ast 形状但错误 ID：真实 404，不回退 SPA。
	wrong := serveTestRequest(t, fixture.handler, http.MethodGet,
		"/assets/ast-00000000000000000000000000000000/a.png", "", nil, "")
	if wrong.Code != http.StatusNotFound {
		t.Fatalf("wrong asset id status=%d, want 404", wrong.Code)
	}
}
