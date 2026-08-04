package httpserver

import (
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
	if _, err := sourceService.Create(sources.CreateInput{SourceID: "photo-source", RootPath: root}); err != nil {
		t.Fatalf("create source: %v", err)
	}
	enabled, oldPath, newPath := true, "/photos", "/archive"
	if _, err := sourceService.Update("photo-source", sources.UpdateInput{
		PublicReadEnabled: &enabled, PublicMountPath: &oldPath,
	}); err != nil {
		t.Fatalf("set initial mount: %v", err)
	}
	if _, err := sourceService.Update("photo-source", sources.UpdateInput{PublicMountPath: &newPath}); err != nil {
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
