package httpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
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
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve root path: %v", err)
	}
	if response.Data.RootPath != filepath.Clean(realRoot) || response.Data.Summary.Files != 1 {
		t.Fatalf("unexpected response: %+v", response.Data)
	}
}

func TestHandleAdminCreateSourceRequiresConfirmationAndAutoReconciles(t *testing.T) {
	server, conn, base := newSourceCreateHandlerServer(t)
	root := filepath.Join(base, "existing")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "photo.jpg"), []byte("image"), 0o600); err != nil {
		t.Fatal(err)
	}

	unconfirmed := serveSourceCreateRequest(t, server, root, false)
	assertErrorResponse(t, unconfirmed, http.StatusBadRequest, CodeValidationError)
	var count int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM storage_sources`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("unconfirmed create sources=%d err=%v", count, err)
	}

	confirmed := serveSourceCreateRequest(t, server, root, true)
	if confirmed.Code != http.StatusOK {
		t.Fatalf("confirmed create status=%d body=%s", confirmed.Code, confirmed.Body.String())
	}
	var envelope struct {
		Data struct {
			Source    models.StorageSource   `json:"source"`
			Reconcile models.ReconcileResult `json:"reconcile"`
		} `json:"data"`
	}
	decodeTestJSON(t, confirmed, &envelope)
	if envelope.Data.Source.Key == "" || envelope.Data.Source.IsDisabled ||
		envelope.Data.Reconcile.Added != 1 || envelope.Data.Reconcile.Unowned != 1 {
		t.Fatalf("unexpected create result: %+v", envelope.Data)
	}
	var relativePath, ownerType string
	if err := conn.QueryRow(`SELECT relative_path, owner_type FROM file_records WHERE storage_source_id = ?`,
		envelope.Data.Source.ID).Scan(&relativePath, &ownerType); err != nil {
		t.Fatal(err)
	}
	if relativePath != "photo.jpg" || ownerType != models.FileOwnerUnowned {
		t.Fatalf("imported record path=%q owner=%q", relativePath, ownerType)
	}
}

func TestHandleAdminCreateSourceRemovesDisabledSourceWhenReconcileFails(t *testing.T) {
	server, conn, base := newSourceCreateHandlerServer(t)
	root := filepath.Join(base, "scan-failure")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	filePath := filepath.Join(root, "keep.txt")
	if err := os.WriteFile(filePath, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`CREATE TRIGGER reject_import BEFORE INSERT ON file_records
  BEGIN SELECT RAISE(FAIL, 'forced reconcile failure'); END`); err != nil {
		t.Fatal(err)
	}

	response := serveSourceCreateRequest(t, server, root, true)
	assertErrorResponse(t, response, http.StatusInternalServerError, CodeInternalError)
	var sourceCount, recordCount int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM storage_sources`).Scan(&sourceCount); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(`SELECT COUNT(*) FROM file_records`).Scan(&recordCount); err != nil {
		t.Fatal(err)
	}
	if sourceCount != 0 || recordCount != 0 {
		t.Fatalf("failed import left source=%d records=%d", sourceCount, recordCount)
	}
	if content, err := os.ReadFile(filePath); err != nil || string(content) != "keep" {
		t.Fatalf("failed import changed real file=%q err=%v", content, err)
	}
}

func newSourceCreateHandlerServer(t *testing.T) (*Server, *sql.DB, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	sourceService := sources.NewService(conn, dataDir)
	return &Server{
		sources: sourceService,
		files:   files.NewService(conn, sourceService, locks.NewManager()),
		audit:   audit.New(conn, false, 0, logger),
		proxy:   security.NewProxyResolver(nil),
		logger:  logger,
	}, conn, base
}

func serveSourceCreateRequest(t *testing.T, server *Server, root string, importExisting bool) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"name": "Imported", "description": "", "root_path": root,
		"import_existing": importExisting,
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/sources", strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	admin := &models.User{ID: 1, Role: models.RoleSuperAdmin}
	req = req.WithContext(context.WithValue(req.Context(), currentUserKey, admin))
	recorder := httptest.NewRecorder()
	server.handleAdminCreateSource(recorder, req)
	return recorder
}
