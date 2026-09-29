// Package capabilities 实现 Site Capability 单例绑定：
// public_drive / image_bed / static_assets / transfer_center 四项站点服务
// 各自至多绑定一个当前存储源，由管理员统一配置。
package capabilities

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

// Site Capability 标识（与 site_capability_bindings.capability 枚举一致）。
const (
	CapabilityPublicDrive    = "public_drive"
	CapabilityImageBed       = "image_bed"
	CapabilityStaticAssets   = "static_assets"
	CapabilityTransferCenter = "transfer_center"
)

// AllCapabilities 返回全部 Site Capability，顺序固定。
func AllCapabilities() []string {
	return []string{CapabilityPublicDrive, CapabilityImageBed, CapabilityStaticAssets, CapabilityTransferCenter}
}

var (
	// ErrUnknownCapability 未知能力标识。
	ErrUnknownCapability = errors.New("未知的 Site Capability")
	// ErrNotEnabled 能力未开启。
	ErrNotEnabled = errors.New("Site Capability 未开启")
	// ErrUnbound 能力未绑定存储源。
	ErrUnbound = errors.New("Site Capability 未绑定存储源")
	// ErrSourceUnavailable 绑定的存储源不存在或已禁用。
	ErrSourceUnavailable = errors.New("Site Capability 绑定的存储源不可用")
	// ErrRevisionConflict 配置版本冲突，请刷新后重试。
	ErrRevisionConflict = errors.New("配置已被其他人修改")
	// ErrSourceRequired 更新要求提供存储源。
	ErrSourceRequired = errors.New("必须提供存储源")
)

// Binding 是一项 Site Capability 的当前绑定。
type Binding struct {
	Capability      string    `json:"capability"`
	Enabled         bool      `json:"enabled"`
	SourceKey       string    `json:"source_key,omitempty"`
	SourceName      string    `json:"source_name,omitempty"`
	StorageSourceID *int64    `json:"-"`
	Revision        int64     `json:"revision"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Service 提供 Site Capability 绑定读写。
type Service struct {
	db      *sql.DB
	sources sourcesLookup
}

// sourcesLookup 避免循环依赖：只需要按 ID/Key 查询存储源的窄接口。
type sourcesLookup interface {
	GetByID(id int64) (*models.StorageSource, error)
	Get(key string) (*models.StorageSource, error)
}

// NewService 创建 Site Capability 服务。
func NewService(db *sql.DB, sources sourcesLookup) *Service {
	return &Service{db: db, sources: sources}
}

func scanBinding(row interface{ Scan(...any) error }) (*Binding, error) {
	var b Binding
	var sourceID sql.NullInt64
	err := row.Scan(&b.Capability, &b.Enabled, &sourceID, &b.Revision, &b.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUnknownCapability
	}
	if err != nil {
		return nil, err
	}
	if sourceID.Valid {
		b.StorageSourceID = &sourceID.Int64
	}
	return &b, nil
}

const bindingColumns = `capability, enabled, storage_source_id, revision, updated_at`

// GetBinding 返回一项能力的绑定；能力行由迁移保证存在。
func (s *Service) GetBinding(capability string) (*Binding, error) {
	binding, err := scanBinding(s.db.QueryRow(
		`SELECT `+bindingColumns+` FROM site_capability_bindings WHERE capability = ?`, capability))
	if err != nil {
		return nil, err
	}
	return s.fillSource(binding)
}

// ListBindings 返回全部能力绑定。
func (s *Service) ListBindings() ([]*Binding, error) {
	rows, err := s.db.Query(`SELECT ` + bindingColumns + ` FROM site_capability_bindings ORDER BY capability`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*Binding, 0, 4)
	for rows.Next() {
		binding, err := scanBinding(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, binding)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, binding := range out {
		if _, err := s.fillSource(binding); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Service) fillSource(binding *Binding) (*Binding, error) {
	if binding.StorageSourceID == nil {
		return binding, nil
	}
	src, err := s.sources.GetByID(*binding.StorageSourceID)
	if err != nil {
		if errors.Is(err, sources.ErrNotFound) {
			return binding, nil
		}
		return nil, err
	}
	binding.SourceKey = src.Key
	binding.SourceName = src.Name
	return binding, nil
}

// ResolveSource 返回能力当前绑定的可用存储源。
// enabled=false、未绑定或源已禁用时返回对应错误；调用方把入口按未配置处理。
func (s *Service) ResolveSource(capability string) (*models.StorageSource, error) {
	if !isValidCapability(capability) {
		return nil, ErrUnknownCapability
	}
	binding, err := s.GetBinding(capability)
	if err != nil {
		return nil, err
	}
	if !binding.Enabled || binding.StorageSourceID == nil {
		return nil, ErrNotEnabled
	}
	src, err := s.sources.GetByID(*binding.StorageSourceID)
	if err != nil || src.IsDisabled {
		return nil, ErrSourceUnavailable
	}
	return src, nil
}

// UpdateInput 是绑定更新输入。nil 字段保持不变。
type UpdateInput struct {
	Enabled          *bool
	StorageSourceKey *string
	// ExpectedRevision 非负时执行乐观并发检查。
	ExpectedRevision *int64
}

// UpdateBinding 更新能力绑定，成功后 revision 自增。
// 解绑（source_key 为空）时能力自动置为 disabled。
func (s *Service) UpdateBinding(capability string, in UpdateInput) (*Binding, error) {
	if !isValidCapability(capability) {
		return nil, ErrUnknownCapability
	}
	// 单连接池：源解析必须在事务开始前完成，避免事务内等待连接自锁。
	var resolvedSourceID *int64
	if in.StorageSourceKey != nil {
		if *in.StorageSourceKey == "" {
			resolvedSourceID = nil
		} else {
			src, err := s.sources.Get(*in.StorageSourceKey)
			if err != nil {
				return nil, ErrSourceRequired
			}
			resolvedSourceID = &src.ID
		}
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	binding, err := scanBinding(tx.QueryRow(
		`SELECT `+bindingColumns+` FROM site_capability_bindings WHERE capability = ?`, capability))
	if err != nil {
		return nil, err
	}
	if in.ExpectedRevision != nil && *in.ExpectedRevision != binding.Revision {
		return nil, ErrRevisionConflict
	}

	enabled := binding.Enabled
	if in.Enabled != nil {
		enabled = *in.Enabled
	}
	sourceID := binding.StorageSourceID
	if in.StorageSourceKey != nil {
		sourceID = resolvedSourceID
	}
	if enabled && sourceID == nil {
		return nil, ErrSourceRequired
	}
	if sourceID == nil {
		enabled = false
	}

	if _, err := tx.Exec(`UPDATE site_capability_bindings
  SET enabled = ?, storage_source_id = ?, revision = revision + 1, updated_at = ?
  WHERE capability = ?`, enabled, sourceID, time.Now().UTC(), capability); err != nil {
		return nil, fmt.Errorf("更新能力绑定失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetBinding(capability)
}

// BoundCapabilities 返回绑定到指定源的 capability 列表（Source 删除保护用）。
func (s *Service) BoundCapabilities(storageSourceID int64) ([]string, error) {
	rows, err := s.db.Query(`SELECT capability FROM site_capability_bindings
  WHERE storage_source_id = ?`, storageSourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var capability string
		if err := rows.Scan(&capability); err != nil {
			return nil, err
		}
		out = append(out, capability)
	}
	return out, rows.Err()
}

func isValidCapability(capability string) bool {
	switch capability {
	case CapabilityPublicDrive, CapabilityImageBed, CapabilityStaticAssets, CapabilityTransferCenter:
		return true
	}
	return false
}
