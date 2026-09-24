package files

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"time"

	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

// ArchivePackage 是待发送并在响应结束后清理的临时下载包。
type ArchivePackage struct {
	Path     string
	Filename string
	Size     int64
}

// CreateArchive 将同一存储源中的文件和目录打包为 ZIP。
// 调用方负责在使用完成后删除返回的临时文件。
func (s *Service) CreateArchive(src *models.StorageSource, relInputs []string) (*ArchivePackage, error) {
	if len(relInputs) == 0 || len(relInputs) > 100 {
		return nil, fmt.Errorf("%w: 请选择 1 到 100 个条目", ErrInvalid)
	}

	type archiveRoot struct {
		rel string
		abs string
	}
	roots := make([]archiveRoot, 0, len(relInputs))
	seenPaths := make(map[string]struct{}, len(relInputs))
	seenNames := make(map[string]struct{}, len(relInputs))
	lockKeys := make([]string, 0, len(relInputs))
	for _, input := range relInputs {
		rel, abs, err := s.prepare(src, input)
		if err != nil {
			return nil, err
		}
		if rel == "" {
			return nil, fmt.Errorf("%w: 不能打包存储源根目录", ErrInvalid)
		}
		if _, exists := seenPaths[rel]; exists {
			continue
		}
		name := path.Base(rel)
		if _, exists := seenNames[name]; exists {
			return nil, fmt.Errorf("%w: 选中条目存在同名项 %s", ErrInvalid, name)
		}
		seenPaths[rel] = struct{}{}
		seenNames[name] = struct{}{}
		roots = append(roots, archiveRoot{rel: rel, abs: abs})
		lockKeys = append(lockKeys, locks.Key(src.Key, rel))
	}
	if len(roots) == 0 {
		return nil, fmt.Errorf("%w: 未选择有效条目", ErrInvalid)
	}

	// 固定顺序既保证归档可预测，也避免多路径锁顺序随请求变化。
	sort.Slice(roots, func(i, j int) bool { return roots[i].rel < roots[j].rel })
	unlock := s.locks.RLockMany(lockKeys...)
	defer unlock()

	matcher, err := s.sources.Matcher(src.ID)
	if err != nil {
		return nil, err
	}
	tmpDir := filepath.Join(s.sources.DataDir(), "tmp")
	if err := os.MkdirAll(tmpDir, 0o700); err != nil {
		return nil, fmt.Errorf("创建临时目录失败: %w", err)
	}
	output, err := os.CreateTemp(tmpDir, "omnistore-download-*.zip")
	if err != nil {
		return nil, fmt.Errorf("创建下载包失败: %w", err)
	}
	outputPath := output.Name()
	cleanup := true
	defer func() {
		_ = output.Close()
		if cleanup {
			_ = os.Remove(outputPath)
		}
	}()

	zw := zip.NewWriter(output)
	for _, root := range roots {
		if err := addArchiveRoot(zw, root.abs, root.rel, matcher); err != nil {
			_ = zw.Close()
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("完成下载包失败: %w", err)
	}
	if err := output.Close(); err != nil {
		return nil, fmt.Errorf("保存下载包失败: %w", err)
	}
	info, err := os.Stat(outputPath)
	if err != nil {
		return nil, err
	}
	cleanup = false
	return &ArchivePackage{
		Path: outputPath, Filename: "omnistore-download-" + time.Now().UTC().Format("20060102T150405Z") + ".zip", Size: info.Size(),
	}, nil
}

func addArchiveRoot(zw *zip.Writer, absoluteRoot, relativeRoot string, matcher *security.ExcludeMatcher) error {
	rootName := path.Base(relativeRoot)
	return filepath.WalkDir(absoluteRoot, func(absolutePath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return ErrNotFound
			}
			return walkErr
		}
		relFromRoot, err := filepath.Rel(absoluteRoot, absolutePath)
		if err != nil {
			return err
		}
		sourceRel := relativeRoot
		archiveName := rootName
		if relFromRoot != "." {
			cleanPart := filepath.ToSlash(relFromRoot)
			sourceRel = path.Join(relativeRoot, cleanPart)
			archiveName = path.Join(rootName, cleanPart)
		}
		if sourceRel != relativeRoot && (matcher.Match(sourceRel) || security.IsReservedName(entry.Name())) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = archiveName
		if info.IsDir() {
			header.Name += "/"
			header.Method = zip.Store
			_, err = zw.CreateHeader(header)
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		header.Method = zip.Deflate
		writer, err := zw.CreateHeader(header)
		if err != nil {
			return err
		}
		file, err := os.Open(absolutePath)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(writer, file)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}
