package imagebed

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestAnonymousUploadRejectsQuotaOverflowAndCleansTempFile(t *testing.T) {
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
	source, err := sourceService.Create(sources.CreateInput{Name: "image quota", RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	enabled, quotaBytes := true, int64(16)
	source, err = sourceService.Update(source.Key, sources.UpdateInput{
		ImageBedEnabled: &enabled,
		QuotaBytes:      &quotaBytes,
	})
	if err != nil {
		t.Fatalf("configure source: %v", err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	service, err := NewService(conn, "images", "https://store.example.test", filepath.Join(dataDir, "cache"), sourceService, fileService)
	if err != nil {
		t.Fatalf("create image service: %v", err)
	}
	if err := service.SetAnonymousSettings(true, source.Key); err != nil {
		t.Fatalf("enable anonymous image bed: %v", err)
	}

	var body bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.SetRGBA(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&body, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	if _, err := service.UploadAnonymous("over-quota.png", &body); !errors.Is(err, files.ErrQuotaExceeded) {
		t.Fatalf("upload error=%v", err)
	}

	var regularFiles []string
	if err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr == nil && entry.Type().IsRegular() {
			regularFiles = append(regularFiles, path)
		}
		return walkErr
	}); err != nil {
		t.Fatalf("walk source: %v", err)
	}
	if len(regularFiles) != 0 {
		t.Fatalf("quota rejection left files: %v", regularFiles)
	}
}
