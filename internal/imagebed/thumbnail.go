package imagebed

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	stddraw "image/draw"
	"image/jpeg"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	xdraw "golang.org/x/image/draw"
)

const (
	ThumbnailMaxEdge        = 480
	maxThumbnailSourcePixel = 40_000_000
	thumbnailCacheVersion   = "v1"
	thumbnailTouchInterval  = 24 * time.Hour
)

// OpenThumbnail 返回按需生成的 JPEG 缩略图。
// 缓存键包含原图 size、modTime、输出规格和实现版本，原图变化后不会命中旧缓存。
func (s *Service) OpenThumbnail(ctx context.Context, imageID string) (*os.File, os.FileInfo, string, error) {
	img, err := s.Get(imageID)
	if err != nil {
		return nil, nil, "", err
	}
	src, err := s.sources.GetByID(img.StorageSourceID)
	if err != nil || src.IsDisabled {
		return nil, nil, "", ErrNotFound
	}

	original, originalInfo, releaseOriginal, err := s.files.OpenForRead(src, img.RelativePath)
	if err != nil {
		return nil, nil, "", ErrNotFound
	}
	defer releaseOriginal()
	defer original.Close()

	fingerprint := thumbnailFingerprint(img.StorageSourceID, img.RelativePath, imageID, originalInfo)
	cacheDir := filepath.Join(s.thumbnailCache, thumbnailShard(imageID))
	cachePath := filepath.Join(cacheDir, fmt.Sprintf("%s-%d-%s.jpg", imageID, ThumbnailMaxEdge, fingerprint))
	etag := `"` + fingerprint + `"`

	releaseGeneration := s.thumbnailLocks.Lock(cachePath)
	defer releaseGeneration()
	if cached, info, err := openCachedThumbnail(cachePath); err == nil {
		return cached, info, etag, nil
	}

	select {
	case s.thumbnailSlot <- struct{}{}:
		defer func() { <-s.thumbnailSlot }()
	case <-ctx.Done():
		return nil, nil, "", ctx.Err()
	}

	if err := generateThumbnail(original, cacheDir, cachePath); err != nil {
		return nil, nil, "", err
	}
	s.removeStaleThumbnailVariants(cacheDir, imageID, cachePath)
	cached, info, err := openCachedThumbnail(cachePath)
	if err != nil {
		return nil, nil, "", err
	}
	return cached, info, etag, nil
}

func thumbnailFingerprint(storageSourceID int64, relativePath, imageID string, info os.FileInfo) string {
	raw := fmt.Sprintf("%s:%d:%d:%s:%s:%d:%d", thumbnailCacheVersion, ThumbnailMaxEdge,
		storageSourceID, relativePath, imageID, info.Size(), info.ModTime().UnixNano())
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:12])
}

func thumbnailShard(imageID string) string {
	sum := sha256.Sum256([]byte(imageID))
	return hex.EncodeToString(sum[:1])
}

func openCachedThumbnail(cachePath string) (*os.File, os.FileInfo, error) {
	f, err := os.Open(cachePath)
	if err != nil {
		return nil, nil, err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, nil, err
	}
	if time.Since(info.ModTime()) > thumbnailTouchInterval {
		now := time.Now()
		if os.Chtimes(cachePath, now, now) == nil {
			info, _ = f.Stat()
		}
	}
	return f, info, nil
}

func generateThumbnail(original *os.File, cacheDir, cachePath string) error {
	config, _, err := image.DecodeConfig(original)
	if err != nil || config.Width <= 0 || config.Height <= 0 ||
		int64(config.Width)*int64(config.Height) > maxThumbnailSourcePixel {
		return ErrUnsupportedFormat
	}
	if _, err := original.Seek(0, 0); err != nil {
		return err
	}
	source, _, err := image.Decode(original)
	if err != nil {
		return ErrUnsupportedFormat
	}
	width, height := thumbnailDimensions(source.Bounds().Dx(), source.Bounds().Dy())
	resized := image.NewRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(resized, resized.Bounds(), source, source.Bounds(), xdraw.Src, nil)

	// JPEG 不支持透明通道；使用白色背景合成，避免透明 PNG/GIF 出现黑底。
	flattened := image.NewRGBA(resized.Bounds())
	stddraw.Draw(flattened, flattened.Bounds(), &image.Uniform{C: color.White}, image.Point{}, stddraw.Src)
	stddraw.Draw(flattened, flattened.Bounds(), resized, image.Point{}, stddraw.Over)

	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return fmt.Errorf("创建缩略图缓存目录失败: %w", err)
	}
	tmp, err := os.CreateTemp(cacheDir, ".omnistore-thumbnail-*.tmp")
	if err != nil {
		return fmt.Errorf("创建缩略图临时文件失败: %w", err)
	}
	tmpPath := tmp.Name()
	cleanup := func() {
		tmp.Close()
		os.Remove(tmpPath)
	}
	if err := jpeg.Encode(tmp, flattened, &jpeg.Options{Quality: 82}); err != nil {
		cleanup()
		return fmt.Errorf("编码缩略图失败: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return fmt.Errorf("写入缩略图缓存失败: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, cachePath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("提交缩略图缓存失败: %w", err)
	}
	return nil
}

func thumbnailDimensions(width, height int) (int, int) {
	if width <= ThumbnailMaxEdge && height <= ThumbnailMaxEdge {
		return width, height
	}
	if width >= height {
		scaledHeight := height * ThumbnailMaxEdge / width
		if scaledHeight < 1 {
			scaledHeight = 1
		}
		return ThumbnailMaxEdge, scaledHeight
	}
	scaledWidth := width * ThumbnailMaxEdge / height
	if scaledWidth < 1 {
		scaledWidth = 1
	}
	return scaledWidth, ThumbnailMaxEdge
}

func (s *Service) removeStaleThumbnailVariants(cacheDir, imageID, keepPath string) {
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return
	}
	prefix := imageID + "-"
	for _, entry := range entries {
		candidate := filepath.Join(cacheDir, entry.Name())
		if !entry.IsDir() && candidate != keepPath && strings.HasPrefix(entry.Name(), prefix) && strings.HasSuffix(entry.Name(), ".jpg") {
			_ = os.Remove(candidate)
		}
	}
}

func (s *Service) removeThumbnailFiles(imageID string) {
	cacheDir := filepath.Join(s.thumbnailCache, thumbnailShard(imageID))
	s.removeStaleThumbnailVariants(cacheDir, imageID, "")
}

// CleanupThumbnailCache 删除超过 maxAge 未访问的缓存文件。
func (s *Service) CleanupThumbnailCache(maxAge time.Duration) (int, error) {
	if maxAge <= 0 {
		return 0, fmt.Errorf("缩略图缓存有效期必须大于 0")
	}
	cutoff := time.Now().Add(-maxAge)
	removed := 0
	err := filepath.WalkDir(s.thumbnailCache, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.ModTime().Before(cutoff) {
			if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
				return err
			}
			removed++
		}
		return nil
	})
	return removed, err
}
