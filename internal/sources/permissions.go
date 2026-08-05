package sources

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
)

var (
	ErrPolicyNotFound = errors.New("访问策略不存在")
	ErrPolicyName     = errors.New("访问策略名称不能为空")
)

// PolicySourceInput 是访问策略内的一条存储源授权规则。
type PolicySourceInput struct {
	SourceKey  string `json:"source_key"`
	Permission string `json:"permission"`
}

// PolicyInput 以整体替换语义创建或更新访问策略。
type PolicyInput struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Sources     []PolicySourceInput `json:"sources"`
	UserIDs     []int64             `json:"user_ids"`
}

// CreatePolicy 创建访问策略，并在同一事务内写入存储源规则和用户绑定。
func (s *Service) CreatePolicy(in PolicyInput) (*models.AccessPolicy, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, ErrPolicyName
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	now := time.Now().UTC()
	var key string
	var result sql.Result
	for attempt := 0; attempt < 5; attempt++ {
		key = auth.NewRandomToken("pol-", 8)
		result, err = tx.Exec(`INSERT INTO access_policies
  (key, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
			key, in.Name, strings.TrimSpace(in.Description), now, now)
		if err == nil || !strings.Contains(err.Error(), "access_policies.key") {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("创建访问策略失败: %w", err)
	}
	policyID, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	if err := replacePolicyBindings(tx, policyID, in, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetPolicy(key)
}

// UpdatePolicy 整体替换策略基本信息、存储源规则和用户绑定。
func (s *Service) UpdatePolicy(key string, in PolicyInput) (*models.AccessPolicy, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, ErrPolicyName
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var policyID int64
	if err := tx.QueryRow(`SELECT id FROM access_policies WHERE key = ?`, key).Scan(&policyID); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPolicyNotFound
	} else if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if _, err := tx.Exec(`UPDATE access_policies SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
		in.Name, strings.TrimSpace(in.Description), now, policyID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM access_policy_sources WHERE policy_id = ?`, policyID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM user_access_policies WHERE policy_id = ?`, policyID); err != nil {
		return nil, err
	}
	if err := replacePolicyBindings(tx, policyID, in, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetPolicy(key)
}

func replacePolicyBindings(tx *sql.Tx, policyID int64, in PolicyInput, now time.Time) error {
	seenSources := make(map[string]struct{}, len(in.Sources))
	for _, rule := range in.Sources {
		rule.SourceKey = strings.TrimSpace(rule.SourceKey)
		if rule.SourceKey == "" {
			return fmt.Errorf("存储源不能为空")
		}
		if rule.Permission != models.PermissionReadOnly && rule.Permission != models.PermissionReadWrite {
			return fmt.Errorf("非法权限级别: %s", rule.Permission)
		}
		if _, exists := seenSources[rule.SourceKey]; exists {
			return fmt.Errorf("存储源规则重复")
		}
		seenSources[rule.SourceKey] = struct{}{}
		var sourceID int64
		if err := tx.QueryRow(`SELECT id FROM storage_sources WHERE key = ?`, rule.SourceKey).Scan(&sourceID); errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO access_policy_sources
  (policy_id, storage_source_id, permission, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
			policyID, sourceID, rule.Permission, now, now); err != nil {
			return err
		}
	}

	seenUsers := make(map[int64]struct{}, len(in.UserIDs))
	for _, userID := range in.UserIDs {
		if userID <= 0 {
			return fmt.Errorf("非法用户 ID")
		}
		if _, exists := seenUsers[userID]; exists {
			continue
		}
		seenUsers[userID] = struct{}{}
		var exists int
		if err := tx.QueryRow(`SELECT 1 FROM users WHERE id = ?`, userID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("用户不存在")
		} else if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO user_access_policies (user_id, policy_id, created_at)
  VALUES (?, ?, ?)`, userID, policyID, now); err != nil {
			return err
		}
	}
	return nil
}

// DeletePolicy 删除策略及其全部规则和用户绑定。
func (s *Service) DeletePolicy(key string) error {
	result, err := s.db.Exec(`DELETE FROM access_policies WHERE key = ?`, key)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return ErrPolicyNotFound
	}
	return nil
}

// GetPolicy 返回一条完整策略。
func (s *Service) GetPolicy(key string) (*models.AccessPolicy, error) {
	var policy models.AccessPolicy
	var description sql.NullString
	err := s.db.QueryRow(`SELECT id, key, name, description, created_at, updated_at
  FROM access_policies WHERE key = ?`, key).Scan(
		&policy.ID, &policy.Key, &policy.Name, &description, &policy.CreatedAt, &policy.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPolicyNotFound
	}
	if err != nil {
		return nil, err
	}
	policy.Description = description.String
	if err := s.loadPolicyBindings(&policy); err != nil {
		return nil, err
	}
	return &policy, nil
}

// ListPolicies 返回完整策略列表。
func (s *Service) ListPolicies() ([]*models.AccessPolicy, error) {
	rows, err := s.db.Query(`SELECT key FROM access_policies ORDER BY id`)
	if err != nil {
		return nil, err
	}
	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			rows.Close()
			return nil, err
		}
		keys = append(keys, key)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	policies := make([]*models.AccessPolicy, 0, len(keys))
	for _, key := range keys {
		policy, err := s.GetPolicy(key)
		if err != nil {
			return nil, err
		}
		policies = append(policies, policy)
	}
	return policies, nil
}

func (s *Service) loadPolicyBindings(policy *models.AccessPolicy) error {
	policy.Sources = []models.AccessPolicySourceRule{}
	policy.Users = []models.AccessPolicyUserBinding{}
	rows, err := s.db.Query(`SELECT s.key, s.name, ps.permission
  FROM access_policy_sources ps JOIN storage_sources s ON s.id = ps.storage_source_id
  WHERE ps.policy_id = ? ORDER BY s.id`, policy.ID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var rule models.AccessPolicySourceRule
		if err := rows.Scan(&rule.SourceKey, &rule.SourceName, &rule.Permission); err != nil {
			rows.Close()
			return err
		}
		policy.Sources = append(policy.Sources, rule)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows, err = s.db.Query(`SELECT u.id, u.username, u.display_name
  FROM user_access_policies up JOIN users u ON u.id = up.user_id
  WHERE up.policy_id = ? ORDER BY u.id`, policy.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var user models.AccessPolicyUserBinding
		if err := rows.Scan(&user.UserID, &user.Username, &user.DisplayName); err != nil {
			return err
		}
		policy.Users = append(policy.Users, user)
	}
	return rows.Err()
}

// permissionOf 返回用户从全部访问策略合并得到的权限；超级管理员隐式拥有读写权限。
func (s *Service) permissionOf(user *models.User, storageSourceID int64) (string, error) {
	if user.IsAdmin() {
		return models.PermissionReadWrite, nil
	}
	var level sql.NullInt64
	err := s.db.QueryRow(`SELECT MAX(CASE ps.permission WHEN 'read_write' THEN 2 WHEN 'read_only' THEN 1 ELSE 0 END)
  FROM user_access_policies up
  JOIN access_policy_sources ps ON ps.policy_id = up.policy_id
  WHERE up.user_id = ? AND ps.storage_source_id = ?`, user.ID, storageSourceID).Scan(&level)
	if err != nil {
		return "", err
	}
	if !level.Valid || level.Int64 == 0 {
		return "", nil
	}
	if level.Int64 == 2 {
		return models.PermissionReadWrite, nil
	}
	return models.PermissionReadOnly, nil
}

// CanReadSource 要求存储源存在、未禁用且至少有一个策略授予读取权限。
func (s *Service) CanReadSource(user *models.User, sourceKey string) (bool, error) {
	src, err := s.Get(sourceKey)
	if err != nil {
		return false, err
	}
	if src.IsDisabled {
		return false, nil
	}
	permission, err := s.permissionOf(user, src.ID)
	if err != nil {
		return false, err
	}
	return permission == models.PermissionReadOnly || permission == models.PermissionReadWrite, nil
}

// CanWriteSource 要求存储源存在、未禁用且至少有一个策略授予写入权限。
func (s *Service) CanWriteSource(user *models.User, sourceKey string) (bool, error) {
	src, err := s.Get(sourceKey)
	if err != nil {
		return false, err
	}
	if src.IsDisabled {
		return false, nil
	}
	permission, err := s.permissionOf(user, src.ID)
	if err != nil {
		return false, err
	}
	return permission == models.PermissionReadWrite, nil
}

// ListForUser 返回用户从全部策略合并后可访问的存储源视图。
func (s *Service) ListForUser(user *models.User) ([]*models.UserSourceView, error) {
	if user.IsAdmin() {
		all, err := s.List()
		if err != nil {
			return nil, err
		}
		out := []*models.UserSourceView{}
		for _, source := range all {
			if source.IsDisabled {
				continue
			}
			mount := ""
			if source.PublicMountPath != nil {
				mount = *source.PublicMountPath
			}
			out = append(out, &models.UserSourceView{
				Key: source.Key, Name: source.Name, Description: source.Description,
				Permission: models.PermissionReadWrite, PublicReadEnabled: source.PublicReadEnabled,
				PublicMountPath: mount, WebdavEnabled: source.WebdavEnabled, ImageBedEnabled: source.ImageBedEnabled,
			})
		}
		return out, nil
	}

	rows, err := s.db.Query(`SELECT s.key, s.name, s.description,
  CASE MAX(CASE ps.permission WHEN 'read_write' THEN 2 ELSE 1 END)
    WHEN 2 THEN 'read_write' ELSE 'read_only' END,
  s.public_read_enabled, COALESCE(s.public_mount_path, ''), s.webdav_enabled, s.image_bed_enabled
  FROM user_access_policies up
  JOIN access_policy_sources ps ON ps.policy_id = up.policy_id
  JOIN storage_sources s ON s.id = ps.storage_source_id
  WHERE up.user_id = ? AND s.is_disabled = 0
  GROUP BY s.id
  ORDER BY s.id`, user.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.UserSourceView{}
	for rows.Next() {
		var view models.UserSourceView
		var description sql.NullString
		if err := rows.Scan(&view.Key, &view.Name, &description, &view.Permission,
			&view.PublicReadEnabled, &view.PublicMountPath, &view.WebdavEnabled, &view.ImageBedEnabled); err != nil {
			return nil, err
		}
		view.Description = description.String
		out = append(out, &view)
	}
	return out, rows.Err()
}
