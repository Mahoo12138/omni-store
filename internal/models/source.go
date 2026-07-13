package models

import "time"

// 存储源权限级别（README §7.5）。
const (
	PermissionReadOnly  = "read_only"
	PermissionReadWrite = "read_write"
)

// StorageSource 对应 storage_sources 表。
// root_path 只对管理员可见，返回普通用户时必须裁剪。
type StorageSource struct {
	ID                int64     `json:"id"`
	SourceID          string    `json:"source_id"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	RootPath          string    `json:"root_path"`
	IsDisabled        bool      `json:"is_disabled"`
	PublicReadEnabled bool      `json:"public_read_enabled"`
	PublicMountPath   *string   `json:"public_mount_path"`
	WebdavEnabled     bool      `json:"webdav_enabled"`
	ImageBedEnabled   bool      `json:"image_bed_enabled"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// UserSourceView 是普通用户可见的存储源信息（不含 root_path）。
type UserSourceView struct {
	SourceID          string `json:"source_id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	Permission        string `json:"permission"`
	PublicReadEnabled bool   `json:"public_read_enabled"`
	WebdavEnabled     bool   `json:"webdav_enabled"`
	ImageBedEnabled   bool   `json:"image_bed_enabled"`
}

// SourcePermission 对应 user_source_permissions 表。
type SourcePermission struct {
	UserID     int64     `json:"user_id"`
	Username   string    `json:"username"`
	SourceID   string    `json:"source_id"`
	Permission string    `json:"permission"`
	UpdatedAt  time.Time `json:"updated_at"`
}
