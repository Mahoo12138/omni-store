// Package staticassets 实现 2.0 静态资源托管：
// 每个存储源独立配置匿名只读 HTTP，固定公开标识 /assets/{public_asset_id}/{path}，
// 普通文件直接公开读取，不依赖公开盘、Share 或 images 台账。
// 设计契约见 docs/design/static-assets.md 与 docs/design/public-content-http.md。
package staticassets

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

// 缓存档位与跨域档位（public-content-http §3/§4）。
const (
	CacheShort   = "short"
	CacheNoCache = "no-cache"
	CacheLong    = "long"

	CorsNone      = "none"
	CorsPublic    = "public"
	CorsAllowlist = "allowlist"
)

var (
	ErrDisableRequired = errors.New("请先关闭静态 HTTP 访问，再移除配置")
	// ErrNotConfigured 尚未配置发布空间。
	ErrNotConfigured = errors.New("静态资源尚未配置发布空间")
	// ErrAlreadyConfigured 已存在发布空间；更换 source/root 必须走 rebind。
	ErrAlreadyConfigured = errors.New("静态资源已配置，更换发布空间必须走重绑流程")
	// ErrTargetConfigured 跨源重绑不得覆盖目标已有的独立发布空间。
	ErrTargetConfigured = errors.New("目标存储源已有静态访问配置，不能覆盖")
	// ErrRebindRequired 普通 PUT 不允许静默更换发布空间（409 STATIC_REBIND_REQUIRED）。
	ErrRebindRequired = errors.New("更换发布空间必须使用专用重绑操作")
	// ErrRebindModeInvalid 重绑模式必须是 reset 或 relocate。
	ErrRebindModeInvalid = errors.New("重绑模式必须是 reset 或 relocate")
	// ErrRelocateUnconfirmed relocate 必须显式确认同一批数据已核验。
	ErrRelocateUnconfirmed = errors.New("relocate 必须确认同一批内容已迁移并核验")
	// ErrAssetIDMismatch 公开标识不匹配；不提供内容。
	ErrAssetIDMismatch = errors.New("公开标识不匹配")
	// ErrPublishRootInvalid 发布根非法（保留段/越界/不存在等）。
	ErrPublishRootInvalid = errors.New("发布目录非法")
	// ErrRootConfirmRequired 发布源根目录必须显式确认。
	ErrRootConfirmRequired = errors.New("发布根为存储源根目录，必须显式确认")
	// ErrTypeNotAllowed 类型不在公开允许范围。
	ErrTypeNotAllowed = errors.New("类型不在公开允许范围")
	// ErrRevisionConflict 配置版本冲突。
	ErrRevisionConflict = errors.New("静态资源配置已被其他人修改")
)

// configMu 保护配置变更及打开文件的短临界区；下载使用已打开文件。
var configMu sync.RWMutex

// Config 是静态资源配置的一致性快照。
type Config struct {
	Enabled        bool      `json:"enabled"`
	SourceKey      string    `json:"source_key"`
	SourceName     string    `json:"source_name"`
	SourceDisabled bool      `json:"source_disabled"`
	PublishRoot    string    `json:"publish_root"`
	PublicAssetID  string    `json:"public_asset_id"`
	PublicOrigin   string    `json:"public_origin"`
	BaseURL        string    `json:"base_url"`
	CacheMode      string    `json:"cache_mode"`
	CorsMode       string    `json:"cors_mode"`
	AllowedOrigins []string  `json:"allowed_origins"`
	Revision       int64     `json:"revision"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// Configured 区分"已配置发布空间"与仅开关状态。
func (c *Config) Configured() bool {
	return c.PublicAssetID != "" && c.SourceKey != ""
}

type sourcesLookup interface {
	Get(key string) (*models.StorageSource, error)
	GetByID(id int64) (*models.StorageSource, error)
	Matcher(id int64) (*security.ExcludeMatcher, error)
}

// Service 提供静态资源配置与解析。
type Service struct {
	db          *sql.DB
	sources     sourcesLookup
	files       *files.Service
	instanceURL string // 受信任实例公开 origin（public_origin 未设置时使用）
}

// NewService 创建静态资源服务。instanceURL 是受信任的实例公开 origin（可空）。
func NewService(db *sql.DB, sources sourcesLookup, fileSvc *files.Service, instanceURL string) *Service {
	return &Service{db: db, sources: sources, files: fileSvc, instanceURL: strings.TrimRight(instanceURL, "/")}
}

// 一条 SQL 读取源状态、配置与 CORS 白名单，避免请求途中混用不同版本。
const snapshotQuery = `SELECT src.id, src.key, src.name, src.is_disabled,
  COALESCE(a.enabled, 0), COALESCE(a.revision, 0), src.updated_at, a.updated_at,
  COALESCE(a.publish_root, ''), COALESCE(a.public_asset_id, ''), COALESCE(a.public_origin, ''),
  COALESCE(a.cache_mode, 'short'), COALESCE(a.cors_mode, 'public'),
  (SELECT json_group_array(origin) FROM
    (SELECT origin FROM source_static_origins WHERE storage_source_id = src.id ORDER BY origin))
FROM storage_sources src LEFT JOIN source_static_access a ON a.storage_source_id = src.id
`

type snapshot struct {
	enabled        bool
	sourceID       int64
	sourceKey      string
	sourceName     string
	sourceDisabled bool
	revision       int64
	updatedAt      time.Time
	publishRoot    string
	publicAssetID  string
	publicOrigin   string
	cacheMode      string
	corsMode       string
	allowedOrigins []string
}

func (s *Service) loadSnapshot(where string, value string) (*snapshot, error) {
	var snap snapshot
	var originsJSON string
	var configuredAt sql.NullTime
	err := s.db.QueryRow(snapshotQuery+where, value).Scan(
		&snap.sourceID, &snap.sourceKey, &snap.sourceName, &snap.sourceDisabled,
		&snap.enabled, &snap.revision, &snap.updatedAt, &configuredAt,
		&snap.publishRoot, &snap.publicAssetID, &snap.publicOrigin,
		&snap.cacheMode, &snap.corsMode, &originsJSON)
	if err != nil {
		return nil, err
	}
	if configuredAt.Valid {
		snap.updatedAt = configuredAt.Time
	}
	if err := json.Unmarshal([]byte(originsJSON), &snap.allowedOrigins); err != nil {
		return nil, err
	}
	return &snap, nil
}

// Config 返回指定存储源的配置；未配置的源默认关闭。
func (s *Service) Config(sourceKey string) (*Config, error) {
	snap, err := s.loadSnapshot("WHERE src.key = ?", sourceKey)
	if err != nil {
		return nil, err
	}
	return s.view(snap), nil
}

func (s *Service) view(snap *snapshot) *Config {
	return &Config{
		Enabled: snap.enabled, SourceKey: snap.sourceKey, SourceName: snap.sourceName,
		SourceDisabled: snap.sourceDisabled, PublishRoot: snap.publishRoot,
		PublicAssetID: snap.publicAssetID, PublicOrigin: snap.publicOrigin,
		CacheMode: snap.cacheMode, CorsMode: snap.corsMode, AllowedOrigins: snap.allowedOrigins,
		Revision: snap.revision, UpdatedAt: snap.updatedAt,
		BaseURL: s.BaseURL(snap.publicOrigin, snap.publicAssetID),
	}
}

// BaseURL 计算对外资源根：public_origin + /assets/{id}/，末尾固定有 /。
func (s *Service) BaseURL(publicOrigin, assetID string) string {
	origin := publicOrigin
	if origin == "" {
		origin = s.instanceURL
	}
	if origin == "" || assetID == "" {
		return ""
	}
	return strings.TrimRight(origin, "/") + "/assets/" + assetID + "/"
}

// NormalizePublicOrigin 校验可选的对外 origin：仅 scheme://host[:port]，不含
// userinfo/path/query/fragment（design/static-assets.md §5）。
func NormalizePublicOrigin(input string) (string, error) {
	origin := strings.TrimSpace(input)
	if origin == "" {
		return "", nil
	}
	if !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
		return "", fmt.Errorf("public_origin 必须以 http:// 或 https:// 开头")
	}
	if strings.ContainsAny(origin, "/?#") {
		trimmed := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
		if strings.ContainsAny(trimmed, "/?#") {
			return "", fmt.Errorf("public_origin 不允许包含路径、查询或片段")
		}
	}
	if strings.Contains(origin, "@") {
		return "", fmt.Errorf("public_origin 不允许包含 userinfo")
	}
	return strings.TrimRight(origin, "/"), nil
}

// normalizePublishRoot 校验发布目录：规范化的源内相对目录，不以 / 起止；
// 拒绝 `.omnistore` 任意后代与临时保留名称。
func normalizePublishRoot(input string) (string, error) {
	root, err := security.NormalizeRelPath(input)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrPublishRootInvalid, err)
	}
	if err := security.ValidateUserRelPath(root); err != nil {
		return "", fmt.Errorf("%w: %v", ErrPublishRootInvalid, err)
	}
	return root, nil
}

// validateCacheCorsMode 校验档位取值。
func validateModes(cacheMode, corsMode string) error {
	switch cacheMode {
	case CacheShort, CacheNoCache, CacheLong:
	default:
		return fmt.Errorf("cache_mode 必须是 short / no-cache / long")
	}
	switch corsMode {
	case CorsNone, CorsPublic, CorsAllowlist:
	default:
		return fmt.Errorf("cors_mode 必须是 none / public / allowlist")
	}
	return nil
}

// normalizeOriginList 校验白名单：完整 origin，去重排序，不匹配任意后缀。
func normalizeOriginList(inputs []string) ([]string, error) {
	out := make([]string, 0, len(inputs))
	seen := map[string]struct{}{}
	for _, input := range inputs {
		origin, err := NormalizePublicOrigin(input)
		if err != nil {
			return nil, fmt.Errorf("allowed_origins: %v", err)
		}
		if origin == "" {
			continue
		}
		if _, dup := seen[origin]; dup {
			continue
		}
		seen[origin] = struct{}{}
		out = append(out, origin)
	}
	return out, nil
}

// GenerateAssetID 生成 ast- 前缀的 128-bit 随机公开标识（非凭据）。
func GenerateAssetID() string {
	return "ast-" + auth.NewRandomToken("", 16)
}
