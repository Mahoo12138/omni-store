package sources

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

var (
	// ErrNotFound 存储源不存在。
	ErrNotFound = errors.New("存储源不存在")
	// ErrNameRequired 存储源名称不能为空。
	ErrNameRequired = errors.New("存储源名称不能为空")
	// ErrQuotaInvalid 存储源配额不能为负数。
	ErrQuotaInvalid = errors.New("存储源配额不能为负数")
)

// DefaultExcludePatterns 是新建存储源默认建议排除规则（README §11.3）。
var DefaultExcludePatterns = []string{
	"**/.DS_Store",
	"**/Thumbs.db",
	"**/@eaDir/**",
	"**/#recycle/**",
	"**/.Trash/**",
	"**/.Trashes/**",
	"**/.git/**",
	"**/.env",
	"**/.env.*",
	"**/.ssh/**",
}

// Service 提供存储源管理能力。
type Service struct {
	db      *sql.DB
	dataDir string
}

// NewService 创建存储源服务。dataDir 用于路径安全校验。
func NewService(db *sql.DB, dataDir string) *Service {
	return &Service{db: db, dataDir: dataDir}
}

const sourceColumns = `id, key, name, description, root_path, is_disabled,
  public_read_enabled, public_mount_path, webdav_enabled, image_bed_enabled, quota_bytes, created_at, updated_at`

func scanSource(row interface{ Scan(...any) error }) (*models.StorageSource, error) {
	var s models.StorageSource
	var desc sql.NullString
	err := row.Scan(&s.ID, &s.Key, &s.Name, &desc, &s.RootPath, &s.IsDisabled,
		&s.PublicReadEnabled, &s.PublicMountPath, &s.WebdavEnabled, &s.ImageBedEnabled,
		&s.QuotaBytes, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	s.Description = desc.String
	return &s, nil
}

// CreateInput 是创建存储源的输入。
type CreateInput struct {
	Name        string
	Description string
	RootPath    string
	// ExcludePatterns 为 nil 时使用默认建议规则。
	ExcludePatterns []string
	HasPatterns     bool
}

// Create 创建存储源，执行全部路径安全校验（README §10.5）。
func (s *Service) Create(in CreateInput) (*models.StorageSource, error) {
	if in.Name = strings.TrimSpace(in.Name); in.Name == "" {
		return nil, ErrNameRequired
	}

	existing, err := s.allRootPaths()
	if err != nil {
		return nil, err
	}
	realPath, err := ValidateRootPath(in.RootPath, s.dataDir, existing)
	if err != nil {
		return nil, err
	}

	patterns := in.ExcludePatterns
	if !in.HasPatterns {
		patterns = DefaultExcludePatterns
	}

	now := time.Now().UTC()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var (
		key    string
		result sql.Result
	)
	for attempt := 0; attempt < 5; attempt++ {
		key = auth.NewRandomToken("src-", 8)
		result, err = tx.Exec(`INSERT INTO storage_sources
  (key, name, description, root_path, is_disabled, public_read_enabled,
   public_mount_path, webdav_enabled, image_bed_enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, 0, 0, NULL, 1, 0, ?, ?)`,
			key, in.Name, in.Description, realPath, now, now)
		if err == nil || !strings.Contains(err.Error(), "storage_sources.key") {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("创建存储源失败: %w", err)
	}
	storageSourceID, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	for _, p := range patterns {
		if p = strings.TrimSpace(p); p == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO storage_source_exclude_patterns (storage_source_id, pattern, created_at)
  VALUES (?, ?, ?)`, storageSourceID, p, now); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(key)
}

func (s *Service) allRootPaths() ([]string, error) {
	rows, err := s.db.Query(`SELECT root_path FROM storage_sources`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Get 按系统生成的不透明 key 查询存储源。
func (s *Service) Get(key string) (*models.StorageSource, error) {
	return scanSource(s.db.QueryRow(`SELECT `+sourceColumns+` FROM storage_sources WHERE key = ?`, key))
}

// GetByID 仅供持久化关联解析使用；数字主键不暴露到用户路由。
func (s *Service) GetByID(id int64) (*models.StorageSource, error) {
	return scanSource(s.db.QueryRow(`SELECT `+sourceColumns+` FROM storage_sources WHERE id = ?`, id))
}

// List 返回全部存储源（管理员）。
func (s *Service) List() ([]*models.StorageSource, error) {
	rows, err := s.db.Query(`SELECT ` + sourceColumns + ` FROM storage_sources ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.StorageSource
	for rows.Next() {
		src, err := scanSource(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, src)
	}
	return out, rows.Err()
}

// UpdateInput 是可修改的存储源配置。root_path 创建后不可修改（README §10.3）。
type UpdateInput struct {
	Name              *string
	Description       *string
	PublicReadEnabled *bool
	PublicMountPath   *string
	WebdavEnabled     *bool
	ImageBedEnabled   *bool
	QuotaBytes        *int64
}

// Update 修改存储源配置。开启公开访问时校验挂载路径格式和冲突（README §12.3/§12.4）。
func (s *Service) Update(key string, in UpdateInput) (*models.StorageSource, error) {
	src, err := s.Get(key)
	if err != nil {
		return nil, err
	}
	var previousMountPath string
	if src.PublicMountPath != nil {
		previousMountPath = *src.PublicMountPath
	}

	if in.Name != nil {
		if v := strings.TrimSpace(*in.Name); v != "" {
			src.Name = v
		}
	}
	if in.Description != nil {
		src.Description = *in.Description
	}
	if in.PublicReadEnabled != nil {
		src.PublicReadEnabled = *in.PublicReadEnabled
	}
	if in.WebdavEnabled != nil {
		src.WebdavEnabled = *in.WebdavEnabled
	}
	if in.ImageBedEnabled != nil {
		src.ImageBedEnabled = *in.ImageBedEnabled
	}
	if in.QuotaBytes != nil {
		if *in.QuotaBytes < 0 {
			return nil, ErrQuotaInvalid
		}
		src.QuotaBytes = *in.QuotaBytes
	}
	if in.PublicMountPath != nil {
		src.PublicMountPath = in.PublicMountPath
	}

	// 关闭公开访问时挂载路径可以留空；非空路径始终校验并预留，避免后续开启时产生冲突。
	if src.PublicMountPath != nil && strings.TrimSpace(*src.PublicMountPath) == "" {
		src.PublicMountPath = nil
	}
	if src.PublicReadEnabled && src.PublicMountPath == nil {
		return nil, fmt.Errorf("开启公开访问时必须配置公开挂载路径")
	}

	var normalizedMountPath string
	if src.PublicMountPath != nil {
		normalizedMountPath, err = NormalizeMountPath(*src.PublicMountPath, nil)
		if err != nil {
			return nil, err
		}
		src.PublicMountPath = &normalizedMountPath
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if src.PublicMountPath != nil {
		reserved, err := reservedMountPaths(tx, src.ID, normalizedMountPath)
		if err != nil {
			return nil, err
		}
		if _, err := NormalizeMountPath(normalizedMountPath, reserved); err != nil {
			return nil, err
		}
		// 允许存储源把当前路径改回自己的某个旧路径。
		if _, err := tx.Exec(`DELETE FROM public_mount_redirects WHERE storage_source_id = ? AND mount_path = ?`,
			src.ID, normalizedMountPath); err != nil {
			return nil, err
		}
	}

	if previousMountPath != "" && previousMountPath != normalizedMountPath && src.PublicMountPath != nil {
		if _, err := tx.Exec(`INSERT INTO public_mount_redirects (storage_source_id, mount_path, created_at)
  VALUES (?, ?, ?) ON CONFLICT(mount_path) DO NOTHING`, src.ID, previousMountPath, time.Now().UTC()); err != nil {
			return nil, err
		}
	}
	if src.PublicMountPath == nil {
		// 没有新的目标路径时，旧路径无法安全重定向，不再继续占用。
		if _, err := tx.Exec(`DELETE FROM public_mount_redirects WHERE storage_source_id = ?`, src.ID); err != nil {
			return nil, err
		}
	}

	_, err = tx.Exec(`UPDATE storage_sources SET
  name = ?, description = ?, public_read_enabled = ?, public_mount_path = ?,
  webdav_enabled = ?, image_bed_enabled = ?, quota_bytes = ?, updated_at = ?
  WHERE id = ?`,
		src.Name, src.Description, src.PublicReadEnabled, src.PublicMountPath,
		src.WebdavEnabled, src.ImageBedEnabled, src.QuotaBytes, time.Now().UTC(), src.ID)
	if err != nil {
		return nil, fmt.Errorf("更新存储源失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(key)
}

type queryer interface {
	Query(query string, args ...any) (*sql.Rows, error)
}

// reservedMountPaths 返回其他当前挂载和全部旧路径。当前存储源准备恢复的同名旧路径除外。
func reservedMountPaths(q queryer, excludeStorageSourceID int64, allowedRedirectPath string) ([]string, error) {
	rows, err := q.Query(`SELECT public_mount_path FROM storage_sources
  WHERE public_mount_path IS NOT NULL AND id != ?
UNION ALL
SELECT mount_path FROM public_mount_redirects
  WHERE NOT (storage_source_id = ? AND mount_path = ?)`, excludeStorageSourceID, excludeStorageSourceID, allowedRedirectPath)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SetDisabled 启用/禁用存储源。禁用后所有入口不可访问（README §10.1）。
func (s *Service) SetDisabled(key string, disabled bool) error {
	res, err := s.db.Exec(`UPDATE storage_sources SET is_disabled = ?, updated_at = ? WHERE key = ?`,
		disabled, time.Now().UTC(), key)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete 删除存储源的 OmniStore 内部记录，不删除真实磁盘文件（README §10.4）。
func (s *Service) Delete(key string) error {
	src, err := s.Get(key)
	if err != nil {
		return err
	}
	id := src.ID
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, q := range []string{
		`DELETE FROM access_policy_sources WHERE storage_source_id = ?`,
		`DELETE FROM storage_source_exclude_patterns WHERE storage_source_id = ?`,
		`DELETE FROM public_mount_redirects WHERE storage_source_id = ?`,
		`UPDATE user_preferences SET default_image_bed_storage_source_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE default_image_bed_storage_source_id = ?`,
		`DELETE FROM images WHERE storage_source_id = ?`,
	} {
		if _, err := tx.Exec(q, id); err != nil {
			return err
		}
	}
	// 匿名图床目标指向该存储源时一并清理。
	if _, err := tx.Exec(`DELETE FROM system_settings
  WHERE key = 'anonymous_image_bed_storage_source_id' AND value = ?`, strconv.FormatInt(id, 10)); err != nil {
		return err
	}

	res, err := tx.Exec(`DELETE FROM storage_sources WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// --- 排除规则（README §11） ---

// ExcludePatterns 返回存储源的自定义排除规则（不含系统强制规则）。
func (s *Service) ExcludePatterns(id int64) ([]string, error) {
	rows, err := s.db.Query(`SELECT pattern FROM storage_source_exclude_patterns
  WHERE storage_source_id = ? ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SetExcludePatterns 整体替换存储源排除规则。
func (s *Service) SetExcludePatterns(id int64, patterns []string) error {
	if _, err := s.GetByID(id); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM storage_source_exclude_patterns WHERE storage_source_id = ?`, id); err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, p := range patterns {
		if p = strings.TrimSpace(p); p == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO storage_source_exclude_patterns (storage_source_id, pattern, created_at)
  VALUES (?, ?, ?)`, id, p, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Matcher 返回该存储源的排除规则匹配器（含系统强制规则）。
func (s *Service) Matcher(id int64) (*security.ExcludeMatcher, error) {
	patterns, err := s.ExcludePatterns(id)
	if err != nil {
		return nil, err
	}
	return security.NewExcludeMatcher(patterns), nil
}

// IsPathExcluded 统一排除规则检查函数（README §11.4）。
// relativePath 必须是 NormalizeRelPath 的输出。
func (s *Service) IsPathExcluded(id int64, relativePath string) bool {
	m, err := s.Matcher(id)
	if err != nil {
		// 查询失败时按排除处理，宁可拒绝不可泄露。
		return true
	}
	return m.MatchPrefix(relativePath)
}
