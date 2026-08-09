package models

import "time"

const (
	FileOwnerUser      = "user"
	FileOwnerAnonymous = "anonymous"
	FileOwnerSystem    = "system"
	FileOwnerUnowned   = "unowned"

	FileRecordActive = "active"
	FileRecordTrash  = "trash"
)

// FileRecord 是真实普通文件的 SQLite 元数据台账，不保存文件内容。
type FileRecord struct {
	ID              int64     `json:"id"`
	StorageSourceID int64     `json:"storage_source_id"`
	RelativePath    string    `json:"relative_path"`
	Size            int64     `json:"size"`
	OwnerUserID     *int64    `json:"owner_user_id,omitempty"`
	OwnerType       string    `json:"owner_type"`
	CreatedByUserID *int64    `json:"created_by_user_id,omitempty"`
	UpdatedByUserID *int64    `json:"updated_by_user_id,omitempty"`
	MTimeUnixNano   int64     `json:"mtime_unix_nano"`
	RecordStatus    string    `json:"record_status"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ReconcileResult 是一次存储源台账扫描的结果。
type ReconcileResult struct {
	ScannedFiles int64 `json:"scanned_files"`
	Added        int64 `json:"added"`
	Updated      int64 `json:"updated"`
	Removed      int64 `json:"removed"`
	Unowned      int64 `json:"unowned"`
	UsageBytes   int64 `json:"usage_bytes"`
}

// UserQuota 是用户文件所有权用量摘要；quota_bytes=0 表示不限。
type UserQuota struct {
	UsageBytes     int64 `json:"usage_bytes"`
	QuotaBytes     int64 `json:"quota_bytes"`
	RemainingBytes int64 `json:"remaining_bytes"`
	Unlimited      bool  `json:"unlimited"`
}
