package files

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var uploadTempName = regexp.MustCompile(`^\.omnistore-upload-[0-9a-f]{16}\.tmp$`)

// CleanupResult 是一次上传残留清理的结果。
type CleanupResult struct {
	ScannedSources int
	RemovedFiles   int
}

// CleanupStaleUploads 清理所有存储源中超过 maxAge 的 OmniStore 上传临时文件。
// 只匹配服务自身生成的严格文件名，不跟随符号链接，也不删除目录。
func (s *Service) CleanupStaleUploads(maxAge time.Duration) (CleanupResult, error) {
	if maxAge <= 0 {
		return CleanupResult{}, fmt.Errorf("临时文件保留时长必须大于 0")
	}
	sourcesList, err := s.sources.List()
	if err != nil {
		return CleanupResult{}, err
	}

	result := CleanupResult{}
	cutoff := time.Now().UTC().Add(-maxAge)
	var cleanupErrors []error
	for _, source := range sourcesList {
		result.ScannedSources++
		removed, err := cleanupStaleUploadsInRoot(source.RootPath, cutoff)
		result.RemovedFiles += removed
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("存储源 %s: %w", source.SourceID, err))
		}
	}
	return result, errors.Join(cleanupErrors...)
}

func cleanupStaleUploadsInRoot(root string, cutoff time.Time) (int, error) {
	removed := 0
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 || !uploadTempName.MatchString(entry.Name()) {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() || info.ModTime().IsZero() || !info.ModTime().Before(cutoff) {
			return nil
		}
		if err := os.Remove(path); err != nil {
			return err
		}
		removed++
		return nil
	})
	return removed, err
}
