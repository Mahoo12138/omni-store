package imagebed

import (
	"context"
	"database/sql"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/sources"
)

type thumbnailTestEnv struct {
	service      *Service
	conn         *sql.DB
	sourceRoot   string
	originalPath string
	imageID      string
}

func newThumbnailTestEnv(t *testing.T) *thumbnailTestEnv {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	sourceRoot := filepath.Join(base, "source")
	if err := os.Mkdir(sourceRoot, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	sourceService := sources.NewService(conn, dataDir)
	source, err := sourceService.Create(sources.CreateInput{SourceID: "images", Name: "Images", RootPath: sourceRoot})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	if _, err := conn.Exec(`UPDATE storage_sources SET image_bed_enabled = 1 WHERE source_id = ?`, source.SourceID); err != nil {
		t.Fatalf("enable image bed: %v", err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	service, err := NewService(conn, "/images", "https://store.example.test",
		filepath.Join(dataDir, "cache", "thumbnails"), sourceService, fileService)
	if err != nil {
		t.Fatalf("create image bed service: %v", err)
	}
	originalRel := "images/test/original.png"
	originalPath := filepath.Join(sourceRoot, filepath.FromSlash(originalRel))
	if err := os.MkdirAll(filepath.Dir(originalPath), 0o755); err != nil {
		t.Fatalf("create original directory: %v", err)
	}
	writePNG(t, originalPath, 960, 480, color.NRGBA{R: 220, G: 20, B: 60, A: 255})
	info, err := os.Stat(originalPath)
	if err != nil {
		t.Fatalf("stat original: %v", err)
	}
	imageID := "img_thumbnail_test"
	if _, err := conn.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES (?, 'anonymous', NULL, ?, ?, 'original.png', ?, ?, 'image/png', 960, 480, 'png', ?)`,
		imageID, source.SourceID, originalRel, "https://store.example.test/i/"+imageID+".png", info.Size(), time.Now().UTC()); err != nil {
		t.Fatalf("insert image: %v", err)
	}
	return &thumbnailTestEnv{service: service, conn: conn, sourceRoot: sourceRoot, originalPath: originalPath, imageID: imageID}
}

func writePNG(t *testing.T, path string, width, height int, fill color.NRGBA) {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetNRGBA(x, y, fill)
		}
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create PNG: %v", err)
	}
	if err := png.Encode(f, img); err != nil {
		f.Close()
		t.Fatalf("encode PNG: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close PNG: %v", err)
	}
}

func openAndDecodeThumbnail(t *testing.T, service *Service, imageID string) (string, string, image.Image) {
	t.Helper()
	f, _, etag, err := service.OpenThumbnail(context.Background(), imageID)
	if err != nil {
		t.Fatalf("open thumbnail: %v", err)
	}
	name := f.Name()
	decoded, err := jpeg.Decode(f)
	if err != nil {
		f.Close()
		t.Fatalf("decode thumbnail: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close thumbnail: %v", err)
	}
	return name, etag, decoded
}

func TestThumbnailGenerationCacheAndInvalidation(t *testing.T) {
	env := newThumbnailTestEnv(t)
	firstPath, firstETag, first := openAndDecodeThumbnail(t, env.service, env.imageID)
	if first.Bounds().Dx() != ThumbnailMaxEdge || first.Bounds().Dy() != ThumbnailMaxEdge/2 {
		t.Fatalf("unexpected first dimensions: %v", first.Bounds())
	}
	secondPath, secondETag, _ := openAndDecodeThumbnail(t, env.service, env.imageID)
	if secondPath != firstPath || secondETag != firstETag {
		t.Fatalf("cache miss for unchanged original: first=%q/%q second=%q/%q", firstPath, firstETag, secondPath, secondETag)
	}

	writePNG(t, env.originalPath, 240, 720, color.NRGBA{B: 200, A: 255})
	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(env.originalPath, future, future); err != nil {
		t.Fatalf("change original mtime: %v", err)
	}
	thirdPath, thirdETag, third := openAndDecodeThumbnail(t, env.service, env.imageID)
	if thirdPath == firstPath || thirdETag == firstETag {
		t.Fatalf("changed original reused stale cache: path=%q etag=%q", thirdPath, thirdETag)
	}
	if third.Bounds().Dx() != 160 || third.Bounds().Dy() != ThumbnailMaxEdge {
		t.Fatalf("unexpected invalidated dimensions: %v", third.Bounds())
	}
	if _, err := os.Stat(firstPath); !os.IsNotExist(err) {
		t.Fatalf("stale cache variant was not removed: %v", err)
	}

	record, err := env.service.Get(env.imageID)
	if err != nil {
		t.Fatalf("get image record: %v", err)
	}
	if record.ThumbnailURL != "https://store.example.test/t/"+env.imageID+".jpg" {
		t.Fatalf("unexpected thumbnail URL: %q", record.ThumbnailURL)
	}
}

func TestConcurrentThumbnailRequestsShareValidCache(t *testing.T) {
	env := newThumbnailTestEnv(t)
	const workers = 8
	paths := make(chan string, workers)
	errs := make(chan error, workers)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f, _, _, err := env.service.OpenThumbnail(context.Background(), env.imageID)
			if err != nil {
				errs <- err
				return
			}
			paths <- f.Name()
			_ = f.Close()
		}()
	}
	wg.Wait()
	close(errs)
	close(paths)
	for err := range errs {
		t.Fatalf("concurrent thumbnail request failed: %v", err)
	}
	var expected string
	for path := range paths {
		if expected == "" {
			expected = path
		} else if path != expected {
			t.Fatalf("concurrent requests produced different cache files: %q != %q", path, expected)
		}
	}
}

func TestCleanupThumbnailCache(t *testing.T) {
	env := newThumbnailTestEnv(t)
	cachePath, _, _ := openAndDecodeThumbnail(t, env.service, env.imageID)
	old := time.Now().Add(-31 * 24 * time.Hour)
	if err := os.Chtimes(cachePath, old, old); err != nil {
		t.Fatalf("age cache: %v", err)
	}
	removed, err := env.service.CleanupThumbnailCache(30 * 24 * time.Hour)
	if err != nil || removed != 1 {
		t.Fatalf("cleanup result: removed=%d err=%v", removed, err)
	}
	if _, err := os.Stat(cachePath); !os.IsNotExist(err) {
		t.Fatalf("expired cache remains: %v", err)
	}
}
