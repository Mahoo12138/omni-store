package httpserver

import (
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/imagebed"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestThumbnailHTTPResponseAndConditionalCache(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer conn.Close()
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	cfg.Server.PublicURL = "https://store.example.test"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	server, app := New(cfg, conn, logger)

	sourceRoot := filepath.Join(base, "source")
	if err := os.Mkdir(sourceRoot, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	source, err := app.sources.Create(sources.CreateInput{Name: "thumbs", RootPath: sourceRoot})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	originalRel := "images/http.png"
	originalPath := filepath.Join(sourceRoot, filepath.FromSlash(originalRel))
	if err := os.MkdirAll(filepath.Dir(originalPath), 0o755); err != nil {
		t.Fatalf("create image directory: %v", err)
	}
	writeHTTPTestPNG(t, originalPath, 800, 400)
	info, err := os.Stat(originalPath)
	if err != nil {
		t.Fatalf("stat image: %v", err)
	}
	imageID := "img_http_thumbnail"
	if _, err := conn.Exec(`INSERT INTO images
	  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES (?, 'anonymous', NULL, ?, ?, 'http.png', ?, ?, 'image/png', 800, 400, 'png', ?)`,
		imageID, source.ID, originalRel, "https://store.example.test/i/"+imageID+".png", info.Size(), time.Now().UTC()); err != nil {
		t.Fatalf("insert image: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/t/"+imageID+".jpg", nil)
	response := httptest.NewRecorder()
	server.Handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("thumbnail status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Content-Type") != "image/jpeg" || response.Header().Get("ETag") == "" ||
		!strings.Contains(response.Header().Get("Cache-Control"), "max-age=3600") {
		t.Fatalf("unexpected headers: %v", response.Header())
	}
	decoded, err := jpeg.Decode(response.Body)
	if err != nil {
		t.Fatalf("decode HTTP thumbnail: %v", err)
	}
	if decoded.Bounds().Dx() != imagebed.ThumbnailMaxEdge || decoded.Bounds().Dy() != imagebed.ThumbnailMaxEdge/2 {
		t.Fatalf("unexpected dimensions: %v", decoded.Bounds())
	}

	conditional := httptest.NewRequest(http.MethodGet, "/t/"+imageID+".jpg", nil)
	conditional.Header.Set("If-None-Match", response.Header().Get("ETag"))
	conditionalResponse := httptest.NewRecorder()
	server.Handler.ServeHTTP(conditionalResponse, conditional)
	if conditionalResponse.Code != http.StatusNotModified {
		t.Fatalf("conditional thumbnail status=%d body=%s", conditionalResponse.Code, conditionalResponse.Body.String())
	}

	missing := httptest.NewRequest(http.MethodGet, "/t/img_missing.jpg", nil)
	missingResponse := httptest.NewRecorder()
	server.Handler.ServeHTTP(missingResponse, missing)
	if missingResponse.Code != http.StatusNotFound {
		t.Fatalf("missing thumbnail status=%d", missingResponse.Code)
	}
}

func writeHTTPTestPNG(t *testing.T, path string, width, height int) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 40, G: 110, B: 210, A: 255})
		}
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create image: %v", err)
	}
	if err := png.Encode(f, img); err != nil {
		f.Close()
		t.Fatalf("encode image: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close image: %v", err)
	}
}
