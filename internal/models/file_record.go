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

// 台账作用域（file_records.resource_scope）。
// 普通校准、FTS 与用户文件视图只处理 file scope；
// 内部作用域由对应受信任服务写入与维护（ARCHITECTURE §11）。
const (
	FileRecordScopeFile     = "file"
	FileRecordScopeImageBed = "image_bed"
)

// managedScopeDirs 把托管命名空间子目录映射到台账作用域。
var managedScopeDirs = map[string]string{
	"image-bed": FileRecordScopeImageBed,
}

// ManagedScopeLedgerValue 返回托管子目录对应的 resource_scope 值。
func ManagedScopeLedgerValue(scopeDir string) (string, bool) {
	scope, ok := managedScopeDirs[scopeDir]
	return scope, ok
}

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

// TrashEntry 是回收站中的一个顶层文件或目录；内部存储 key 不要求用户理解。
type TrashEntry struct {
	Key                  string    `json:"key"`
	StorageSourceID      int64     `json:"-"`
	SourceKey            string    `json:"source_key"`
	SourceName           string    `json:"source_name"`
	OriginalRelativePath string    `json:"original_path"`
	Name                 string    `json:"name"`
	EntryType            string    `json:"type"`
	FileCount            int64     `json:"file_count"`
	Size                 int64     `json:"size"`
	DeletedByUserID      int64     `json:"-"`
	DeletedAt            time.Time `json:"deleted_at"`
}

// FileSearchItem 是一个来自 active 文件台账的可见搜索结果。
type FileSearchItem struct {
	SourceKey  string    `json:"source_key"`
	SourceName string    `json:"source_name"`
	Path       string    `json:"path"`
	ParentPath string    `json:"parent_path"`
	Name       string    `json:"name"`
	Size       int64     `json:"size"`
	ModifiedAt time.Time `json:"modified_at"`
}

// FileSearchResult 是全局文件搜索的分页结果。
type FileSearchResult struct {
	Items    []*FileSearchItem `json:"items"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Total    int64             `json:"total"`
	HasNext  bool              `json:"has_next"`
}
