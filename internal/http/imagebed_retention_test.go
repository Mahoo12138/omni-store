package httpserver

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

func newImageBedRetentionServer(t *testing.T) (http.Handler, *Server, *http.Cookie, string, *models.StorageSource, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	cfg.Server.PublicURL = "https://store.example.test"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	httpServer, app := New(cfg, conn, logger)

	admin, err := app.users.Create("retention-admin", "Retention Admin", "admin-password", models.RoleSuperAdmin)
	if err != nil {
		t.Fatal(err)
	}
	sessionID, csrf, err := app.sessions.Create(admin.ID, "retention-test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	cookie := &http.Cookie{Name: SessionCookieName(), Value: sessionID}

	sourceRoot := filepath.Join(base, "source")
	if err := os.Mkdir(sourceRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := app.sources.Create(sources.CreateInput{Name: "retention-source", RootPath: sourceRoot})
	if err != nil {
		t.Fatal(err)
	}
	return httpServer.Handler, app, cookie, csrf, source, sourceRoot
}

func onePixelPNGBytes(t *testing.T) []byte {
	t.Helper()
	var buffer bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.SetRGBA(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

// 保留策略 API、上传前展示与过期服务行为（IMG-04）。
func TestImageBedRetentionAPIAndExpiryServing(t *testing.T) {
	handler, server, cookie, csrf, source, sourceRoot := newImageBedRetentionServer(t)
	enabled := true
	if _, err := server.capabilities.UpdateBinding("image_bed", capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &source.Key,
	}); err != nil {
		t.Fatal(err)
	}

	// 未配置时保留策略为 0/0。
	get := serveTestRequest(t, handler, http.MethodGet, "/api/v1/admin/image-bed/retention", "", cookie, "")
	if get.Code != http.StatusOK || !strings.Contains(get.Body.String(), `"user_retention_days":0`) {
		t.Fatalf("initial retention status=%d body=%s", get.Code, get.Body.String())
	}

	put := serveTestRequest(t, handler, http.MethodPut, "/api/v1/admin/image-bed/retention",
		`{"user_retention_days":30,"anonymous_retention_days":7}`, cookie, csrf)
	if put.Code != http.StatusOK || !strings.Contains(put.Body.String(), `"anonymous_retention_days":7`) {
		t.Fatalf("set retention status=%d body=%s", put.Code, put.Body.String())
	}
	reget := serveTestRequest(t, handler, http.MethodGet, "/api/v1/admin/image-bed/retention", "", cookie, "")
	if !strings.Contains(reget.Body.String(), `"user_retention_days":30`) {
		t.Fatalf("retention after update body=%s", reget.Body.String())
	}

	// 匿名状态在上传前暴露保留策略。
	status := serveTestRequest(t, handler, http.MethodGet, "/api/v1/image-bed/anonymous-status", "", nil, "")
	if status.Code != http.StatusOK || !strings.Contains(status.Body.String(), `"anonymous_retention_days":7`) {
		t.Fatalf("anonymous status status=%d body=%s", status.Code, status.Body.String())
	}

	// 过期图片：/i/ 返回真实 404。
	expiredAt := time.Now().UTC().Add(-time.Hour)
	if _, err := server.db.Exec(`INSERT INTO images
  (image_id, owner_type, storage_source_id, relative_path, public_url, size, mime_type, width, height, ext, expires_at, created_at)
  VALUES ('img_expiredhttp000001', 'anonymous', ?, ?, ?, 10, 'image/png', 2, 2, 'png', ?, datetime('now'))`,
		source.ID, ".omnistore/image-bed/anonymous/2026/09/gone.png",
		"https://store.example.test/i/img_expiredhttp000001.png", expiredAt); err != nil {
		t.Fatal(err)
	}
	expiredResp := serveTestRequest(t, handler, http.MethodGet, "/i/img_expiredhttp000001.png", "", nil, "")
	if expiredResp.Code != http.StatusNotFound {
		t.Fatalf("expired image status=%d, want 404", expiredResp.Code)
	}

	// 存活且有失效时间的图片：缓存不超过剩余有效时间，也不是 immutable。
	freshRel := ".omnistore/image-bed/anonymous/2026/09/fresh.png"
	if err := os.MkdirAll(filepath.Join(sourceRoot, filepath.FromSlash(filepath.Dir(freshRel))), 0o755); err != nil {
		t.Fatal(err)
	}
	body := onePixelPNGBytes(t)
	if err := os.WriteFile(filepath.Join(sourceRoot, filepath.FromSlash(freshRel)), body, 0o600); err != nil {
		t.Fatal(err)
	}
	freshAt := time.Now().UTC().Add(2 * time.Hour)
	if _, err := server.db.Exec(`INSERT INTO images
  (image_id, owner_type, storage_source_id, relative_path, public_url, size, mime_type, width, height, ext, expires_at, created_at)
  VALUES ('img_freshhttp0000001', 'anonymous', ?, ?, ?, ?, 'image/png', 2, 2, 'png', ?, datetime('now'))`,
		source.ID, freshRel, "https://store.example.test/i/img_freshhttp0000001.png", len(body), freshAt); err != nil {
		t.Fatal(err)
	}
	freshResp := serveTestRequest(t, handler, http.MethodGet, "/i/img_freshhttp0000001.png", "", nil, "")
	if freshResp.Code != http.StatusOK {
		t.Fatalf("fresh image status=%d body=%s", freshResp.Code, freshResp.Body.String())
	}
	cacheControl := freshResp.Header().Get("Cache-Control")
	if strings.Contains(cacheControl, "immutable") || !strings.Contains(cacheControl, "max-age=") {
		t.Fatalf("expiring image cache-control=%q", cacheControl)
	}
	maxAge, err := strconv.Atoi(strings.TrimPrefix(cacheControl, "public, max-age="))
	if err != nil || maxAge <= 0 || maxAge > 3600 {
		t.Fatalf("max-age=%q err=%v, want within remaining TTL", cacheControl, err)
	}
}
