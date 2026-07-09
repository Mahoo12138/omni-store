package sources

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/omni-store/omnistore/internal/models"
)

// --- 用户权限绑定（README §7.5，统一权限函数 §23） ---

// SetPermission 分配或更新用户对存储源的权限。
func (s *Service) SetPermission(userID int64, sourceID, permission string) error {
	if permission != models.PermissionReadOnly && permission != models.PermissionReadWrite {
		return fmt.Errorf("非法权限级别: %s", permission)
	}
	if _, err := s.Get(sourceID); err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO user_source_permissions (user_id, source_id, permission, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id, source_id) DO UPDATE SET permission = excluded.permission, updated_at = excluded.updated_at`,
		userID, sourceID, permission, now, now)
	return err
}

// RemovePermission 取消用户对存储源的权限。
func (s *Service) RemovePermission(userID int64, sourceID string) error {
	_, err := s.db.Exec(`DELETE FROM user_source_permissions WHERE user_id = ? AND source_id = ?`,
		userID, sourceID)
	return err
}

// PermissionsOfSource 返回某存储源的全部用户权限。
func (s *Service) PermissionsOfSource(sourceID string) ([]*models.SourcePermission, error) {
	rows, err := s.db.Query(`SELECT p.user_id, u.username, p.source_id, p.permission, p.updated_at
  FROM user_source_permissions p JOIN users u ON u.id = p.user_id
  WHERE p.source_id = ? ORDER BY p.user_id`, sourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.SourcePermission{}
	for rows.Next() {
		var p models.SourcePermission
		if err := rows.Scan(&p.UserID, &p.Username, &p.SourceID, &p.Permission, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}

// permissionOf 返回用户对存储源的权限级别；超级管理员隐式拥有读写权限。
// 返回空字符串表示无权限。
func (s *Service) permissionOf(user *models.User, sourceID string) (string, error) {
	if user.IsAdmin() {
		return models.PermissionReadWrite, nil
	}
	var perm string
	err := s.db.QueryRow(`SELECT permission FROM user_source_permissions
  WHERE user_id = ? AND source_id = ?`, user.ID, sourceID).Scan(&perm)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return perm, err
}

// CanReadSource 统一读权限检查（README §23）。要求存储源存在且未禁用。
func (s *Service) CanReadSource(user *models.User, sourceID string) (bool, error) {
	src, err := s.Get(sourceID)
	if err != nil {
		return false, err
	}
	if src.IsDisabled {
		return false, nil
	}
	perm, err := s.permissionOf(user, sourceID)
	if err != nil {
		return false, err
	}
	return perm == models.PermissionReadOnly || perm == models.PermissionReadWrite, nil
}

// CanWriteSource 统一写权限检查（README §23）。要求存储源存在且未禁用。
func (s *Service) CanWriteSource(user *models.User, sourceID string) (bool, error) {
	src, err := s.Get(sourceID)
	if err != nil {
		return false, err
	}
	if src.IsDisabled {
		return false, nil
	}
	perm, err := s.permissionOf(user, sourceID)
	if err != nil {
		return false, err
	}
	return perm == models.PermissionReadWrite, nil
}

// ListForUser 返回用户可访问的存储源视图（不含 root_path）。
// 超级管理员可见全部未禁用存储源（隐式读写）。
func (s *Service) ListForUser(user *models.User) ([]*models.UserSourceView, error) {
	if user.IsAdmin() {
		all, err := s.List()
		if err != nil {
			return nil, err
		}
		out := []*models.UserSourceView{}
		for _, src := range all {
			if src.IsDisabled {
				continue
			}
			out = append(out, &models.UserSourceView{
				SourceID: src.SourceID, Name: src.Name, Description: src.Description,
				Permission:    models.PermissionReadWrite,
				WebdavEnabled: src.WebdavEnabled, ImageBedEnabled: src.ImageBedEnabled,
			})
		}
		return out, nil
	}

	rows, err := s.db.Query(`SELECT s.source_id, s.name, s.description, p.permission, s.webdav_enabled, s.image_bed_enabled
  FROM user_source_permissions p JOIN storage_sources s ON s.source_id = p.source_id
  WHERE p.user_id = ? AND s.is_disabled = 0 ORDER BY s.id`, user.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*models.UserSourceView{}
	for rows.Next() {
		var v models.UserSourceView
		var desc sql.NullString
		if err := rows.Scan(&v.SourceID, &v.Name, &desc, &v.Permission, &v.WebdavEnabled, &v.ImageBedEnabled); err != nil {
			return nil, err
		}
		v.Description = desc.String
		out = append(out, &v)
	}
	return out, rows.Err()
}
