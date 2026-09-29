package webdav

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/security"
)

// 托管命名空间在 WebDAV 上必须表现为真实 404，且不出现在父目录枚举里。
func TestWebDAVManagedNamespaceReturnsReal404(t *testing.T) {
	env := newWebDAVTestEnv(t)
	if err := os.Mkdir(filepath.Join(env.root, security.ManagedNamespaceSegment), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(env.root, security.ManagedNamespaceSegment, "payload.bin"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(env.root, "visible.txt"), []byte("visible"), 0o600); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name   string
		method string
		inner  string
	}{
		{"get managed file", "GET", "/.omnistore/payload.bin"},
		{"head managed file", "HEAD", "/.omnistore/payload.bin"},
		{"get managed dir", "GET", "/.omnistore"},
		{"propfind managed dir", "PROPFIND", "/.omnistore"},
		{"propfind managed file", "PROPFIND", "/.omnistore/payload.bin"},
		{"encoded traversal", "GET", "/.%6Fmnistore/payload.bin"},
	}
	for _, tc := range cases {
		resp := env.request(t, tc.method, env.path(tc.inner), "", map[string]string{"Depth": "1"})
		if resp.Code != http.StatusNotFound {
			t.Errorf("%s: %s %s = %d, want 404 (body=%.80s)", tc.name, tc.method, tc.inner, resp.Code, resp.Body.String())
		}
	}

	// PROPFIND 父目录枚举不包含托管成员。
	listing := env.request(t, "PROPFIND", env.path("/"), "", map[string]string{"Depth": "1"})
	if listing.Code != http.StatusMultiStatus {
		t.Fatalf("root PROPFIND = %d", listing.Code)
	}
	if strings.Contains(listing.Body.String(), ".omnistore<") || strings.Contains(listing.Body.String(), "payload.bin") {
		t.Fatalf("PROPFIND leaked managed members: %s", listing.Body.String())
	}
	if !strings.Contains(listing.Body.String(), "visible.txt") {
		t.Fatalf("PROPFIND lost normal members: %s", listing.Body.String())
	}

	// 写请求同样按不存在拒绝，真实文件保持原样。
	if resp := env.request(t, "PUT", env.path("/.omnistore/evil.txt"), "evil", nil); resp.Code != http.StatusNotFound {
		t.Errorf("PUT into managed = %d, want 404", resp.Code)
	}
	if resp := env.request(t, "MKCOL", env.path("/.omnistore/sub"), "", nil); resp.Code != http.StatusNotFound {
		t.Errorf("MKCOL into managed = %d, want 404", resp.Code)
	}
	if resp := env.request(t, "DELETE", env.path("/.omnistore/payload.bin"), "", nil); resp.Code != http.StatusNotFound {
		t.Errorf("DELETE managed = %d, want 404", resp.Code)
	}
	// Destination 指向托管命名空间的 MOVE 必须拒绝。
	move := env.request(t, "MOVE", env.path("/visible.txt"), "", map[string]string{
		"Destination": "http://example.test/dav/" + env.source.Key + "/.omnistore/visible.txt",
	})
	if move.Code != http.StatusNotFound {
		t.Errorf("MOVE into managed = %d, want 404", move.Code)
	}
	payload, err := os.ReadFile(filepath.Join(env.root, security.ManagedNamespaceSegment, "payload.bin"))
	if err != nil || string(payload) != "secret" {
		t.Fatalf("managed payload changed: %q err=%v", payload, err)
	}
	if _, err := os.Stat(filepath.Join(env.root, "evil.txt")); err == nil {
		t.Fatal("rejected PUT must not create files")
	}
}
