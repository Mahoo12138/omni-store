package httpserver

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/sources"
)

func TestStaticHTTPSourceIsolationAndPublicPreflight(t *testing.T) {
	f := newStaticHTTPFixture(t)
	first := f.configure(t, `{"publish_root":"blog-assets"}`)
	if first.Code != http.StatusOK {
		t.Fatal(first.Body.String())
	}
	firstID := decodeStaticConfig(t, first)["public_asset_id"].(string)
	if resp := serveTestRequest(t, f.handler, http.MethodPut, "/api/v1/admin/sources/"+f.source.Key+"/static-access/config",
		`{"publish_root":"other"}`, f.cookie, f.csrf); resp.Code != http.StatusConflict || !strings.Contains(resp.Body.String(), CodeStaticRebindRequired) {
		t.Fatalf("silent publication change status=%d body=%s", resp.Code, resp.Body.String())
	}
	root := filepath.Join(filepath.Dir(f.sourceRoot), "second")
	if err := os.MkdirAll(filepath.Join(root, "media"), 0o755); err != nil {
		t.Fatal(err)
	}
	second, err := f.app.sources.Create(sources.CreateInput{Name: "Second", RootPath: root, ImportExisting: true})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/admin/sources/" + second.Key + "/static-access/config"
	secondResp := serveTestRequest(t, f.handler, http.MethodPost, path,
		`{"publish_root":"media","cache_mode":"no-cache","cors_mode":"allowlist","allowed_origins":["https://second.example.test"]}`, f.cookie, f.csrf)
	if secondResp.Code != http.StatusOK {
		t.Fatal(secondResp.Body.String())
	}
	secondID := decodeStaticConfig(t, secondResp)["public_asset_id"].(string)
	if err := os.WriteFile(filepath.Join(f.sourceRoot, "blog-assets/a.png"), []byte(staticPNG+"first"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "media/a.png"), []byte(staticPNG+"second"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ id, suffix, cors, cache string }{
		{firstID, "first", "*", "public, max-age=300"},
		{secondID, "second", "https://second.example.test", "no-cache"},
	} {
		for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
			req := httptest.NewRequest(method, "/assets/"+tc.id+"/a.png", nil)
			req.Header.Set("Origin", "https://second.example.test")
			rec := httptest.NewRecorder()
			f.handler.ServeHTTP(rec, req)
			wantStatus := http.StatusOK
			if method == http.MethodOptions {
				wantStatus = http.StatusNoContent
			}
			if rec.Code != wantStatus || rec.Header().Get("Access-Control-Allow-Origin") != tc.cors {
				t.Fatalf("%s %s status=%d headers=%v", method, tc.id, rec.Code, rec.Header())
			}
			if method == http.MethodGet && rec.Body.String() != staticPNG+tc.suffix {
				t.Fatalf("wrong source content=%q", rec.Body.String())
			}
			if method != http.MethodGet && rec.Body.Len() != 0 {
				t.Fatal("HEAD/OPTIONS must have no body")
			}
			if method != http.MethodOptions && rec.Header().Get("Cache-Control") != tc.cache {
				t.Fatal("wrong source cache")
			}
		}
	}
	// 404 适用于未知 ID、内部目录、目录请求；OPTIONS 也必须应用发布授权。
	for _, suffix := range []string{"ast-00000000000000000000000000000000/a.png", secondID + "/.omnistore/a.png", secondID + "/"} {
		resp := serveTestRequest(t, f.handler, http.MethodOptions, "/assets/"+suffix, "", nil, "")
		if resp.Code != http.StatusNotFound || resp.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("preflight %s status=%d headers=%v", suffix, resp.Code, resp.Header())
		}
	}
	if err := f.app.sources.SetDisabled(second.Key, true); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{http.MethodGet, http.MethodOptions} {
		resp := serveTestRequest(t, f.handler, method, "/assets/"+secondID+"/a.png", "", nil, "")
		if resp.Code != http.StatusNotFound {
			t.Fatalf("disabled source %s=%d", method, resp.Code)
		}
	}
	// 关闭/移除第二个协议不会改变第一源，普通管理员 API 无匿名写入。
	if resp := serveTestRequest(t, f.handler, http.MethodPut, path, `{"enabled":false}`, nil, ""); resp.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous config write=%d", resp.Code)
	}
	if resp := serveTestRequest(t, f.handler, http.MethodPut, path, `{"enabled":false}`, f.cookie, f.csrf); resp.Code != http.StatusOK {
		t.Fatal(resp.Body.String())
	}
	cfg := serveTestRequest(t, f.handler, http.MethodGet, path, "", f.cookie, "")
	rev := decodeStaticConfig(t, cfg)["revision"]
	if resp := serveTestRequest(t, f.handler, http.MethodDelete, path, fmt.Sprintf(`{"expected_revision":%v}`, rev), f.cookie, f.csrf); resp.Code != http.StatusOK {
		t.Fatal(resp.Body.String())
	}
	if resp := serveTestRequest(t, f.handler, http.MethodGet, "/assets/"+firstID+"/a.png", "", nil, ""); resp.Code != http.StatusOK {
		t.Fatalf("first source affected=%d", resp.Code)
	}
	if resp := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/capabilities", "", f.cookie, ""); strings.Contains(resp.Body.String(), "static_assets") {
		t.Fatal("static access leaked into site capability list")
	}
}
