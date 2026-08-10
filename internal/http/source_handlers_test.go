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
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/imagebed"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/s3api"
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

func TestHandleAdminDeleteSourceRejectsPendingTransferRecovery(t *testing.T) {
	server, _, base := newSourceCreateHandlerServer(t)
	sourceRoot := filepath.Join(base, "source-delete-pending")
	targetRoot := filepath.Join(base, "source-delete-target")
	for _, root := range []string{sourceRoot, targetRoot} {
		if err := os.Mkdir(root, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	source, err := server.sources.Create(sources.CreateInput{Name: "pending-source", RootPath: sourceRoot})
	if err != nil {
		t.Fatal(err)
	}
	target, err := server.sources.Create(sources.CreateInput{Name: "pending-target", RootPath: targetRoot})
	if err != nil {
		t.Fatal(err)
	}
	operationID := "trf-00112233445566778899aabb"
	operationsDir := filepath.Join(base, "data", "operations", "transfers")
	if err := os.MkdirAll(operationsDir, 0o700); err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"version": 1, "operation_id": operationID,
		"source_storage_source_id": source.ID, "target_storage_source_id": target.ID,
		"source_relative_path": "source.txt", "target_relative_path": "target.txt",
		"is_directory": false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(operationsDir, operationID+".json"), payload, 0o600); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/sources/"+source.Key, nil)
	req.SetPathValue("key", source.Key)
	recorder := httptest.NewRecorder()
	server.handleAdminDeleteSource(recorder, req)
	assertErrorResponse(t, recorder, http.StatusConflict, CodeConflict)
	if _, err := server.sources.Get(source.Key); err != nil {
		t.Fatalf("source with pending transfer was deleted: %v", err)
	}
}

func TestHandleAdminDeleteSourceRejectsPendingImageUploadRecovery(t *testing.T) {
	server, conn, base := newSourceCreateHandlerServer(t)
	root := filepath.Join(base, "source-delete-image-upload")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := server.sources.Create(sources.CreateInput{Name: "pending-image-source", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	server.imagebed, err = imagebed.NewService(conn, "/images", "http://store.test",
		filepath.Join(base, "data", "cache", "thumbnails"), server.sources, server.files)
	if err != nil {
		t.Fatal(err)
	}
	operationID := "iup-00112233445566778899aabb"
	random := "00112233445566778899aabbccddeeff"
	operationsDir := filepath.Join(base, "data", "operations", "image-uploads")
	if err := os.MkdirAll(operationsDir, 0o700); err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"version": 1, "operation_id": operationID, "storage_source_id": source.ID,
		"temp_relative_path":  "images/.omnistore-upload-0011223344556677.tmp",
		"final_relative_path": "images/" + random + ".png", "image_id": "img_" + random,
		"owner_type": models.ImageOwnerAnonymous, "original_filename": "pending.png",
		"public_url": "http://store.test/i/img_" + random + ".png",
		"size":       1, "mime_type": "image/png", "width": 1, "height": 1, "ext": "png",
		"created_at": time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(operationsDir, operationID+".json"), payload, 0o600); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/sources/"+source.Key, nil)
	req.SetPathValue("key", source.Key)
	recorder := httptest.NewRecorder()
	server.handleAdminDeleteSource(recorder, req)
	assertErrorResponse(t, recorder, http.StatusConflict, CodeConflict)
	if _, err := server.sources.Get(source.Key); err != nil {
		t.Fatalf("source with pending image upload was deleted: %v", err)
	}
}

func TestHandleAdminDeleteSourceRejectsPendingFileUploadRecovery(t *testing.T) {
	server, _, base := newSourceCreateHandlerServer(t)
	root := filepath.Join(base, "source-delete-file-upload")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := server.sources.Create(sources.CreateInput{Name: "pending-file-source", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	operationID := "upl-00112233445566778899aabb"
	operationsDir := filepath.Join(base, "data", "operations", "file-uploads")
	if err := os.MkdirAll(operationsDir, 0o700); err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"version": 1, "operation_id": operationID, "storage_source_id": source.ID,
		"temp_relative_path":  ".omnistore-upload-0011223344556677.tmp",
		"final_relative_path": "pending.txt", "replaced_existing": false,
		"size": 1, "content_sha256": strings.Repeat("0", 64), "mtime_unix_nano": time.Now().UnixNano(),
		"owner_type": models.FileOwnerUnowned, "created_at": time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(operationsDir, operationID+".json"), payload, 0o600); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/sources/"+source.Key, nil)
	req.SetPathValue("key", source.Key)
	recorder := httptest.NewRecorder()
	server.handleAdminDeleteSource(recorder, req)
	assertErrorResponse(t, recorder, http.StatusConflict, CodeConflict)
	if _, err := server.sources.Get(source.Key); err != nil {
		t.Fatalf("source with pending file upload was deleted: %v", err)
	}
}

func TestHandleAdminDeleteSourceRejectsPendingMultipartCompletion(t *testing.T) {
	server, conn, base := newSourceCreateHandlerServer(t)
	root := filepath.Join(base, "source-delete-multipart-completion")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := server.sources.Create(sources.CreateInput{Name: "pending-multipart-source", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	server.s3Multipart = s3api.NewMultipartStore(conn, filepath.Join(base, "data"), server.files, 10)
	uploadID := "mpu_" + strings.Repeat("1", 48)
	operationsDir := filepath.Join(base, "data", "operations", "s3-multipart-completions")
	if err := os.MkdirAll(operationsDir, 0o700); err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"version": 1, "upload_id": uploadID, "owner_user_id": 1, "storage_source_id": source.ID,
		"object_key": "pending.bin", "etag": `"` + strings.Repeat("0", 32) + `-1"`,
		"size": 1, "content_sha256": strings.Repeat("0", 64), "created_at": time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(operationsDir, uploadID+".json"), payload, 0o600); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/sources/"+source.Key, nil)
	req.SetPathValue("key", source.Key)
	recorder := httptest.NewRecorder()
	server.handleAdminDeleteSource(recorder, req)
	assertErrorResponse(t, recorder, http.StatusConflict, CodeConflict)
	if _, err := server.sources.Get(source.Key); err != nil {
		t.Fatalf("source with pending Multipart completion was deleted: %v", err)
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
