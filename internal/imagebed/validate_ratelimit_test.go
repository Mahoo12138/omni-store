package imagebed

import (
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestValidateImageFileUsesDetectedFormat(t *testing.T) {
	tests := []struct {
		name  string
		ext   string
		mime  string
		write func(*os.File) error
	}{
		{name: "png", ext: "png", mime: "image/png", write: func(file *os.File) error {
			return png.Encode(file, testImage(3, 2))
		}},
		{name: "jpeg ignores filename extension", ext: "jpg", mime: "image/jpeg", write: func(file *os.File) error {
			return jpeg.Encode(file, testImage(4, 3), nil)
		}},
		{name: "gif", ext: "gif", mime: "image/gif", write: func(file *os.File) error {
			return gif.Encode(file, testImage(5, 4), nil)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "misleading.bin")
			file, err := os.Create(path)
			if err != nil {
				t.Fatal(err)
			}
			if err := tt.write(file); err != nil {
				_ = file.Close()
				t.Fatal(err)
			}
			if err := file.Close(); err != nil {
				t.Fatal(err)
			}
			info, err := ValidateImageFile(path)
			if err != nil || info.Ext != tt.ext || info.MimeType != tt.mime || info.Width == 0 || info.Height == 0 {
				t.Fatalf("ValidateImageFile()=%+v, %v", info, err)
			}
		})
	}

	invalid := filepath.Join(t.TempDir(), "fake.jpg")
	if err := os.WriteFile(invalid, []byte("not an image"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateImageFile(invalid); !errors.Is(err, ErrUnsupportedFormat) {
		t.Fatalf("invalid image error=%v", err)
	}
	if _, err := ValidateImageFile(filepath.Join(t.TempDir(), "missing.png")); err == nil || errors.Is(err, ErrUnsupportedFormat) {
		t.Fatalf("missing file error=%v", err)
	}
}

func TestRateLimiterEnforcesPerIPWindowAndConcurrency(t *testing.T) {
	unlimited := NewRateLimiter(0)
	for range 100 {
		if !unlimited.Allow("198.51.100.1") {
			t.Fatal("unlimited limiter rejected a request")
		}
	}

	limiter := NewRateLimiter(2)
	if !limiter.Allow("198.51.100.2") || !limiter.Allow("198.51.100.2") || limiter.Allow("198.51.100.2") {
		t.Fatal("per-IP limit was not enforced")
	}
	if !limiter.Allow("198.51.100.3") {
		t.Fatal("one IP consumed another IP's allowance")
	}
	limiter.mu.Lock()
	limiter.counts["198.51.100.2"] = []time.Time{time.Now().Add(-2 * time.Hour)}
	limiter.mu.Unlock()
	if !limiter.Allow("198.51.100.2") {
		t.Fatal("expired entries were not discarded")
	}

	concurrent := NewRateLimiter(10)
	var accepted atomic.Int64
	var group sync.WaitGroup
	for range 50 {
		group.Add(1)
		go func() {
			defer group.Done()
			if concurrent.Allow("203.0.113.9") {
				accepted.Add(1)
			}
		}()
	}
	group.Wait()
	if accepted.Load() != 10 {
		t.Fatalf("concurrent accepted=%d want=10", accepted.Load())
	}
}

func testImage(width, height int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := range height {
		for x := range width {
			img.SetRGBA(x, y, color.RGBA{R: 40, G: 110, B: 210, A: 255})
		}
	}
	return img
}
