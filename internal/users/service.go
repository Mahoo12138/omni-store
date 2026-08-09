// Package users 负责用户管理。
package users

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
)

var (
	// ErrUsernameTaken 用户名已存在。
	ErrUsernameTaken = errors.New("用户名已存在")
	// ErrNotFound 用户不存在。
	ErrNotFound = errors.New("用户不存在")
	// ErrInvalidUsername 用户名格式非法。
	ErrInvalidUsername = errors.New("用户名只允许 3-32 位字母、数字、下划线、短横线")
	// ErrWeakPassword 密码过短。
	ErrWeakPassword = errors.New("密码长度至少 8 位")
	// ErrQuotaInvalid 用户配额不能为负数。
	ErrQuotaInvalid = errors.New("用户配额不能为负数")
	// ErrAlreadyInitialized 首个管理员已由另一请求创建。
	ErrAlreadyInitialized = errors.New("系统已初始化")
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,32}$`)

// Service 提供用户管理能力。
type Service struct {
	db *sql.DB
}

// NewService 创建用户服务。
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// Count 返回用户总数，用于判断是否进入初始化模式。
func (s *Service) Count() (int64, error) {
	var n int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// Create 创建用户。username 创建后不可修改，密码只保存哈希。
func (s *Service) Create(username, displayName, password, role string) (*models.User, error) {
	username, displayName, hash, err := prepareUser(username, displayName, password, role)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	// user_public_id 冲突概率极低，冲突时重试。
	for range 5 {
		publicID := auth.NewPublicID("u")
		res, err := s.db.Exec(`INSERT INTO users
  (user_public_id, username, display_name, password_hash, role, is_disabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
			publicID, username, displayName, hash, role, now, now)
		if err != nil {
			msg := err.Error()
			if strings.Contains(msg, "users.username") {
				return nil, ErrUsernameTaken
			}
			if strings.Contains(msg, "users.user_public_id") {
				continue
			}
			return nil, fmt.Errorf("创建用户失败: %w", err)
		}
		id, _ := res.LastInsertId()
		return s.GetByID(id)
	}
	return nil, fmt.Errorf("生成 user_public_id 失败")
}

// CreateFirstAdmin atomically creates the only user allowed while the users
// table is empty. INSERT ... SELECT keeps the emptiness check and insert in one
// SQLite statement, so concurrent setup requests cannot both win.
func (s *Service) CreateFirstAdmin(username, displayName, password string) (*models.User, error) {
	username, displayName, hash, err := prepareUser(username, displayName, password, models.RoleSuperAdmin)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	for range 5 {
		publicID := auth.NewPublicID("u")
		res, err := s.db.Exec(`INSERT INTO users
  (user_public_id, username, display_name, password_hash, role, is_disabled, created_at, updated_at)
  SELECT ?, ?, ?, ?, ?, 0, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM users)`,
			publicID, username, displayName, hash, models.RoleSuperAdmin, now, now)
		if err != nil {
			if strings.Contains(err.Error(), "users.user_public_id") {
				continue
			}
			return nil, fmt.Errorf("创建首个管理员失败: %w", err)
		}
		rows, err := res.RowsAffected()
		if err != nil {
			return nil, err
		}
		if rows == 0 {
			return nil, ErrAlreadyInitialized
		}
		id, _ := res.LastInsertId()
		return s.GetByID(id)
	}
	return nil, fmt.Errorf("生成 user_public_id 失败")
}

func prepareUser(username, displayName, password, role string) (string, string, string, error) {
	username = strings.TrimSpace(username)
	if !usernameRe.MatchString(username) {
		return "", "", "", ErrInvalidUsername
	}
	if len(password) < 8 {
		return "", "", "", ErrWeakPassword
	}
	if role != models.RoleSuperAdmin && role != models.RoleUser {
		return "", "", "", fmt.Errorf("非法角色: %s", role)
	}
	if displayName = strings.TrimSpace(displayName); displayName == "" {
		displayName = username
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return "", "", "", err
	}
	return username, displayName, hash, nil
}

const userColumns = `id, user_public_id, username, display_name, role, is_disabled, quota_bytes, created_at, updated_at`

func scanUser(row interface{ Scan(...any) error }) (*models.User, error) {
	var u models.User
	err := row.Scan(&u.ID, &u.UserPublicID, &u.Username, &u.DisplayName, &u.Role, &u.IsDisabled, &u.QuotaBytes, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetByID 按内部 ID 查询用户。
func (s *Service) GetByID(id int64) (*models.User, error) {
	return scanUser(s.db.QueryRow(`SELECT `+userColumns+` FROM users WHERE id = ?`, id))
}

// GetByUsername 按登录名查询用户。
func (s *Service) GetByUsername(username string) (*models.User, error) {
	return scanUser(s.db.QueryRow(`SELECT `+userColumns+` FROM users WHERE username = ?`, username))
}

// PasswordHashByUsername 返回用户密码哈希（仅登录校验使用）。
func (s *Service) PasswordHashByUsername(username string) (string, error) {
	var hash string
	err := s.db.QueryRow(`SELECT password_hash FROM users WHERE username = ?`, username).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return hash, err
}

// PasswordHashByID 返回用户密码哈希（修改密码校验旧密码使用）。
func (s *Service) PasswordHashByID(id int64) (string, error) {
	var hash string
	err := s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, id).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return hash, err
}

// List 返回全部用户（MVP 用户量小，不分页）。
func (s *Service) List() ([]*models.User, error) {
	rows, err := s.db.Query(`SELECT ` + userColumns + ` FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// SetDisabled 启用/禁用用户。
func (s *Service) SetDisabled(id int64, disabled bool) error {
	res, err := s.db.Exec(`UPDATE users SET is_disabled = ?, updated_at = ? WHERE id = ?`,
		disabled, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete 删除用户及其关联系统数据（Session、Token、策略绑定、偏好）。
// 不触碰任何真实文件。
func (s *Service) Delete(id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE file_records SET owner_user_id = NULL, owner_type = ?, updated_at = ? WHERE owner_user_id = ?`,
		models.FileOwnerUnowned, time.Now().UTC(), id); err != nil {
		return err
	}
	// 删除账号不删除真实图片。原用户图片继续保留公开地址，并转为无账号
	// 归属的图片，之后可由管理员按匿名/无主图片处理。
	if _, err := tx.Exec(`UPDATE images SET owner_user_id = NULL, owner_type = ? WHERE owner_user_id = ?`,
		models.ImageOwnerAnonymous, id); err != nil {
		return err
	}
	// 审计历史必须保留，但不能继续引用即将删除的用户行。
	if _, err := tx.Exec(`UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = ?`, id); err != nil {
		return err
	}

	for _, q := range []string{
		`DELETE FROM sessions WHERE user_id = ?`,
		`DELETE FROM user_tokens WHERE user_id = ?`,
		`DELETE FROM image_bed_tokens WHERE user_id = ?`,
		`DELETE FROM s3_credentials WHERE owner_user_id = ?`,
		`DELETE FROM user_access_policies WHERE user_id = ?`,
		`DELETE FROM user_preferences WHERE user_id = ?`,
	} {
		if _, err := tx.Exec(q, id); err != nil {
			return err
		}
	}
	res, err := tx.Exec(`DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// SetQuota 设置用户拥有文件的硬配额；0 表示不限。
func (s *Service) SetQuota(id, quotaBytes int64) error {
	if quotaBytes < 0 {
		return ErrQuotaInvalid
	}
	res, err := s.db.Exec(`UPDATE users SET quota_bytes = ?, updated_at = ? WHERE id = ?`, quotaBytes, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateDisplayName 修改展示名。
func (s *Service) UpdateDisplayName(id int64, displayName string) error {
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return fmt.Errorf("显示名不能为空")
	}
	res, err := s.db.Exec(`UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`,
		displayName, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdatePassword 修改密码（调用方负责旧密码校验）。
func (s *Service) UpdatePassword(id int64, newPassword string) error {
	if len(newPassword) < 8 {
		return ErrWeakPassword
	}
	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}
	res, err := s.db.Exec(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
		hash, time.Now().UTC(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// CountAdmins 返回未禁用的超级管理员数量。
func (s *Service) CountAdmins() (int64, error) {
	var n int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = ? AND is_disabled = 0`,
		models.RoleSuperAdmin).Scan(&n)
	return n, err
}
