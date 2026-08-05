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
	Key               string    `json:"key"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	RootPath          string    `json:"root_path"`
	IsDisabled        bool      `json:"is_disabled"`
	PublicReadEnabled bool      `json:"public_read_enabled"`
	PublicMountPath   *string   `json:"public_mount_path"`
	WebdavEnabled     bool      `json:"webdav_enabled"`
	ImageBedEnabled   bool      `json:"image_bed_enabled"`
	QuotaBytes        int64     `json:"quota_bytes"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// UserSourceView 是普通用户可见的存储源信息（不含 root_path）。
type UserSourceView struct {
	Key               string `json:"key"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	Permission        string `json:"permission"`
	PublicReadEnabled bool   `json:"public_read_enabled"`
	PublicMountPath   string `json:"public_mount_path,omitempty"`
	WebdavEnabled     bool   `json:"webdav_enabled"`
	ImageBedEnabled   bool   `json:"image_bed_enabled"`
	QuotaBytes        int64  `json:"quota_bytes"`
}

// StorageQuota 是存储源实时用量和硬配额摘要；quota_bytes 为 0 表示不限制。
type StorageQuota struct {
	UsageBytes     int64 `json:"usage_bytes"`
	QuotaBytes     int64 `json:"quota_bytes"`
	RemainingBytes int64 `json:"remaining_bytes"`
	Unlimited      bool  `json:"unlimited"`
}

// AccessPolicy 是一组可复用的存储源访问规则。
type AccessPolicy struct {
	ID          int64                     `json:"id"`
	Key         string                    `json:"key"`
	Name        string                    `json:"name"`
	Description string                    `json:"description"`
	Sources     []AccessPolicySourceRule  `json:"sources"`
	Users       []AccessPolicyUserBinding `json:"users"`
	CreatedAt   time.Time                 `json:"created_at"`
	UpdatedAt   time.Time                 `json:"updated_at"`
}

// AccessPolicySourceRule 是策略内的一条存储源权限规则。
type AccessPolicySourceRule struct {
	SourceKey  string                 `json:"source_key"`
	SourceName string                 `json:"source_name"`
	Permission string                 `json:"permission"`
	PathRules  []AccessPolicyPathRule `json:"path_rules"`
}

// AccessPolicyPathRule 用最长前缀匹配覆盖同一策略内的源级默认权限。
type AccessPolicyPathRule struct {
	PathPrefix string `json:"path_prefix"`
	Permission string `json:"permission"`
}

// AccessPolicyUserBinding 是策略绑定的用户摘要。
type AccessPolicyUserBinding struct {
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}
