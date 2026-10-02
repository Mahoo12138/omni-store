// Package operations 聚合 2.0 运维中心（Epic C）所需的状态与维护动作：
// 系统/数据库/存储源/站点能力健康、缓存与回收站统计、流转活跃用量、
// 最近失败审计；提供一次性清理编排与 SQLite 完整性检查。
package operations

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/imagebed"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/transfers"
)

const multipartMaxAge = 7 * 24 * time.Hour

// Service 聚合各子系统的状态与维护动作。
type Service struct {
	db         *sql.DB
	dbPath     string
	dataDir    string
	version    string
	sources    *sources.Service
	files      *files.Service
	thumbnails *imagebed.Service
	transfers  *transfers.Service
	sessions   *auth.Sessions
	multipart  multipartCleanupFunc
}

// multipartCleanupFunc 是 S3 Multipart 清理的窄函数签名。
type multipartCleanupFunc func(maxAge time.Duration) (uploads, orphans, parts int64, err error)

// NewService 创建运维中心服务。sessions/multipart 可为 nil（对应能力关闭）。
func NewService(db *sql.DB, dbPath, dataDir, version string, sources *sources.Service,
	files *files.Service, thumbnails *imagebed.Service, transfers *transfers.Service,
	sessions *auth.Sessions, multipart multipartCleanupFunc) *Service {
	return &Service{
		db: db, dbPath: dbPath, dataDir: dataDir, version: version,
		sources: sources, files: files, thumbnails: thumbnails, transfers: transfers,
		sessions: sessions, multipart: multipart,
	}
}

// SourceHealth 是单个存储源的健康快照。
type SourceHealth struct {
	Key             string `json:"key"`
	Name            string `json:"name"`
	Disabled        bool   `json:"disabled"`
	RootAccessible  bool   `json:"root_accessible"`
	UsageBytes      int64  `json:"usage_bytes"`
	LedgerBytes     int64  `json:"ledger_bytes"`
	QuotaBytes      int64  `json:"quota_bytes"`
	TrashCount      int64  `json:"trash_count"`
	ActiveTransfers int64  `json:"active_transfers"`
	WebdavEnabled   bool   `json:"webdav_enabled"`
	S3Enabled       bool   `json:"s3_enabled"`
	RootIssue       string `json:"root_issue,omitempty"`
}

// CapabilityHealth 是一项站点能力的健康快照。
type CapabilityHealth struct {
	Capability     string `json:"capability"`
	Enabled        bool   `json:"enabled"`
	SourceKey      string `json:"source_key,omitempty"`
	SourceName     string `json:"source_name,omitempty"`
	SourceDisabled bool   `json:"source_disabled"`
	Detail         string `json:"detail"`
}

// DatabaseHealth 是数据库健康快照。quick_check 每次执行（小库开销可忽略）。
type DatabaseHealth struct {
	SizeBytes  int64            `json:"size_bytes"`
	WALBytes   int64            `json:"wal_bytes"`
	QuickCheck string           `json:"quick_check"`
	TableRows  map[string]int64 `json:"table_rows"`
}

// TransferUsage 是流转中心活跃用量。
type TransferUsage struct {
	ActiveSends       int64 `json:"active_sends"`
	DraftSends        int64 `json:"draft_sends"`
	ActiveCollections int64 `json:"active_collections"`
	PayloadBytes      int64 `json:"payload_bytes"`
	ActiveQuotaBytes  int64 `json:"active_quota_bytes"`
	Sessions          int64 `json:"sessions"`
}

// StorageExtras 是缓存/回收站/Multipart 统计。
type StorageExtras struct {
	ThumbnailCacheBytes int64 `json:"thumbnail_cache_bytes"`
	TrashEntries        int64 `json:"trash_entries"`
	TrashBytes          int64 `json:"trash_bytes"`
	MultipartUploads    int64 `json:"multipart_uploads"`
}

// Status 是运维中心全量状态。
type Status struct {
	Version      string             `json:"version"`
	DataDir      string             `json:"data_dir"`
	GeneratedAt  time.Time          `json:"generated_at"`
	Database     DatabaseHealth     `json:"database"`
	Sources      []SourceHealth     `json:"sources"`
	Capabilities []CapabilityHealth `json:"capabilities"`
	Transfers    TransferUsage      `json:"transfers"`
	Storage      StorageExtras      `json:"storage"`
	RecentFailed []audit.LogEntry   `json:"recent_failed_audits"`
}

// GetStatus 聚合全量状态。任何单源统计失败都以该源的 RootIssue 呈现而不是整体失败。
func (s *Service) GetStatus() (*Status, error) {
	status := &Status{
		Version:      s.version,
		DataDir:      s.dataDir,
		GeneratedAt:  time.Now().UTC(),
		Sources:      []SourceHealth{},
		Capabilities: []CapabilityHealth{},
		Database:     DatabaseHealth{TableRows: map[string]int64{}, QuickCheck: "ok"},
		RecentFailed: []audit.LogEntry{},
	}

	if err := s.fillDatabase(status); err != nil {
		return nil, err
	}
	if err := s.fillSources(status); err != nil {
		return nil, err
	}
	if err := s.fillCapabilities(status); err != nil {
		return nil, err
	}
	if err := s.fillTransfers(status); err != nil {
		return nil, err
	}
	s.fillStorage(status)
	s.fillRecentFailed(status)
	return status, nil
}

func (s *Service) fillDatabase(status *Status) error {
	var pageCount, pageSize int64
	if err := s.db.QueryRow(`PRAGMA page_count`).Scan(&pageCount); err == nil {
		_ = s.db.QueryRow(`PRAGMA page_size`).Scan(&pageSize)
		status.Database.SizeBytes = pageCount * pageSize
	}
	if info, err := os.Stat(s.dbPath + "-wal"); err == nil {
		status.Database.WALBytes = info.Size()
	}
	var quickCheck string
	if err := s.db.QueryRow(`PRAGMA quick_check`).Scan(&quickCheck); err != nil {
		quickCheck = fmt.Sprintf("quick_check 执行失败: %v", err)
	}
	if quickCheck == "" {
		quickCheck = "ok"
	}
	status.Database.QuickCheck = quickCheck
	for _, table := range []string{"users", "storage_sources", "file_records", "images", "transfers", "transfer_collections", "audit_logs"} {
		var count int64
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&count); err == nil {
			status.Database.TableRows[table] = count
		}
	}
	return nil
}

func (s *Service) fillSources(status *Status) error {
	list, err := s.sources.List()
	if err != nil {
		return err
	}
	for _, src := range list {
		health := SourceHealth{
			Key: src.Key, Name: src.Name, Disabled: src.IsDisabled,
			QuotaBytes:    src.QuotaBytes,
			WebdavEnabled: src.WebdavEnabled, S3Enabled: src.S3Enabled,
		}
		root, rootErr := security.ResolveInSource(src.RootPath, "")
		if rootErr == nil {
			if info, statErr := os.Lstat(root); statErr == nil && info.IsDir() {
				health.RootAccessible = true
			} else {
				health.RootIssue = "源根目录不可访问或不是目录"
			}
		} else {
			health.RootIssue = "源根路径解析失败"
		}
		if health.RootAccessible {
			if usage, usageErr := s.files.StorageUsage(src); usageErr == nil {
				health.UsageBytes = usage
			} else {
				health.RootIssue = "物理用量统计失败"
			}
			if ledger, ledgerErr := s.files.LedgerSourceUsage(src.ID); ledgerErr == nil {
				health.LedgerBytes = ledger
			}
		}
		_ = s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(size), 0) FROM trash_entries
  WHERE storage_source_id = ?`, src.ID).Scan(&health.TrashCount, new(int64))
		_ = s.db.QueryRow(`SELECT COUNT(*) FROM transfers
  WHERE storage_source_id = ? AND status IN ('draft', 'active')`, src.ID).Scan(&health.ActiveTransfers)
		_ = s.db.QueryRow(`SELECT COUNT(*) FROM transfer_collections
  WHERE storage_source_id = ? AND status = 'active'`, src.ID).Scan(new(int64))
		status.Sources = append(status.Sources, health)
	}
	return nil
}

func (s *Service) fillCapabilities(status *Status) error {
	rows, err := s.db.Query(`SELECT b.capability, b.enabled, s.key, s.name, s.is_disabled
  FROM site_capability_bindings b
  LEFT JOIN storage_sources s ON s.id = b.storage_source_id
  ORDER BY b.capability`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var health CapabilityHealth
		var sourceKey, sourceName sql.NullString
		var sourceDisabled sql.NullBool
		if err := rows.Scan(&health.Capability, &health.Enabled, &sourceKey, &sourceName, &sourceDisabled); err != nil {
			return err
		}
		switch {
		case !sourceKey.Valid:
			health.Detail = "未绑定存储源"
		case sourceDisabled.Bool:
			health.Detail = "绑定的存储源已禁用"
		case !health.Enabled:
			health.Detail = "已绑定 " + sourceName.String + "，能力关闭"
		default:
			health.Detail = "正常：" + sourceName.String
		}
		health.SourceKey = sourceKey.String
		health.SourceName = sourceName.String
		health.SourceDisabled = sourceDisabled.Bool
		status.Capabilities = append(status.Capabilities, health)
	}
	return rows.Err()
}

func (s *Service) fillTransfers(status *Status) error {
	usage := TransferUsage{}
	if err := s.db.QueryRow(`SELECT
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END),
  SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END),
  COALESCE(SUM(CASE WHEN status IN ('draft', 'active') THEN total_size ELSE 0 END), 0)
  FROM transfers`).Scan(new(sql.NullInt64), new(sql.NullInt64), &usage.PayloadBytes); err != nil {
		return err
	}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM transfer_collections WHERE status = 'active'`).Scan(&usage.ActiveCollections); err != nil {
		return err
	}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM transfer_access_sessions WHERE expires_at > ?`,
		time.Now().UTC()).Scan(&usage.Sessions); err != nil {
		return err
	}
	settings, err := s.transfers.GetSettings()
	if err != nil {
		return err
	}
	usage.ActiveQuotaBytes = settings.ActiveQuotaBytes
	// active 行 COUNT 在空表时为 NULL，上面 Scan 用 NullInt64 忽略；这里补齐零值。
	var active, draft int64
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM transfers WHERE status = 'active'`).Scan(&active)
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM transfers WHERE status = 'draft'`).Scan(&draft)
	usage.ActiveSends = active
	usage.DraftSends = draft
	status.Transfers = usage
	return nil
}

func (s *Service) fillStorage(status *Status) {
	_ = s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(size), 0) FROM trash_entries`).Scan(
		&status.Storage.TrashEntries, &status.Storage.TrashBytes)
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM s3_multipart_uploads`).Scan(&status.Storage.MultipartUploads)
	if s.thumbnails != nil {
		status.Storage.ThumbnailCacheBytes = dirSize(s.thumbnails.ThumbnailCacheDir())
	}
}

func (s *Service) fillRecentFailed(status *Status) {
	logger := audit.New(s.db, false, 0, nil)
	entries, _, err := logger.Query(audit.QueryOptions{Status: audit.StatusFailed, Page: 1, PageSize: 10})
	if err != nil {
		return
	}
	for _, entry := range entries {
		status.RecentFailed = append(status.RecentFailed, *entry)
	}
}

// IntegrityReport 是完整完整性检查结果。
type IntegrityReport struct {
	Integrity    []string `json:"integrity"`
	FKViolations int64    `json:"fk_violations"`
	OK           bool     `json:"ok"`
}

// RunIntegrityCheck 执行 PRAGMA integrity_check 与 foreign_key_check（全量，点按触发）。
func (s *Service) RunIntegrityCheck() (*IntegrityReport, error) {
	report := &IntegrityReport{Integrity: []string{}, OK: true}
	rows, err := s.db.Query(`PRAGMA integrity_check`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return nil, err
		}
		report.Integrity = append(report.Integrity, line)
		if line != "ok" {
			report.OK = false
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(report.Integrity) == 0 {
		report.OK = false
	}
	fkRows, err := s.db.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		return nil, err
	}
	defer fkRows.Close()
	for fkRows.Next() {
		report.FKViolations++
	}
	if err := fkRows.Err(); err != nil {
		return nil, err
	}
	if report.FKViolations > 0 {
		report.OK = false
	}
	return report, nil
}

// CleanupResult 汇总一次清理编排。
type CleanupResult struct {
	WebDAVLocks      int64               `json:"webdav_locks"`
	Sessions         int64               `json:"sessions"`
	MultipartUploads int64               `json:"multipart_uploads"`
	MultipartOrphans int64               `json:"multipart_orphans"`
	Thumbnails       int                 `json:"thumbnails"`
	TransferGC       *transfers.GCResult `json:"transfer_gc"`
}

// RunCleanup 编排全部既定清理：过期锁/会话/Multipart、缩略图缓存、流转 GC。
func (s *Service) RunCleanup(ctx context.Context) (*CleanupResult, error) {
	result := &CleanupResult{TransferGC: &transfers.GCResult{}}
	var joined error

	if n, err := s.files.PersistentLocks().CleanupExpired(ctx); err != nil {
		joined = errors.Join(joined, fmt.Errorf("清理 WebDAV 锁失败: %w", err))
	} else {
		result.WebDAVLocks = n
	}
	if s.sessions != nil {
		if n, err := s.sessions.CleanupExpired(); err != nil {
			joined = errors.Join(joined, fmt.Errorf("清理过期会话失败: %w", err))
		} else {
			result.Sessions = n
		}
	}
	if s.multipart != nil {
		uploads, orphans, _, err := s.multipart(multipartMaxAge)
		if err != nil {
			joined = errors.Join(joined, fmt.Errorf("清理 Multipart 失败: %w", err))
		} else {
			result.MultipartUploads = uploads
			result.MultipartOrphans = orphans
		}
	}
	if s.thumbnails != nil {
		if n, err := s.thumbnails.CleanupThumbnailCache(30 * 24 * time.Hour); err != nil {
			joined = errors.Join(joined, fmt.Errorf("清理缩略图缓存失败: %w", err))
		} else {
			result.Thumbnails = n
		}
	}
	if s.transfers != nil {
		gc, err := s.transfers.RunGC(time.Now().UTC())
		if err != nil {
			joined = errors.Join(joined, fmt.Errorf("流转 GC 失败: %w", err))
		} else {
			result.TransferGC = gc
		}
	}
	return result, joined
}

func dirSize(root string) int64 {
	var total int64
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.Type().IsRegular() {
			if info, infoErr := entry.Info(); infoErr == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return total
}
