package httpserver

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

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
	enabled, mountPath := true, "/public"
	if _, err := sourceService.Update(source.Key, sources.UpdateInput{
		PublicReadEnabled: &enabled, PublicMountPath: &mountPath,
	}); err != nil {
		t.Fatalf("enable public mount: %v", err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	return &Server{public: publicdisk.NewService(conn, sourceService, fileService)}, root
}

func newPublicRedirectServer(t *testing.T) *Server {
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
	source, err := sourceService.Create(sources.CreateInput{Name: "photo-source", RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	enabled, oldPath, newPath := true, "/photos", "/archive"
	if _, err := sourceService.Update(source.Key, sources.UpdateInput{
		PublicReadEnabled: &enabled, PublicMountPath: &oldPath,
	}); err != nil {
		t.Fatalf("set initial mount: %v", err)
	}
	if _, err := sourceService.Update(source.Key, sources.UpdateInput{PublicMountPath: &newPath}); err != nil {
		t.Fatalf("rename mount: %v", err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	return &Server{public: publicdisk.NewService(conn, sourceService, fileService)}
}

func TestHandlePublicPageRedirectsOldMountAndPreservesQuery(t *testing.T) {
	server := newPublicRedirectServer(t)
	spaCalled := false
	spa := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		spaCalled = true
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/p/photos/2026?a=1", nil)
	req.SetPathValue("virtual_path", "photos/2026")
	recorder := httptest.NewRecorder()

	server.handlePublicPage(spa)(recorder, req)
	if recorder.Code != http.StatusPermanentRedirect {
		t.Fatalf("unexpected status: %d", recorder.Code)
	}
	if location := recorder.Header().Get("Location"); location != "/p/archive/2026?a=1" {
		t.Fatalf("unexpected location: %s", location)
	}
	if spaCalled {
		t.Fatal("SPA should not handle an old mount path")
	}
}

func TestHandlePublicRawRedirectsOldMountAndPreservesDownload(t *testing.T) {
	server := newPublicRedirectServer(t)
	req := httptest.NewRequest(http.MethodGet, "/raw/photos/a.jpg?download=1", nil)
	req.SetPathValue("virtual_path", "photos/a.jpg")
	recorder := httptest.NewRecorder()

	server.handlePublicRaw(recorder, req)
	if recorder.Code != http.StatusPermanentRedirect {
		t.Fatalf("unexpected status: %d", recorder.Code)
	}
	if location := recorder.Header().Get("Location"); location != "/raw/archive/a.jpg?download=1" {
		t.Fatalf("unexpected location: %s", location)
	}
}

func TestHandlePublicBrowseRedirectsOldMountAndPreservesOptions(t *testing.T) {
	server := newPublicRedirectServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/browse?path=%2Fphotos%2F2026&page=2&order=desc", nil)
	recorder := httptest.NewRecorder()

	server.handlePublicBrowse(recorder, req)
	if recorder.Code != http.StatusPermanentRedirect {
		t.Fatalf("unexpected status: %d", recorder.Code)
	}
	want := "/api/v1/public/browse?order=desc&page=2&path=%2Farchive%2F2026"
	if location := recorder.Header().Get("Location"); location != want {
		t.Fatalf("unexpected location: %s", location)
	}
}

func TestHandlePublicRawForcesActiveContentToDownload(t *testing.T) {
	server, root := newPublicContentServer(t)
	if err := os.WriteFile(filepath.Join(root, "attack.html"), []byte("<!doctype html><script>alert(document.domain)</script>"), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/raw/public/attack.html", nil)
	req.SetPathValue("virtual_path", "public/attack.html")
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
