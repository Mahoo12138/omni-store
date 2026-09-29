package httpserver

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/security"
)

// 通用 REST 入口对托管命名空间必须返回真实 404（NS-03），写请求按不存在拒绝。
func TestRESTManagedNamespaceIsolation(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)
	primaryBase := "/api/v1/sources/" + fixture.primary.Key
	managedFile := filepath.Join(fixture.primary.RootPath, security.ManagedNamespaceSegment, "payload.bin")
	if err := os.Mkdir(filepath.Join(fixture.primary.RootPath, security.ManagedNamespaceSegment), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(managedFile, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	list := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/files?path=%2F.omnistore", "", fixture.cookie, "")
	assertErrorResponse(t, list, http.StatusNotFound, CodeFileNotFound)
	stat := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/files/stat?path=%2F.omnistore%2Fpayload.bin", "", fixture.cookie, "")
	assertErrorResponse(t, stat, http.StatusNotFound, CodeFileNotFound)
	download := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/download?path=%2F.omnistore%2Fpayload.bin", "", fixture.cookie, "")
	if download.Code != http.StatusNotFound {
		t.Fatalf("download managed = %d body=%s", download.Code, download.Body.String())
	}
	raw := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/raw?path=%2F.omnistore%2Fpayload.bin", "", fixture.cookie, "")
	if raw.Code != http.StatusNotFound {
		t.Fatalf("raw managed = %d", raw.Code)
	}
	del := serveTestRequest(t, fixture.handler, http.MethodDelete, primaryBase+"/files?path=%2F.omnistore%2Fpayload.bin", "", fixture.cookie, fixture.csrf)
	if del.Code != http.StatusNotFound {
		t.Fatalf("delete managed = %d body=%s", del.Code, del.Body.String())
	}
	nestedFolder := serveTestRequest(t, fixture.handler, http.MethodPost, primaryBase+"/folders", `{"path":"/blog/.omnistore","name":"sub"}`, fixture.cookie, fixture.csrf)
	if nestedFolder.Code != http.StatusNotFound {
		t.Fatalf("mkdir into managed = %d body=%s", nestedFolder.Code, nestedFolder.Body.String())
	}
	relativeUpload := serveMultipartUploadWithRelativePath(t, fixture, primaryBase+"/upload?path=%2F", ".omnistore/evil.txt", []byte("must reject"))
	assertErrorResponse(t, relativeUpload, http.StatusNotFound, CodeFileNotFound)
	namedUpload := serveMultipartUpload(t, fixture, primaryBase+"/upload?path=%2F.omnistore", "evil.txt", []byte("must reject"))
	assertErrorResponse(t, namedUpload, http.StatusNotFound, CodeFileNotFound)

	// 失败请求不能留下文件系统副作用。
	if _, err := os.Stat(filepath.Join(fixture.primary.RootPath, "blog")); err == nil {
		t.Fatal("failed folder create must not create directories")
	}
	if _, err := os.Stat(filepath.Join(fixture.primary.RootPath, "evil.txt")); err == nil {
		t.Fatal("failed upload must not create files")
	}
	payload, err := os.ReadFile(managedFile)
	if err != nil || string(payload) != "secret" {
		t.Fatalf("managed payload changed: %q err=%v", payload, err)
	}

	// 正常条目不受影响：普通文件名以 .omnistore 开头但不是托管段。
	if err := os.WriteFile(filepath.Join(fixture.primary.RootPath, ".omnistore.txt"), []byte("plain"), 0o600); err != nil {
		t.Fatal(err)
	}
	normalStat := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/files/stat?path=%2F.omnistore.txt", "", fixture.cookie, "")
	if normalStat.Code != http.StatusOK {
		t.Fatalf("normal dotfile stat = %d body=%s", normalStat.Code, normalStat.Body.String())
	}
}

// `/.omnistore/...` 直接站点 URL 必须在 SPA fallback 之前返回 404（NS-03）。
func TestSPAFallbackDoesNotSwallowManagedNamespace(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)
	for _, target := range []string{"/.omnistore", "/.omnistore/transfer/send/x", "/blog/.omnistore/payload.bin"} {
		resp := serveTestRequest(t, fixture.handler, http.MethodGet, target, "", nil, "")
		if resp.Code != http.StatusNotFound {
			t.Fatalf("SPA %s = %d body=%.60s, want 404", target, resp.Code, resp.Body.String())
		}
	}
	// 正常前端路由仍然回退 index.html。
	resp := serveTestRequest(t, fixture.handler, http.MethodGet, "/files", "", nil, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("SPA normal route = %d", resp.Code)
	}
}
