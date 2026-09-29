package httpserver

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/publicdisk"
	"github.com/omni-store/omnistore/internal/sources"
)

func newPublicContentServer(t *testing.T) (*Server, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	sourceService := sources.NewService(conn, dataDir)
	source, err := sourceService.Create(sources.CreateInput{Name: "public-source", RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	capabilityService := capabilities.NewService(conn, sourceService)
	enabled := true
	if _, err := capabilityService.UpdateBinding(capabilities.CapabilityPublicDrive, capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &source.Key,
	}); err != nil {
		t.Fatalf("bind public drive: %v", err)
	}
	return &Server{public: publicdisk.NewService(fileService, capabilityService)}, root
}

// 公开盘 raw 端点继续强制主动内容下载，防止公开浏览器执行 HTML。
func TestHandlePublicRawForcesActiveContentToDownload(t *testing.T) {
	server, root := newPublicContentServer(t)
	if err := os.WriteFile(filepath.Join(root, "attack.html"), []byte("<!doctype html><script>alert(document.domain)</script>"), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/public/raw/attack.html", nil)
	req.SetPathValue("path", "attack.html")
	response := httptest.NewRecorder()

	server.handlePublicRaw(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	disposition, params, err := mime.ParseMediaType(response.Header().Get("Content-Disposition"))
	if err != nil {
		t.Fatalf("parse disposition: %v", err)
	}
	if disposition != "attachment" || params["filename"] != "attack.html" {
		t.Fatalf("disposition=%q filename=%q", disposition, params["filename"])
	}
	if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options=%q", got)
	}
}

// 未绑定或关闭公开盘时 raw 端点返回真实 404。
func TestHandlePublicRawReturns404WhenUnbound(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	sourceService := sources.NewService(conn, dataDir)
	if _, err := sourceService.Create(sources.CreateInput{Name: "idle-source", RootPath: root}); err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	capabilityService := capabilities.NewService(conn, sourceService)
	server := &Server{public: publicdisk.NewService(fileService, capabilityService)}

	req := httptest.NewRequest(http.MethodGet, "/public/raw/whatever.txt", nil)
	req.SetPathValue("path", "whatever.txt")
	response := httptest.NewRecorder()
	server.handlePublicRaw(response, req)
	if response.Code != http.StatusNotFound {
		t.Fatalf("unbound raw status=%d, want 404", response.Code)
	}
}
