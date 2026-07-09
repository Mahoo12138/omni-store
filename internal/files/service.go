// Package files 集中实现真实文件系统操作（README §23 约束：
// handler 不直接操作文件系统，全部经过本包）。
// 每个操作都遵循统一链路：规范化路径 -> 排除规则 -> symlink 检查 -> 路径锁 -> 文件系统。
package files

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

var (
	// ErrNotFound 文件或目录不存在。
	ErrNotFound = errors.New("文件不存在")
	// ErrAlreadyExists 目标已存在（默认不覆盖，README §13.4/§13.6）。
	ErrAlreadyExists = errors.New("目标已存在")
	// ErrPathExcluded 路径命中排除规则。
	ErrPathExcluded = errors.New("路径不可访问")
	// ErrInvalid 非法参数。
	ErrInvalid = errors.New("非法路径或文件名")
	// ErrUnsupported 符号链接等不支持的条目。
	ErrUnsupported = errors.New("不支持的文件类型")
)

// 条目类型。
const (
	TypeDir         = "dir"
	TypeFile        = "file"
	TypeUnsupported = "unsupported" // symlink 等，私有网盘可见但不可操作（README §10.7）
)

// Entry 是列表返回的基础文件信息（README §13.3）。
type Entry struct {
	Name  string    `json:"name"`
	Type  string    `json:"type"`
	Size  int64     `json:"size"`
	MTime time.Time `json:"mtime"`
}

// Service 提供核心文件操作，REST、WebDAV、图床、公开网盘共用。
type Service struct {
	db      *sql.DB
	sources *sources.Service
	locks   *locks.Manager
}

// NewService 创建文件服务。
func NewService(db *sql.DB, srcSvc *sources.Service, lockMgr *locks.Manager) *Service {
	return &Service{db: db, sources: srcSvc, locks: lockMgr}
}

// Locks 暴露锁管理器（WebDAV 等入口共用）。
func (s *Service) Locks() *locks.Manager {
	return s.locks
}

// prepare 执行统一前置检查：规范化路径 -> 排除规则 -> symlink 检查。
// 返回规范化相对路径和绝对路径。
func (s *Service) prepare(src *models.StorageSource, relInput string) (relPath, absPath string, err error) {
	relPath, err = security.NormalizeRelPath(relInput)
	if err != nil {
		return "", "", fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	matcher, err := s.sources.Matcher(src.SourceID)
	if err != nil {
		return "", "", err
	}
	if matcher.MatchPrefix(relPath) {
		return "", "", ErrPathExcluded
	}
	absPath, err = security.ResolveInSource(src.RootPath, relPath)
	if err != nil {
		if errors.Is(err, security.ErrSymlink) {
			return "", "", ErrUnsupported
		}
		return "", "", fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	return relPath, absPath, nil
}

// --- 列表（README §13.8） ---

// ListOptions 是列表分页排序参数。
type ListOptions struct {
	Page     int
	PageSize int
	Sort     string // name | size | mtime | type
	Order    string // asc | desc
}

// ListResult 是列表结果。
type ListResult struct {
	Items    []Entry `json:"items"`
	Page     int     `json:"page"`
	PageSize int     `json:"page_size"`
	Total    int64   `json:"total"`
	HasNext  bool    `json:"has_next"`
}

// List 实时扫描目录并过滤、排序、分页。
// includeUnsupported 为 false 时隐藏 symlink（公开侧）。
func (s *Service) List(src *models.StorageSource, relInput string, opts ListOptions, includeUnsupported bool) (*ListResult, error) {
	relPath, absPath, err := s.prepare(src, relInput)
	if err != nil {
		return nil, err
	}

	if opts.Page < 1 {
		opts.Page = 1
	}
	if opts.PageSize < 1 {
		opts.PageSize = 100
	}
	if opts.PageSize > 500 {
		opts.PageSize = 500
	}

	unlock := s.locks.RLock(locks.Key(src.SourceID, relPath))
	defer unlock()

	dirents, err := os.ReadDir(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("读取目录失败: %w", err)
	}

	matcher, err := s.sources.Matcher(src.SourceID)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(dirents))
	for _, de := range dirents {
		name := de.Name()
		// 隐藏上传临时文件（README §14.5）。
		if strings.HasPrefix(name, ".omnistore-upload-") {
			continue
		}
		childRel := name
		if relPath != "" {
			childRel = relPath + "/" + name
		}
		if matcher.Match(childRel) {
			continue
		}

		info, err := de.Info()
		if err != nil {
			continue
		}
		e := Entry{Name: name, MTime: info.ModTime()}
		switch {
		case info.Mode()&os.ModeSymlink != 0:
			if !includeUnsupported {
				continue
			}
			e.Type = TypeUnsupported
		case de.IsDir():
			e.Type = TypeDir
		case info.Mode().IsRegular():
			e.Type = TypeFile
			e.Size = info.Size()
		default:
			if !includeUnsupported {
				continue
			}
			e.Type = TypeUnsupported
		}
		entries = append(entries, e)
	}

	sortEntries(entries, opts.Sort, opts.Order)

	total := int64(len(entries))
	start := (opts.Page - 1) * opts.PageSize
	end := start + opts.PageSize
	if start > len(entries) {
		start = len(entries)
	}
	if end > len(entries) {
		end = len(entries)
	}

	return &ListResult{
		Items:    entries[start:end],
		Page:     opts.Page,
		PageSize: opts.PageSize,
		Total:    total,
		HasNext:  int64(end) < total,
	}, nil
}

// sortEntries 排序：目录永远排在文件前（README §13.8），同键值内按名称升序。
func sortEntries(entries []Entry, sortKey, order string) {
	desc := order == "desc"
	rank := func(t string) int {
		switch t {
		case TypeDir:
			return 0
		case TypeFile:
			return 1
		default:
			return 2
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if ra, rb := rank(a.Type), rank(b.Type); ra != rb {
			return ra < rb
		}
		var less bool
		switch sortKey {
		case "size":
			if a.Size != b.Size {
				less = a.Size < b.Size
			} else {
				return strings.ToLower(a.Name) < strings.ToLower(b.Name)
			}
		case "mtime":
			if !a.MTime.Equal(b.MTime) {
				less = a.MTime.Before(b.MTime)
			} else {
				return strings.ToLower(a.Name) < strings.ToLower(b.Name)
			}
		default: // name / type
			la, lb := strings.ToLower(a.Name), strings.ToLower(b.Name)
			if la == lb {
				less = a.Name < b.Name
			} else {
				less = la < lb
			}
		}
		if desc {
			return !less
		}
		return less
	})
}

// --- 文件信息 ---

// Stat 返回单个文件/目录的基础信息。
func (s *Service) Stat(src *models.StorageSource, relInput string) (*Entry, error) {
	relPath, absPath, err := s.prepare(src, relInput)
	if err != nil {
		return nil, err
	}
	unlock := s.locks.RLock(locks.Key(src.SourceID, relPath))
	defer unlock()

	info, err := os.Lstat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	e := &Entry{Name: path.Base("/" + relPath), MTime: info.ModTime()}
	switch {
	case info.Mode()&os.ModeSymlink != 0:
		e.Type = TypeUnsupported
	case info.IsDir():
		e.Type = TypeDir
	case info.Mode().IsRegular():
		e.Type = TypeFile
		e.Size = info.Size()
	default:
		e.Type = TypeUnsupported
	}
	return e, nil
}

// --- 下载（README §13.9 流式 + Range） ---

// OpenForRead 打开文件用于流式下载。
// 调用方负责 Close 文件和调用 unlock；期间持有读锁。
func (s *Service) OpenForRead(src *models.StorageSource, relInput string) (*os.File, os.FileInfo, func(), error) {
	relPath, absPath, err := s.prepare(src, relInput)
	if err != nil {
		return nil, nil, nil, err
	}
	unlock := s.locks.RLock(locks.Key(src.SourceID, relPath))

	info, err := os.Lstat(absPath)
	if err != nil {
		unlock()
		if os.IsNotExist(err) {
			return nil, nil, nil, ErrNotFound
		}
		return nil, nil, nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		unlock()
		return nil, nil, nil, ErrUnsupported
	}
	if info.IsDir() {
		unlock()
		return nil, nil, nil, fmt.Errorf("%w: 不能下载目录", ErrInvalid)
	}

	f, err := os.Open(absPath)
	if err != nil {
		unlock()
		return nil, nil, nil, err
	}
	return f, info, unlock, nil
}

// --- 创建目录 ---

// Mkdir 在 parentRel 下创建名为 name 的目录。
func (s *Service) Mkdir(src *models.StorageSource, parentRel, name string) (string, error) {
	if err := security.ValidateFileName(name); err != nil {
		return "", fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	parent, err := security.NormalizeRelPath(parentRel)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	target := name
	if parent != "" {
		target = parent + "/" + name
	}

	relPath, absPath, err := s.prepare(src, target)
	if err != nil {
		return "", err
	}

	unlock := s.locks.Lock(locks.Key(src.SourceID, relPath))
	defer unlock()

	if _, err := os.Lstat(absPath); err == nil {
		return "", ErrAlreadyExists
	}
	if err := os.Mkdir(absPath, 0o755); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%w: 父目录不存在", ErrInvalid)
		}
		return "", fmt.Errorf("创建目录失败: %w", err)
	}
	return relPath, nil
}

// --- 上传（README §14：临时文件 + 原子重命名） ---

// Upload 上传文件到 dirRel 目录下的 filename。
// 数据先写同目录临时文件 .omnistore-upload-*.tmp，成功后原子重命名。
// overwrite 为 false 且目标存在时返回 ErrAlreadyExists。
func (s *Service) Upload(src *models.StorageSource, dirRel, filename string, body io.Reader, overwrite bool) (string, int64, error) {
	if err := security.ValidateFileName(filename); err != nil {
		return "", 0, fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	dir, err := security.NormalizeRelPath(dirRel)
	if err != nil {
		return "", 0, fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	target := filename
	if dir != "" {
		target = dir + "/" + filename
	}

	relPath, absPath, err := s.prepare(src, target)
	if err != nil {
		return "", 0, err
	}

	unlock := s.locks.Lock(locks.Key(src.SourceID, relPath))
	defer unlock()

	// 冲突检查（README §13.4）。
	if info, err := os.Lstat(absPath); err == nil {
		if info.IsDir() {
			return "", 0, fmt.Errorf("%w: 文件不能覆盖目录", ErrInvalid)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", 0, ErrUnsupported
		}
		if !overwrite {
			return "", 0, ErrAlreadyExists
		}
	}

	parentAbs := filepath.Dir(absPath)
	if info, err := os.Stat(parentAbs); err != nil || !info.IsDir() {
		return "", 0, fmt.Errorf("%w: 目标目录不存在", ErrInvalid)
	}

	written, err := writeViaTemp(parentAbs, absPath, body)
	if err != nil {
		return "", 0, err
	}
	return relPath, written, nil
}

// writeViaTemp 写同目录临时文件后原子重命名到目标（README §14.3/§14.4）。
func writeViaTemp(dirAbs, targetAbs string, body io.Reader) (int64, error) {
	tmpPath := filepath.Join(dirAbs, ".omnistore-upload-"+auth.NewRandomToken("", 8)+".tmp")
	tmp, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return 0, fmt.Errorf("创建临时文件失败: %w", err)
	}

	cleanup := func() {
		tmp.Close()
		os.Remove(tmpPath)
	}

	written, err := io.Copy(tmp, body)
	if err != nil {
		cleanup()
		return 0, fmt.Errorf("写入失败: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return 0, fmt.Errorf("落盘失败: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return 0, fmt.Errorf("关闭临时文件失败: %w", err)
	}

	if err := os.Rename(tmpPath, targetAbs); err != nil {
		// Windows 开发环境下 rename 不能覆盖已有文件，先删再改名。
		// 生产目标 Linux 上同目录 rename 原子替换。
		if rmErr := os.Remove(targetAbs); rmErr == nil {
			err = os.Rename(tmpPath, targetAbs)
		}
		if err != nil {
			os.Remove(tmpPath)
			return 0, fmt.Errorf("重命名临时文件失败: %w", err)
		}
	}
	return written, nil
}

// --- 删除（README §13.5 永久删除） ---

// Delete 永久删除文件或目录（含目录内全部内容），并同步清理图床记录。
func (s *Service) Delete(src *models.StorageSource, relInput string) error {
	relPath, absPath, err := s.prepare(src, relInput)
	if err != nil {
		return err
	}
	if relPath == "" {
		return fmt.Errorf("%w: 不能删除存储源根目录", ErrInvalid)
	}

	unlock := s.locks.Lock(locks.Key(src.SourceID, relPath))
	defer unlock()

	info, err := os.Lstat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return ErrUnsupported
	}

	isDir := info.IsDir()
	if err := os.RemoveAll(absPath); err != nil {
		return fmt.Errorf("删除失败: %w", err)
	}

	// 同步清理 Images 表，避免图床历史残留失效图片（README §13.5/§17.12）。
	s.cleanupImageRecords(src.SourceID, relPath, isDir)
	return nil
}

func (s *Service) cleanupImageRecords(sourceID, relPath string, isDir bool) {
	if isDir {
		_, _ = s.db.Exec(`DELETE FROM images WHERE source_id = ? AND (relative_path = ? OR relative_path LIKE ?)`,
			sourceID, relPath, relPath+"/%")
		return
	}
	_, _ = s.db.Exec(`DELETE FROM images WHERE source_id = ? AND relative_path = ?`, sourceID, relPath)
}

// --- 重命名 / 移动（README §13.6 只支持同存储源） ---

// Rename 重命名文件或目录，目标已存在时返回 ErrAlreadyExists。
func (s *Service) Rename(src *models.StorageSource, relInput, newName string) (string, error) {
	if err := security.ValidateFileName(newName); err != nil {
		return "", fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	relPath, err := security.NormalizeRelPath(relInput)
	if err != nil || relPath == "" {
		return "", fmt.Errorf("%w: 非法路径", ErrInvalid)
	}

	parent := path.Dir(relPath)
	if parent == "." {
		parent = ""
	}
	newRel := newName
	if parent != "" {
		newRel = parent + "/" + newName
	}
	return s.move(src, relPath, newRel)
}

// Move 将文件或目录移动到同存储源内的新路径 toRel（完整目标路径，含文件名）。
func (s *Service) Move(src *models.StorageSource, fromInput, toInput string) (string, error) {
	fromRel, err := security.NormalizeRelPath(fromInput)
	if err != nil || fromRel == "" {
		return "", fmt.Errorf("%w: 非法源路径", ErrInvalid)
	}
	toRel, err := security.NormalizeRelPath(toInput)
	if err != nil || toRel == "" {
		return "", fmt.Errorf("%w: 非法目标路径", ErrInvalid)
	}
	return s.move(src, fromRel, toRel)
}

func (s *Service) move(src *models.StorageSource, fromRel, toRel string) (string, error) {
	if fromRel == toRel {
		return "", ErrAlreadyExists
	}
	// 目录不能移动到自身或子目录（README §13.6）。
	if strings.HasPrefix(toRel, fromRel+"/") {
		return "", fmt.Errorf("%w: 不能移动到自身或子目录", ErrInvalid)
	}

	fromRel, fromAbs, err := s.prepare(src, fromRel)
	if err != nil {
		return "", err
	}
	toRel, toAbs, err := s.prepare(src, toRel)
	if err != nil {
		return "", err
	}

	unlock := s.locks.LockPair(locks.Key(src.SourceID, fromRel), locks.Key(src.SourceID, toRel))
	defer unlock()

	info, err := os.Lstat(fromAbs)
	if err != nil {
		if os.IsNotExist(err) {
			return "", ErrNotFound
		}
		return "", err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return "", ErrUnsupported
	}
	if _, err := os.Lstat(toAbs); err == nil {
		return "", ErrAlreadyExists // 不覆盖、不自动重命名（README §13.6）
	}
	if parentInfo, err := os.Stat(filepath.Dir(toAbs)); err != nil || !parentInfo.IsDir() {
		return "", fmt.Errorf("%w: 目标目录不存在", ErrInvalid)
	}

	if err := os.Rename(fromAbs, toAbs); err != nil {
		return "", fmt.Errorf("移动失败: %w", err)
	}

	// 同步更新图床记录路径，保持公开 URL 有效。
	s.syncImageRecordsMove(src.SourceID, fromRel, toRel, info.IsDir())
	return toRel, nil
}

func (s *Service) syncImageRecordsMove(sourceID, fromRel, toRel string, isDir bool) {
	if isDir {
		rows, err := s.db.Query(`SELECT id, relative_path FROM images
  WHERE source_id = ? AND (relative_path = ? OR relative_path LIKE ?)`,
			sourceID, fromRel, fromRel+"/%")
		if err != nil {
			return
		}
		type rec struct {
			id  int64
			rel string
		}
		var recs []rec
		for rows.Next() {
			var r rec
			if err := rows.Scan(&r.id, &r.rel); err != nil {
				rows.Close()
				return
			}
			recs = append(recs, r)
		}
		rows.Close()
		for _, r := range recs {
			newRel := toRel + strings.TrimPrefix(r.rel, fromRel)
			_, _ = s.db.Exec(`UPDATE images SET relative_path = ? WHERE id = ?`, newRel, r.id)
		}
		return
	}
	_, _ = s.db.Exec(`UPDATE images SET relative_path = ? WHERE source_id = ? AND relative_path = ?`,
		toRel, sourceID, fromRel)
}
