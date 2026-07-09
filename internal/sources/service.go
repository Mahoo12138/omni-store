package sources

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

var (
	// ErrNotFound 存储源不存在。
	ErrNotFound = errors.New("存储源不存在")
	// ErrSourceIDTaken source_id 已存在。
	ErrSourceIDTaken = errors.New("source_id 已存在")
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

const sourceColumns = `id, source_id, name, description, root_path, is_disabled,
  public_read_enabled, public_mount_path, webdav_enabled, image_bed_enabled, created_at, updated_at`

func scanSource(row interface{ Scan(...any) error }) (*models.StorageSource, error) {
	var s models.StorageSource
	var desc sql.NullString
	err := row.Scan(&s.ID, &s.SourceID, &s.Name, &desc, &s.RootPath, &s.IsDisabled,
		&s.PublicReadEnabled, &s.PublicMountPath, &s.WebdavEnabled, &s.ImageBedEnabled,
		&s.CreatedAt, &s.UpdatedAt)
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
	SourceID    string
	Name        string
	Description string
	RootPath    string
	// ExcludePatterns 为 nil 时使用默认建议规则。
	ExcludePatterns []string
	HasPatterns     bool
}

// Create 创建存储源，执行全部路径安全校验（README §10.5）。
func (s *Service) Create(in CreateInput) (*models.StorageSource, error) {
	if err := ValidateSourceID(in.SourceID); err != nil {
		return nil, err
	}
	if in.Name = strings.TrimSpace(in.Name); in.Name == "" {
		in.Name = in.SourceID
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

	_, err = tx.Exec(`INSERT INTO storage_sources
  (source_id, name, description, root_path, is_disabled, public_read_enabled,
   public_mount_path, webdav_enabled, image_bed_enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, 0, 0, NULL, 1, 0, ?, ?)`,
		in.SourceID, in.Name, in.Description, realPath, now, now)
	if err != nil {
		if strings.Contains(err.Error(), "storage_sources.source_id") {
			return nil, ErrSourceIDTaken
		}
		return nil, fmt.Errorf("创建存储源失败: %w", err)
	}

	for _, p := range patterns {
		if p = strings.TrimSpace(p); p == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO storage_source_exclude_patterns (source_id, pattern, created_at)
  VALUES (?, ?, ?)`, in.SourceID, p, now); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(in.SourceID)
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

// Get 按 source_id 查询存储源。
func (s *Service) Get(sourceID string) (*models.StorageSource, error) {
	return scanSource(s.db.QueryRow(`SELECT `+sourceColumns+` FROM storage_sources WHERE source_id = ?`, sourceID))
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

// UpdateInput 是可修改的存储源配置。root_path 和 source_id 创建后不可修改（README §10.3）。
type UpdateInput struct {
	Name              *string
	Description       *string
	PublicReadEnabled *bool
	PublicMountPath   *string
	WebdavEnabled     *bool
	ImageBedEnabled   *bool
}

// Update 修改存储源配置。开启公开访问时校验挂载路径格式和冲突（README §12.3/§12.4）。
func (s *Service) Update(sourceID string, in UpdateInput) (*models.StorageSource, error) {
	src, err := s.Get(sourceID)
	if err != nil {
		return nil, err
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
	if in.PublicMountPath != nil {
		src.PublicMountPath = in.PublicMountPath
	}

	if src.PublicReadEnabled {
		if src.PublicMountPath == nil || *src.PublicMountPath == "" {
			return nil, fmt.Errorf("开启公开访问时必须配置公开挂载路径")
		}
		others, err := s.otherMountPaths(sourceID)
		if err != nil {
			return nil, err
		}
		normalized, err := NormalizeMountPath(*src.PublicMountPath, others)
		if err != nil {
			return nil, err
		}
		src.PublicMountPath = &normalized
	}
	// 关闭公开访问时挂载路径可以保留为空。
	if src.PublicMountPath != nil && *src.PublicMountPath == "" {
		src.PublicMountPath = nil
	}

	_, err = s.db.Exec(`UPDATE storage_sources SET
  name = ?, description = ?, public_read_enabled = ?, public_mount_path = ?,
  webdav_enabled = ?, image_bed_enabled = ?, updated_at = ?
  WHERE source_id = ?`,
		src.Name, src.Description, src.PublicReadEnabled, src.PublicMountPath,
		src.WebdavEnabled, src.ImageBedEnabled, time.Now().UTC(), sourceID)
	if err != nil {
		return nil, fmt.Errorf("更新存储源失败: %w", err)
	}
	return s.Get(sourceID)
}

func (s *Service) otherMountPaths(excludeSourceID string) ([]string, error) {
	rows, err := s.db.Query(`SELECT public_mount_path FROM storage_sources
  WHERE public_mount_path IS NOT NULL AND source_id != ?`, excludeSourceID)
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
func (s *Service) SetDisabled(sourceID string, disabled bool) error {
	res, err := s.db.Exec(`UPDATE storage_sources SET is_disabled = ?, updated_at = ? WHERE source_id = ?`,
		disabled, time.Now().UTC(), sourceID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete 删除存储源的 OmniStore 内部记录，不删除真实磁盘文件（README §10.4）。
func (s *Service) Delete(sourceID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, q := range []string{
		`DELETE FROM user_source_permissions WHERE source_id = ?`,
		`DELETE FROM storage_source_exclude_patterns WHERE source_id = ?`,
		`UPDATE user_preferences SET default_image_bed_source_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE default_image_bed_source_id = ?`,
		`DELETE FROM images WHERE source_id = ?`,
	} {
		if _, err := tx.Exec(q, sourceID); err != nil {
			return err
		}
	}
	// 匿名图床目标指向该存储源时一并清理。
	if _, err := tx.Exec(`DELETE FROM system_settings
  WHERE key = 'anonymous_image_bed_source_id' AND value = ?`, sourceID); err != nil {
		return err
	}

	res, err := tx.Exec(`DELETE FROM storage_sources WHERE source_id = ?`, sourceID)
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
func (s *Service) ExcludePatterns(sourceID string) ([]string, error) {
	rows, err := s.db.Query(`SELECT pattern FROM storage_source_exclude_patterns
  WHERE source_id = ? ORDER BY id`, sourceID)
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
func (s *Service) SetExcludePatterns(sourceID string, patterns []string) error {
	if _, err := s.Get(sourceID); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM storage_source_exclude_patterns WHERE source_id = ?`, sourceID); err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, p := range patterns {
		if p = strings.TrimSpace(p); p == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO storage_source_exclude_patterns (source_id, pattern, created_at)
  VALUES (?, ?, ?)`, sourceID, p, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Matcher 返回该存储源的排除规则匹配器（含系统强制规则）。
func (s *Service) Matcher(sourceID string) (*security.ExcludeMatcher, error) {
	patterns, err := s.ExcludePatterns(sourceID)
	if err != nil {
		return nil, err
	}
	return security.NewExcludeMatcher(patterns), nil
}

// IsPathExcluded 统一排除规则检查函数（README §11.4）。
// relativePath 必须是 NormalizeRelPath 的输出。
func (s *Service) IsPathExcluded(sourceID, relativePath string) bool {
	m, err := s.Matcher(sourceID)
	if err != nil {
		// 查询失败时按排除处理，宁可拒绝不可泄露。
		return true
	}
	return m.MatchPrefix(relativePath)
}
