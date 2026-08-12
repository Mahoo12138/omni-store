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
var uploadBackupName = regexp.MustCompile(`^\.omnistore-upload-[0-9a-f]{24}\.backup$`)
var copyStagingName = regexp.MustCompile(`^\.omnistore-copy-[0-9a-f]{24}\.staging$`)

func isInternalName(name string) bool {
	return uploadTempName.MatchString(name) || uploadBackupName.MatchString(name) || copyStagingName.MatchString(name)
}

// CleanupResult 是一次上传残留清理的结果。
type CleanupResult struct {
	ScannedSources int
	RemovedFiles   int
}

// CleanupOrphanedUploadTemps 清理启动恢复完成后仍未被 journal 接管的上传临时文件。
// 该方法只能在 HTTP/S3 开始监听前调用；此时不存在进行中的上传，所以所有严格
// 保留名的普通文件都来自进程在写入持久日志前被中断的操作。
func (s *Service) CleanupOrphanedUploadTemps() (CleanupResult, error) {
	sourcesList, err := s.sources.List()
	if err != nil {
		return CleanupResult{}, err
	}

	result := CleanupResult{}
	var cleanupErrors []error
	for _, source := range sourcesList {
		result.ScannedSources++
		removed, err := cleanupOrphanedUploadTempsInRoot(source.RootPath)
		result.RemovedFiles += removed
		if err != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("存储源 %s: %w", source.Name, err))
		}
	}
	return result, errors.Join(cleanupErrors...)
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
			cleanupErrors = append(cleanupErrors, fmt.Errorf("存储源 %s: %w", source.Name, err))
		}
	}
	return result, errors.Join(cleanupErrors...)
}

func cleanupStaleUploadsInRoot(root string, cutoff time.Time) (int, error) {
	return cleanupUploadTempsInRoot(root, func(info os.FileInfo) bool {
		return !info.ModTime().IsZero() && info.ModTime().Before(cutoff)
	})
}

func cleanupOrphanedUploadTempsInRoot(root string) (int, error) {
	return cleanupUploadTempsInRoot(root, func(os.FileInfo) bool { return true })
}

func cleanupUploadTempsInRoot(root string, shouldRemove func(os.FileInfo) bool) (int, error) {
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
		if !info.Mode().IsRegular() || !shouldRemove(info) {
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
