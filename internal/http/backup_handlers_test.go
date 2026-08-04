package httpserver

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/users"
)

func TestHandleAdminExportSystemConfig(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	server := &Server{
		cfg:   cfg,
		db:    conn,
		audit: audit.New(conn, true, 100, logger),
		proxy: security.NewProxyResolver([]string{"127.0.0.1"}),
	}
	admin, err := users.NewService(conn).Create("admin", "Test Admin", "test-password", models.RoleSuperAdmin)
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/system/config-export", nil)
	req = req.WithContext(context.WithValue(req.Context(), currentUserKey, admin))
	recorder := httptest.NewRecorder()

	server.handleAdminExportSystemConfig(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/zip" {
		t.Fatalf("unexpected content type: %s", got)
	}
	if got := recorder.Header().Get("Content-Disposition"); !strings.Contains(got, "omnistore-system-config-") {
		t.Fatalf("unexpected content disposition: %s", got)
	}
	if body := recorder.Body.Bytes(); len(body) < 2 || body[0] != 'P' || body[1] != 'K' {
		t.Fatal("response is not a zip archive")
	}
	var count int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM audit_logs WHERE action = 'export_system_config' AND status = 'success'`).Scan(&count); err != nil {
		t.Fatalf("query audit: %v", err)
	}
	if count != 1 {
		t.Fatalf("export audit not recorded: %d", count)
	}
	leftovers, err := filepath.Glob(filepath.Join(dataDir, "tmp", "omnistore-config-*.zip"))
	if err != nil {
		t.Fatalf("scan temporary exports: %v", err)
	}
	for _, path := range leftovers {
		if _, err := os.Stat(path); err == nil {
			t.Fatalf("temporary export was not removed: %s", path)
		}
	}
}
