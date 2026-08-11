// Package files 集中实现真实文件系统操作（README §23 约束：
// handler 不直接操作文件系统，全部经过本包）。
// 每个操作都遵循统一链路：规范化路径 -> 排除规则 -> symlink 检查 -> 路径锁 -> 文件系统。
package files

import (
	"context"
	"crypto/sha256"
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
	"github.com/omni-store/omnistore/internal/lifecycle"
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
	// ErrLocked 路径受 WebDAV 持久写锁保护，且未提交匹配 Token。
	ErrLocked = locks.ErrPersistentLocked
	// ErrQuotaExceeded 写入会超过存储源硬配额。
	ErrQuotaExceeded = errors.New("存储源可用空间不足")
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

// ObjectEntry 是 S3 列举使用的扁平对象视图；目录本身不作为对象返回。
type ObjectEntry struct {
	Key   string
	Size  int64
	MTime time.Time
}

// QuotaWriteGuard 在一次最终文件写入期间串行化同一存储源的配额计算。
type QuotaWriteGuard struct {
	maxBytes int64
	limited  bool
	releases []func()
}

// MaxBytes 返回本次写入可占用的最终文件大小；limited=false 表示不限制。
func (g *QuotaWriteGuard) MaxBytes() (maxBytes int64, limited bool) {
	return g.maxBytes, g.limited
}

// Close 释放配额写锁。
func (g *QuotaWriteGuard) Close() {
	for i := len(g.releases) - 1; i >= 0; i-- {
		g.releases[i]()
	}
	g.releases = nil
}

// Service 提供核心文件操作，REST、WebDAV、图床、公开网盘共用。
type Service struct {
	db              *sql.DB
	sources         *sources.Service
	locks           *locks.Manager
	persistentLocks *locks.PersistentStore
	trashDir        string
}

func (s *Service) guardLifecycle(storageSources []*models.StorageSource, userID *int64) (func(), error) {
	keys := make([]lifecycle.Key, 0, len(storageSources)+1)
	for _, src := range storageSources {
		if src != nil {
			keys = append(keys, lifecycle.Source(src.ID))
		}
	}
	if userID != nil {
		keys = append(keys, lifecycle.User(*userID))
	}
	release := lifecycle.Read(keys...)
	for _, expected := range storageSources {
		if expected == nil {
			continue
		}
		current, err := s.sources.GetByID(expected.ID)
		if err != nil || current.Key != expected.Key {
			release()
			return nil, ErrNotFound
		}
	}
	if userID != nil {
		var found int
		if err := s.db.QueryRow(`SELECT 1 FROM users WHERE id = ?`, *userID).Scan(&found); err != nil {
			release()
			if errors.Is(err, sql.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
	}
	return release, nil
}

// NewService 创建文件服务。
func NewService(db *sql.DB, srcSvc *sources.Service, lockMgr *locks.Manager) *Service {
	return &Service{
		db: db, sources: srcSvc, locks: lockMgr, persistentLocks: locks.NewPersistentStore(db),
		trashDir: filepath.Join(srcSvc.DataDir(), "trash"),
	}
}

// Locks 暴露锁管理器（WebDAV 等入口共用）。
func (s *Service) Locks() *locks.Manager {
	return s.locks
}

// PersistentLocks 暴露 WebDAV 持久锁存储，供协议层和后台清理复用。
func (s *Service) PersistentLocks() *locks.PersistentStore {
	return s.persistentLocks
}

// StorageSourceByID 返回文件恢复流程使用的存储源快照。
func (s *Service) StorageSourceByID(storageSourceID int64) (*models.StorageSource, error) {
	return s.sources.GetByID(storageSourceID)
}

// StorageUsage 实时统计存储源内全部普通文件，不跟随 symlink；排除规则不减少物理用量。
// OmniStore 严格命名的上传临时文件不计入最终用量。
func (s *Service) StorageUsage(src *models.StorageSource) (int64, error) {
	root, err := security.ResolveInSource(src.RootPath, "")
	if err != nil {
		return 0, err
	}
	var usage int64
	err = filepath.WalkDir(root, func(absPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return nil
			}
			return walkErr
		}
		if absPath == root {
			return nil
		}
		if isInternalName(entry.Name()) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		if info.Mode().IsRegular() {
			usage += info.Size()
		}
		return nil
	})
	return usage, err
}

// StorageQuota 返回实时用量和剩余配额。
func (s *Service) StorageQuota(src *models.StorageSource) (*models.StorageQuota, error) {
	usage, err := s.StorageUsage(src)
	if err != nil {
		return nil, err
	}
	quota := &models.StorageQuota{UsageBytes: usage, QuotaBytes: src.QuotaBytes, Unlimited: src.QuotaBytes == 0}
	if quota.Unlimited {
		return quota, nil
	}
	quota.RemainingBytes = src.QuotaBytes - usage
	if quota.RemainingBytes < 0 {
		quota.RemainingBytes = 0
	}
	return quota, nil
}

func quotaLockKey(sourceKey string) string {
	return "quota:" + sourceKey
}

// LockQuotaUpdate 阻止新的最终文件写入并等待当前写入完成，用于原子更新配额配置。
func (s *Service) LockQuotaUpdate(sourceKey string) func() {
	return s.locks.Lock(quotaLockKey(sourceKey))
}

func userQuotaLockKey(userID int64) string {
	return fmt.Sprintf("user-quota:%d", userID)
}

// LockUserQuotaUpdate 等待该用户当前写入结束并阻止新写入，用于原子更新用户配额。
func (s *Service) LockUserQuotaUpdate(userID int64) func() {
	return s.locks.Lock(userQuotaLockKey(userID))
}

// BeginQuotaWrite 为最终路径计算可写大小。覆盖已有普通文件时会返还旧文件占用。
// 不限额写入持有共享协调锁但不会互相串行；有限额写入持有独占锁并实时统计。
func (s *Service) BeginQuotaWrite(src *models.StorageSource, replacingRelPath string) (*QuotaWriteGuard, error) {
	return s.BeginQuotaWriteForUser(src, replacingRelPath, nil)
}

// BeginQuotaWriteForUser 同时计算存储源硬配额和文件所有者用户配额。
func (s *Service) BeginQuotaWriteForUser(src *models.StorageSource, replacingRelPath string, ownerUserID *int64) (*QuotaWriteGuard, error) {
	return s.beginQuotaWriteForUser(src, replacingRelPath, ownerUserID, 0)
}

func (s *Service) beginQuotaWriteForUser(src *models.StorageSource, replacingRelPath string, ownerUserID *int64, userCredit int64) (*QuotaWriteGuard, error) {
	guard := &QuotaWriteGuard{}
	for {
		releaseRead := s.locks.RLock(quotaLockKey(src.Key))
		current, err := s.sources.Get(src.Key)
		if err != nil {
			releaseRead()
			return nil, err
		}
		if current.QuotaBytes == 0 {
			guard.releases = append(guard.releases, releaseRead)
			break
		}
		releaseRead()

		releaseWrite := s.locks.Lock(quotaLockKey(src.Key))
		current, err = s.sources.Get(src.Key)
		if err != nil {
			releaseWrite()
			return nil, err
		}
		if current.QuotaBytes == 0 {
			releaseWrite()
			continue
		}
		guard.releases = append(guard.releases, releaseWrite)
		usage, err := s.StorageUsage(current)
		if err != nil {
			guard.Close()
			return nil, err
		}
		var replacedBytes int64
		if replacingRelPath != "" {
			_, absPath, err := s.prepare(current, replacingRelPath)
			if err != nil {
				guard.Close()
				return nil, err
			}
			if info, err := os.Lstat(absPath); err == nil && info.Mode().IsRegular() {
				replacedBytes = info.Size()
			} else if err != nil && !os.IsNotExist(err) {
				guard.Close()
				return nil, err
			}
		}
		guard.limited = true
		available := current.QuotaBytes - usage
		if available < 0 {
			available = 0
		}
		guard.maxBytes = available + replacedBytes
		break
	}
	if ownerUserID == nil {
		return guard, nil
	}
	if err := s.applyUserQuotaGuard(guard, *ownerUserID, src.ID, replacingRelPath, userCredit); err != nil {
		guard.Close()
		return nil, err
	}
	return guard, nil
}

func (s *Service) applyUserQuotaGuard(guard *QuotaWriteGuard, userID, storageSourceID int64, replacingRelPath string, userCredit int64) error {
	for {
		releaseRead := s.locks.RLock(userQuotaLockKey(userID))
		var quotaBytes int64
		if err := s.db.QueryRow(`SELECT quota_bytes FROM users WHERE id = ?`, userID).Scan(&quotaBytes); err != nil {
			releaseRead()
			return err
		}
		if quotaBytes == 0 {
			guard.releases = append(guard.releases, releaseRead)
			return nil
		}
		releaseRead()

		releaseWrite := s.locks.Lock(userQuotaLockKey(userID))
		if err := s.db.QueryRow(`SELECT quota_bytes FROM users WHERE id = ?`, userID).Scan(&quotaBytes); err != nil {
			releaseWrite()
			return err
		}
		if quotaBytes == 0 {
			releaseWrite()
			continue
		}
		guard.releases = append(guard.releases, releaseWrite)
		usage, err := s.UserUsage(userID)
		if err != nil {
			return err
		}
		var replacedBytes int64
		if replacingRelPath != "" {
			relPath, err := security.NormalizeRelPath(replacingRelPath)
			if err != nil {
				return err
			}
			_ = s.db.QueryRow(`SELECT size FROM file_records
  WHERE storage_source_id = ? AND relative_path = ? AND owner_user_id = ? AND owner_type = ? AND record_status = ?`,
				storageSourceID, relPath, userID, models.FileOwnerUser, models.FileRecordActive).Scan(&replacedBytes)
		}
		available := quotaBytes - usage
		if available < 0 {
			available = 0
		}
		userMax := available + replacedBytes + userCredit
		if !guard.limited || userMax < guard.maxBytes {
			guard.maxBytes = userMax
		}
		guard.limited = true
		return nil
	}
}

// prepare 执行统一前置检查：规范化路径 -> 排除规则 -> symlink 检查。
// 返回规范化相对路径和绝对路径。
func (s *Service) prepare(src *models.StorageSource, relInput string) (relPath, absPath string, err error) {
	relPath, err = security.NormalizeRelPath(relInput)
	if err != nil {
		return "", "", fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	matcher, err := s.sources.Matcher(src.ID)
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

	unlock := s.locks.RLock(locks.Key(src.Key, relPath))
	defer unlock()

	dirents, err := os.ReadDir(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("读取目录失败: %w", err)
	}

	matcher, err := s.sources.Matcher(src.ID)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(dirents))
	for _, de := range dirents {
		name := de.Name()
		// 隐藏由上传与复制恢复流程持有的内部 staging。
		if isInternalName(name) {
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

// ListObjects 递归扫描一个存储源，返回经过排除规则过滤的普通文件。
// S3 的 prefix、delimiter 和分页在协议层处理。
func (s *Service) ListObjects(src *models.StorageSource) ([]ObjectEntry, error) {
	_, root, err := s.prepare(src, "")
	if err != nil {
		return nil, err
	}
	matcher, err := s.sources.Matcher(src.ID)
	if err != nil {
		return nil, err
	}
	out := []ObjectEntry{}
	err = filepath.WalkDir(root, func(absPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if absPath == root {
			return nil
		}
		rel, err := filepath.Rel(root, absPath)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if matcher.MatchPrefix(rel) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if isInternalName(entry.Name()) {
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
		if info.Mode().IsRegular() {
			out = append(out, ObjectEntry{Key: rel, Size: info.Size(), MTime: info.ModTime()})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}

// EnsureObjectParents 创建对象 Key 所需的父目录，复用统一路径与锁检查。
func (s *Service) EnsureObjectParents(src *models.StorageSource, objectKey string) error {
	normalized, err := security.NormalizeRelPath(objectKey)
	if err != nil {
		return fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	parent := path.Dir(normalized)
	if parent == "." || parent == "" {
		return nil
	}
	current := ""
	for _, segment := range strings.Split(parent, "/") {
		_, err := s.Mkdir(src, current, segment)
		if err != nil && !errors.Is(err, ErrAlreadyExists) {
			return err
		}
		if current == "" {
			current = segment
		} else {
			current += "/" + segment
		}
	}
	return nil
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
	unlock := s.locks.RLock(locks.Key(src.Key, relPath))
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
	unlock := s.locks.RLock(locks.Key(src.Key, relPath))

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
	return s.MkdirWithLockTokens(src, parentRel, name, nil, nil)
}

// MkdirWithLockTokens 创建目录，并允许 WebDAV 提交匹配的持久锁 Token。
func (s *Service) MkdirWithLockTokens(src *models.StorageSource, parentRel, name string, lockTokens []string, lockOwnerUserID *int64) (string, error) {
	releaseLifecycle, err := s.guardLifecycle([]*models.StorageSource{src}, lockOwnerUserID)
	if err != nil {
		return "", err
	}
	defer releaseLifecycle()
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
	releasePersistent, err := s.persistentLocks.GuardMutation(context.Background(), src.ID,
		[]locks.MutationScope{{Path: relPath}}, lockTokens, lockOwnerUserID)
	if err != nil {
		return "", err
	}
	defer releasePersistent()

	unlock := s.locks.Lock(locks.Key(src.Key, relPath))
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
	return s.UploadWithLockTokens(src, dirRel, filename, body, overwrite, nil, nil)
}

// UploadWithLockTokens 上传文件，并允许 WebDAV 提交匹配的持久锁 Token。
func (s *Service) UploadWithLockTokens(src *models.StorageSource, dirRel, filename string, body io.Reader, overwrite bool, lockTokens []string, lockOwnerUserID *int64) (string, int64, error) {
	releaseLifecycle, err := s.guardLifecycle([]*models.StorageSource{src}, lockOwnerUserID)
	if err != nil {
		return "", 0, err
	}
	defer releaseLifecycle()
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
	releasePersistent, err := s.persistentLocks.GuardMutation(context.Background(), src.ID,
		[]locks.MutationScope{{Path: relPath}}, lockTokens, lockOwnerUserID)
	if err != nil {
		return "", 0, err
	}
	defer releasePersistent()
	quotaGuard, err := s.BeginQuotaWriteForUser(src, relPath, lockOwnerUserID)
	if err != nil {
		return "", 0, err
	}
	defer quotaGuard.Close()

	unlock := s.locks.Lock(locks.Key(src.Key, relPath))
	defer unlock()

	// 冲突检查（README §13.4）。
	replacedExisting := false
	if info, err := os.Lstat(absPath); err == nil {
		if info.IsDir() {
			return "", 0, fmt.Errorf("%w: 文件不能覆盖目录", ErrInvalid)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return "", 0, ErrUnsupported
		}
		if !overwrite {
			return "", 0, ErrAlreadyExists
		}
		replacedExisting = true
	} else if !os.IsNotExist(err) {
		return "", 0, err
	}

	parentAbs := filepath.Dir(absPath)
	if info, err := os.Stat(parentAbs); err != nil || !info.IsDir() {
		return "", 0, fmt.Errorf("%w: 目标目录不存在", ErrInvalid)
	}

	maxBytes, limited := quotaGuard.MaxBytes()
	tmpPath, written, contentSHA256, err := writeUploadTemp(parentAbs, body, maxBytes, limited)
	if err != nil {
		return "", 0, err
	}
	keepTemp := true
	defer func() {
		if keepTemp {
			_ = os.Remove(tmpPath)
		}
	}()
	if err := syncDirectory(parentAbs); err != nil {
		return "", 0, fmt.Errorf("同步上传临时目录失败: %w", err)
	}
	ownerType := models.FileOwnerUnowned
	var ownerUserID *int64
	if lockOwnerUserID != nil {
		ownerType = models.FileOwnerUser
		ownerUserID = lockOwnerUserID
	}
	op, err := s.newUploadOperation(src, relPath, tmpPath, replacedExisting, written, contentSHA256,
		ownerType, ownerUserID, lockOwnerUserID)
	if err != nil {
		return "", 0, err
	}
	if err := s.writeUploadOperation(op); err != nil {
		return "", 0, err
	}
	keepTemp = false // 从这里开始由持久日志接管清理与恢复。
	if err := s.installUploadedFile(op, tmpPath, absPath); err != nil {
		if rollbackErr := s.rollbackUploadOperation(op, src); rollbackErr != nil {
			return "", 0, fmt.Errorf("提交上传文件失败: %w；回滚上传失败: %v", err, rollbackErr)
		}
		return "", 0, err
	}
	if err := s.RecordFile(src, relPath, ownerType, ownerUserID, lockOwnerUserID); err != nil {
		if rollbackErr := s.rollbackUploadOperation(op, src); rollbackErr != nil {
			return "", 0, fmt.Errorf("更新文件台账失败: %w；回滚上传失败: %v", err, rollbackErr)
		}
		return "", 0, fmt.Errorf("更新文件台账失败: %w", err)
	}
	if err := s.markUploadDatabaseReady(op.OperationID); err != nil {
		// SQLite 已提交后不能再回滚真实文件。保留日志，让启动恢复器通过
		// 最终文件摘要校验和幂等 upsert 完成阶段标记与内部备份清理。
		return "", 0, fmt.Errorf("标记上传数据库阶段失败: %w", err)
	}
	if err := s.finishUploadOperation(op, src); err != nil {
		// 对客户端而言上传已经提交；清理失败留给启动恢复，不诱发重复写入。
		return relPath, written, nil
	}
	return relPath, written, nil
}

// writeViaTemp 写同目录临时文件后原子重命名到目标（README §14.3/§14.4）。
func writeViaTemp(dirAbs, targetAbs string, body io.Reader, maxBytes int64, limited bool) (int64, error) {
	tmpPath, written, _, err := writeUploadTemp(dirAbs, body, maxBytes, limited)
	if err != nil {
		return 0, err
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

func writeUploadTemp(dirAbs string, body io.Reader, maxBytes int64, limited bool) (string, int64, string, error) {
	tmpPath := filepath.Join(dirAbs, ".omnistore-upload-"+auth.NewRandomToken("", 8)+".tmp")
	tmp, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return "", 0, "", fmt.Errorf("创建临时文件失败: %w", err)
	}

	cleanup := func() {
		tmp.Close()
		os.Remove(tmpPath)
	}

	reader := body
	const maxInt64 = int64(^uint64(0) >> 1)
	if limited && maxBytes < maxInt64 {
		reader = io.LimitReader(body, maxBytes+1)
	}
	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(tmp, hasher), reader)
	if err != nil {
		cleanup()
		return "", 0, "", fmt.Errorf("写入失败: %w", err)
	}
	if limited && written > maxBytes {
		cleanup()
		return "", 0, "", ErrQuotaExceeded
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return "", 0, "", fmt.Errorf("落盘失败: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return "", 0, "", fmt.Errorf("关闭临时文件失败: %w", err)
	}
	return tmpPath, written, fmt.Sprintf("%x", hasher.Sum(nil)), nil
}

// --- 删除（README §13.5 永久删除） ---

// Delete 永久删除文件或目录（含目录内全部内容），并同步清理图床记录。
func (s *Service) Delete(src *models.StorageSource, relInput string) error {
	return s.DeleteWithLockTokens(src, relInput, nil, nil)
}

// DeleteWithLockTokens 删除路径，并允许 WebDAV 提交覆盖整个删除范围的锁 Token。
func (s *Service) DeleteWithLockTokens(src *models.StorageSource, relInput string, lockTokens []string, lockOwnerUserID *int64) error {
	releaseLifecycle, err := s.guardLifecycle([]*models.StorageSource{src}, lockOwnerUserID)
	if err != nil {
		return err
	}
	defer releaseLifecycle()
	relPath, absPath, err := s.prepare(src, relInput)
	if err != nil {
		return err
	}
	if relPath == "" {
		return fmt.Errorf("%w: 不能删除存储源根目录", ErrInvalid)
	}
	releasePersistent, err := s.persistentLocks.GuardMutation(context.Background(), src.ID,
		[]locks.MutationScope{{Path: relPath, IncludeDescendants: true}}, lockTokens, lockOwnerUserID)
	if err != nil {
		return err
	}
	defer releasePersistent()

	unlock := s.locks.Lock(locks.Key(src.Key, relPath))
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
	op := s.newPathOperation(pathOperationDelete, src, relPath, "", isDir, lockOwnerUserID)
	if err := s.writePathOperation(op); err != nil {
		return fmt.Errorf("记录永久删除意图失败: %w", err)
	}
	if err := os.RemoveAll(absPath); err != nil {
		return fmt.Errorf("删除失败，操作将在重启时继续: %w", err)
	}
	if err := syncPathParents(absPath); err != nil {
		return fmt.Errorf("同步永久删除目录失败，操作将在重启时继续: %w", err)
	}
	if err := s.markPathFilesystemReady(op.OperationID); err != nil {
		return fmt.Errorf("记录永久删除文件阶段失败，操作将在重启时继续: %w", err)
	}
	if err := s.deletePathMetadata(src.ID, relPath, isDir); err != nil {
		return fmt.Errorf("清理路径元数据失败，操作将在重启时继续: %w", err)
	}
	if err := s.markPathDatabaseReady(op.OperationID); err != nil {
		return fmt.Errorf("记录永久删除数据库阶段失败，操作将在重启时继续: %w", err)
	}
	if err := releasePersistent(relPath); err != nil {
		return err
	}
	// 删除已提交；日志清理失败由启动恢复幂等收敛。
	_ = s.removePathOperation(op.OperationID)
	return nil
}

// --- 重命名 / 移动（README §13.6 只支持同存储源） ---

// Rename 重命名文件或目录，目标已存在时返回 ErrAlreadyExists。
func (s *Service) Rename(src *models.StorageSource, relInput, newName string) (string, error) {
	return s.RenameAs(src, relInput, newName, nil)
}

// RenameAs 重命名文件或目录并记录执行用户。
func (s *Service) RenameAs(src *models.StorageSource, relInput, newName string, actorUserID *int64) (string, error) {
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
	return s.move(src, relPath, newRel, nil, actorUserID)
}

// Move 将文件或目录移动到同存储源内的新路径 toRel（完整目标路径，含文件名）。
func (s *Service) Move(src *models.StorageSource, fromInput, toInput string) (string, error) {
	return s.MoveWithLockTokens(src, fromInput, toInput, nil, nil)
}

// MoveWithLockTokens 移动路径，并允许 WebDAV 提交源与目标范围所需的锁 Token。
func (s *Service) MoveWithLockTokens(src *models.StorageSource, fromInput, toInput string, lockTokens []string, lockOwnerUserID *int64) (string, error) {
	fromRel, err := security.NormalizeRelPath(fromInput)
	if err != nil || fromRel == "" {
		return "", fmt.Errorf("%w: 非法源路径", ErrInvalid)
	}
	toRel, err := security.NormalizeRelPath(toInput)
	if err != nil || toRel == "" {
		return "", fmt.Errorf("%w: 非法目标路径", ErrInvalid)
	}
	return s.move(src, fromRel, toRel, lockTokens, lockOwnerUserID)
}

func (s *Service) move(src *models.StorageSource, fromRel, toRel string, lockTokens []string, lockOwnerUserID *int64) (string, error) {
	releaseLifecycle, err := s.guardLifecycle([]*models.StorageSource{src}, lockOwnerUserID)
	if err != nil {
		return "", err
	}
	defer releaseLifecycle()
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
	releasePersistent, err := s.persistentLocks.GuardMutation(context.Background(), src.ID,
		[]locks.MutationScope{
			{Path: fromRel, IncludeDescendants: true},
			{Path: toRel},
		}, lockTokens, lockOwnerUserID)
	if err != nil {
		return "", err
	}
	defer releasePersistent()

	unlock := s.locks.LockPair(locks.Key(src.Key, fromRel), locks.Key(src.Key, toRel))
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

	op := s.newPathOperation(pathOperationMove, src, fromRel, toRel, info.IsDir(), lockOwnerUserID)
	if err := s.writePathOperation(op); err != nil {
		return "", fmt.Errorf("记录路径移动意图失败: %w", err)
	}
	if err := os.Rename(fromAbs, toAbs); err != nil {
		_ = s.removePathOperation(op.OperationID)
		return "", fmt.Errorf("移动失败: %w", err)
	}
	rollback := func(metadataCommitted bool) error {
		var rollbackErr error
		if metadataCommitted {
			rollbackErr = s.movePathMetadata(src.ID, toRel, fromRel, info.IsDir(), lockOwnerUserID)
		}
		if rollbackErr == nil {
			rollbackErr = os.Rename(toAbs, fromAbs)
		}
		if rollbackErr == nil {
			rollbackErr = syncPathParents(fromAbs, toAbs)
		}
		if rollbackErr == nil {
			rollbackErr = s.removePathOperation(op.OperationID)
		}
		return rollbackErr
	}
	if err := syncPathParents(fromAbs, toAbs); err != nil {
		return "", errors.Join(fmt.Errorf("同步路径移动目录失败: %w", err), rollback(false))
	}
	if err := s.markPathFilesystemReady(op.OperationID); err != nil {
		return "", errors.Join(fmt.Errorf("记录路径移动文件阶段失败: %w", err), rollback(false))
	}
	if err := s.movePathMetadata(src.ID, fromRel, toRel, info.IsDir(), lockOwnerUserID); err != nil {
		return "", errors.Join(fmt.Errorf("更新路径元数据失败: %w", err), rollback(false))
	}
	if err := s.markPathDatabaseReady(op.OperationID); err != nil {
		return "", errors.Join(fmt.Errorf("记录路径移动数据库阶段失败: %w", err), rollback(true))
	}
	// RFC 4918：MOVE 不携带源资源上的锁。外部祖先锁保留，并按新路径重新判断覆盖关系。
	if err := releasePersistent(fromRel); err != nil {
		return "", err
	}
	// 文件系统和元数据均已提交；日志清理失败由启动恢复收敛。
	_ = s.removePathOperation(op.OperationID)
	return toRel, nil
}
