package httpserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestHandleAdminPreflightSource(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	root := filepath.Join(base, "existing")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "photo.jpg"), []byte("image"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	payload, err := json.Marshal(map[string]string{"root_path": root})
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/sources/preflight", strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	server := &Server{sources: sources.NewService(conn, dataDir)}

	server.handleAdminPreflightSource(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected response status %d: %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Data sources.DirectoryPreview `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Data.RootPath != filepath.Clean(root) || response.Data.Summary.Files != 1 {
		t.Fatalf("unexpected response: %+v", response.Data)
	}
}
