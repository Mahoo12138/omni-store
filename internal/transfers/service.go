// Package transfers 实现 2.0 文件流转中心（Transfer Center）。
// 独立 domain：不写 file_records 普通台账、不复用 Share 业务状态；
// 载荷保存在绑定源根的 `.omnistore/transfer/send|collect/` 托管命名空间内，
// 物理用量照常计入存储源硬配额，活跃载荷受独立 Transfer 配额约束。
// 设计依据：ROADMAP Epic B、ARCHITECTURE §4/§8、design/managed-namespace.md §5。
package transfers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math/big"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/managedroot"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

// 托管命名空间布局与设置键。
const (
	ManagedScopeDir           = "transfer"
	sendDir                   = "send"
	collectDir                = "collect"
	SettingActiveQuotaBytes   = "transfer_active_quota_bytes"
	SettingDefaultExpiryHours = "transfer_default_expiry_hours"

	// pickupCodeBytes 决定取件码熵；字母表去掉易混字符。
	pickupCodeLength   = 8
	pickupCodeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

	// draftStaleAfter 后未定稿的草稿连同载荷被 GC 整体清理。
	draftStaleAfter = 24 * time.Hour
	// sessionTTL 是公开访问会话的有效期（不超过任务自身有效期）。
	sessionTTL = 12 * time.Hour
	// orphanDirAfter 后无台账的提交目录被 GC 清理（写入中断的残余）。
	orphanDirAfter = time.Hour
)

// Send/Collect 状态机的可转移状态。expired 是 GC 写入的终态（读取侧按 expires_at 派生）。
var (
	ErrNotFound          = errors.New("流转任务不存在")
	ErrExpired           = errors.New("流转任务已过期")
	ErrRevoked           = errors.New("流转任务已撤销")
	ErrClosed            = errors.New("收集任务已关闭")
	ErrNotDraft          = errors.New("流转任务不是草稿，不能继续添加文件")
	ErrNoFiles           = errors.New("交付包还没有文件，不能定稿")
	ErrPickupCode        = errors.New("取件码不正确")
	ErrPassword          = errors.New("密码不正确")
	ErrDownloadLimit     = errors.New("下载次数已达上限")
	ErrQuotaExceeded     = errors.New("流转中心可用空间不足")
	ErrFileSizeExceeded  = errors.New("单个文件超过本次收集的大小上限")
	ErrTotalSizeExceeded = errors.New("超过本次收集的总量上限")
	ErrTypeNotAllowed    = errors.New("文件类型不在本次收集允许的范围")
	ErrNameRequired      = errors.New("请填写提交者姓名")
	ErrNoteRequired      = errors.New("请填写备注")
	ErrSettingsInvalid   = errors.New("流转中心设置非法")
	ErrConflictState     = errors.New("流转任务状态不允许该操作")
)

// capabilitiesLookup 是流转中心需要的 Site Capability 窄接口。
type capabilitiesLookup interface {
	ResolveSource(capability string) (*models.StorageSource, error)
}

// Service 提供流转中心能力。
type Service struct {
	db           *sql.DB
	sources      *sources.Service
	capabilities capabilitiesLookup
	files        *files.Service
	managedRoots *managedroot.Service
	masterKey    []byte
	dataDir      string
}

// NewService 创建流转中心服务。masterKey 用于取件码/收件码的 HMAC 摘要；
// dataDir 存放上传崩溃日志。
func NewService(db *sql.DB, sources *sources.Service, capSvc capabilitiesLookup, fileSvc *files.Service, dataDir, masterKey string) *Service {
	return &Service{
		db: db, sources: sources, capabilities: capSvc, files: fileSvc,
		managedRoots: managedroot.NewService(db),
		masterKey:    []byte(masterKey),
		dataDir:      dataDir,
	}
}

// --- 设置 ---

// Settings 是流转中心的全局设置。
type Settings struct {
	// ActiveQuotaBytes 是活跃载荷总量上限；0 = 不限制。
	ActiveQuotaBytes int64 `json:"active_quota_bytes"`
	// DefaultExpiryHours 是创建任务未显式指定时的默认有效期；0 = 默认永不过期。
	DefaultExpiryHours int64 `json:"default_expiry_hours"`
}

// GetSettings 读取流转中心设置。
func (s *Service) GetSettings() (*Settings, error) {
	out := &Settings{}
	rows, err := s.db.Query(`SELECT key, value FROM system_settings WHERE key IN (?, ?)`,
		SettingActiveQuotaBytes, SettingDefaultExpiryHours)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		parsed, parseErr := parseInt64(value)
		if parseErr != nil || parsed < 0 {
			continue
		}
		switch key {
		case SettingActiveQuotaBytes:
			out.ActiveQuotaBytes = parsed
		case SettingDefaultExpiryHours:
			out.DefaultExpiryHours = parsed
		}
	}
	return out, rows.Err()
}

// SetSettings 更新流转中心设置。
func (s *Service) SetSettings(in Settings) error {
	if in.ActiveQuotaBytes < 0 || in.DefaultExpiryHours < 0 {
		return ErrSettingsInvalid
	}
	now := time.Now().UTC()
	set := func(key string, value int64) error {
		_, err := s.db.Exec(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			key, fmt.Sprintf("%d", value), now)
		return err
	}
	if err := set(SettingActiveQuotaBytes, in.ActiveQuotaBytes); err != nil {
		return err
	}
	return set(SettingDefaultExpiryHours, in.DefaultExpiryHours)
}

// activeQuotaRemaining 返回活跃配额剩余字节数；unlimited 表示未设上限。
func (s *Service) activeQuotaRemaining() (int64, bool, error) {
	settings, err := s.GetSettings()
	if err != nil {
		return 0, false, err
	}
	if settings.ActiveQuotaBytes <= 0 {
		return 0, true, nil
	}
	var live int64
	if err := s.db.QueryRow(`SELECT
  (SELECT COALESCE(SUM(total_size), 0) FROM transfers WHERE status IN ('draft', 'active')) +
  (SELECT COALESCE(SUM(total_size), 0) FROM transfer_collections WHERE status = 'active')`).Scan(&live); err != nil {
		return 0, false, err
	}
	remaining := settings.ActiveQuotaBytes - live
	if remaining < 0 {
		remaining = 0
	}
	return remaining, false, nil
}

// --- Send：发件包 ---

// Send 是发件包的台账记录。
type Send struct {
	ID            int64      `json:"id"`
	PublicKey     string     `json:"public_key"`
	OwnerUserID   int64      `json:"owner_user_id"`
	SourceKey     string     `json:"source_key"`
	SourceName    string     `json:"source_name"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	HasPassword   bool       `json:"has_password"`
	MaxDownloads  *int64     `json:"max_downloads"`
	DownloadCount int64      `json:"download_count"`
	ExpiresAt     *time.Time `json:"expires_at"`
	Status        string     `json:"status"`
	TotalFiles    int64      `json:"total_files"`
	TotalSize     int64      `json:"total_size"`
	CreatedAt     time.Time  `json:"created_at"`
	FinalizedAt   *time.Time `json:"finalized_at"`
	RevokedAt     *time.Time `json:"revoked_at"`
}

type sendRow struct {
	send         Send
	passwordHash string
	pickupHash   string
	sourceID     int64
}

const sendColumns = `t.id, t.public_key, t.owner_user_id, t.storage_source_id, s.key, s.name,
  t.title, t.description, t.password_hash IS NOT NULL, t.max_downloads, t.download_count,
  t.expires_at, t.status, t.total_files, t.total_size, t.created_at, t.finalized_at, t.revoked_at`

func scanSend(row interface{ Scan(...any) error }) (*sendRow, error) {
	var out sendRow
	var passwordHash, pickupHash string
	var sourceID int64
	var expires, finalized, revoked sql.NullTime
	err := row.Scan(&out.send.ID, &out.send.PublicKey, &out.send.OwnerUserID, &sourceID,
		&out.send.SourceKey, &out.send.SourceName, &out.send.Title, &out.send.Description,
		&out.send.HasPassword, &out.send.MaxDownloads, &out.send.DownloadCount,
		&expires, &out.send.Status, &out.send.TotalFiles, &out.send.TotalSize,
		&out.send.CreatedAt, &finalized, &revoked, &passwordHash, &pickupHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	assignNullableTime(&out.send.ExpiresAt, expires)
	assignNullableTime(&out.send.FinalizedAt, finalized)
	assignNullableTime(&out.send.RevokedAt, revoked)
	out.passwordHash = passwordHash
	out.pickupHash = pickupHash
	out.sourceID = sourceID
	return &out, nil
}

func assignNullableTime(target **time.Time, value sql.NullTime) {
	if value.Valid {
		t := value.Time
		*target = &t
	}
}

// SendFile 是发件包内的一个文件。
type SendFile struct {
	ID           int64     `json:"id"`
	RelativePath string    `json:"relative_path"`
	Size         int64     `json:"size"`
	MimeType     string    `json:"mime_type"`
	CreatedAt    time.Time `json:"created_at"`
}

const sendFileColumns = `id, relative_path, size, mime_type, created_at`

func scanSendFile(row interface{ Scan(...any) error }) (*SendFile, error) {
	var f SendFile
	err := row.Scan(&f.ID, &f.RelativePath, &f.Size, &f.MimeType, &f.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &f, err
}

// CreateSendInput 是创建发件包草稿的输入。
type CreateSendInput struct {
	OwnerUserID int64
	Title       string
	Description string
	// ExpiresInHours：nil 用全局默认；0 永不过期；>0 小时。
	ExpiresInHours *int64
	MaxDownloads   *int64
	Password       string
}

// CreateSend 创建发件包草稿，返回记录与一次性展示的明文取件码。
func (s *Service) CreateSend(in CreateSendInput) (*Send, string, error) {
	src, err := s.capabilities.ResolveSource("transfer_center")
	if err != nil {
		return nil, "", fmt.Errorf("流转中心未开启或未绑定存储源")
	}
	if in.MaxDownloads != nil && *in.MaxDownloads <= 0 {
		return nil, "", ErrSettingsInvalid
	}
	if err := s.managedRoots.Ensure(src); err != nil {
		return nil, "", err
	}
	settings, err := s.GetSettings()
	if err != nil {
		return nil, "", err
	}
	expiresAt, err := computeExpiry(in.ExpiresInHours, settings.DefaultExpiryHours)
	if err != nil {
		return nil, "", err
	}
	publicKey := auth.NewRandomToken("tr-", 12)
	pickupCode := generatePickupCode()
	now := time.Now().UTC()
	passwordHash := ""
	if strings.TrimSpace(in.Password) != "" {
		hash, hashErr := auth.HashPassword(in.Password)
		if hashErr != nil {
			return nil, "", hashErr
		}
		passwordHash = hash
	}
	result, err := s.db.Exec(`INSERT INTO transfers
  (public_key, owner_user_id, storage_source_id, title, description, pickup_code_hash, password_hash,
   max_downloads, expires_at, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
		publicKey, in.OwnerUserID, src.ID, in.Title, in.Description,
		s.codeDigest(pickupCode), nullableString(passwordHash), in.MaxDownloads, nullableTime(expiresAt), now, now)
	if err != nil {
		return nil, "", err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, "", err
	}
	send, err := s.getSendByID(id)
	if err != nil {
		return nil, "", err
	}
	return &send.send, pickupCode, nil
}

func computeExpiry(explicit *int64, defaultHours int64) (*time.Time, error) {
	hours := defaultHours
	if explicit != nil {
		if *explicit < 0 {
			return nil, ErrSettingsInvalid
		}
		hours = *explicit
	}
	if hours <= 0 {
		return nil, nil
	}
	expires := time.Now().UTC().Add(time.Duration(hours) * time.Hour)
	return &expires, nil
}

func (s *Service) getSendByID(id int64) (*sendRow, error) {
	return scanSend(s.db.QueryRow(`SELECT `+sendColumns+`,
  COALESCE(t.password_hash, ''), t.pickup_code_hash
  FROM transfers t JOIN storage_sources s ON s.id = t.storage_source_id
  WHERE t.id = ?`, id))
}

func (s *Service) getSendByKey(publicKey string) (*sendRow, error) {
	return scanSend(s.db.QueryRow(`SELECT `+sendColumns+`,
  COALESCE(t.password_hash, ''), t.pickup_code_hash
  FROM transfers t JOIN storage_sources s ON s.id = t.storage_source_id
  WHERE t.public_key = ?`, publicKey))
}

// ListSendFilesByID 返回发件包全部文件（打包下载使用；调用方已校验访问权）。
func (s *Service) ListSendFilesByID(transferID int64) ([]*SendFile, error) {
	rows, err := s.db.Query(`SELECT `+sendFileColumns+` FROM transfer_files
  WHERE transfer_id = ? ORDER BY relative_path`, transferID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*SendFile{}
	for rows.Next() {
		file, err := scanSendFile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, file)
	}
	return out, rows.Err()
}

// SourceActiveTaskCount 返回仍占用该存储源活跃载荷的流转任务数量（删除守卫用）。
func (s *Service) SourceActiveTaskCount(storageSourceID int64) (int64, error) {
	var count int64
	err := s.db.QueryRow(`SELECT
  (SELECT COUNT(*) FROM transfers WHERE storage_source_id = ? AND status IN ('draft', 'active')) +
  (SELECT COUNT(*) FROM transfer_collections WHERE storage_source_id = ? AND status = 'active')`,
		storageSourceID, storageSourceID).Scan(&count)
	return count, err
}

// ListSendsByOwner 返回用户创建的发件包（历史）。
func (s *Service) ListSendsByOwner(ownerUserID int64) ([]*Send, error) {
	rows, err := s.db.Query(`SELECT `+sendColumns+` FROM transfers t
  JOIN storage_sources s ON s.id = t.storage_source_id
  WHERE t.owner_user_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT 200`, ownerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Send{}
	for rows.Next() {
		row, err := scanSend(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, &row.send)
	}
	return out, rows.Err()
}

func (s *Service) loadOwnSend(transferID, ownerUserID int64) (*sendRow, error) {
	row, err := s.getSendByID(transferID)
	if err != nil {
		return nil, err
	}
	if row.send.OwnerUserID != ownerUserID {
		return nil, ErrNotFound
	}
	return row, nil
}

// AddSendUpload 把一段上传数据作为草稿文件写入（保留相对路径结构）。
func (s *Service) AddSendUpload(transferID, ownerUserID int64, relativePath string, body io.Reader) (*SendFile, error) {
	row, err := s.loadOwnSend(transferID, ownerUserID)
	if err != nil {
		return nil, err
	}
	if row.send.Status != "draft" {
		return nil, ErrNotDraft
	}
	relPath, err := security.NormalizeRelPath(relativePath)
	if err != nil || relPath == "" {
		return nil, fmt.Errorf("%w: 非法的包内路径", files.ErrInvalid)
	}
	if err := security.ValidateUserRelPath(relPath); err != nil {
		return nil, fmt.Errorf("%w: %v", files.ErrInvalid, err)
	}
	src, err := s.sources.GetByID(row.sourceID)
	if err != nil {
		return nil, err
	}
	return s.writeSendFile(row, src, relPath, body)
}

// AddSendFilesFromStore 把已有普通文件/目录复制进草稿，保留目录结构。
// 调用方（HTTP 层）必须先完成用户对 source_key + path 的读取授权。
func (s *Service) AddSendFilesFromStore(transferID, ownerUserID int64, sourceKey, path string) ([]*SendFile, error) {
	row, err := s.loadOwnSend(transferID, ownerUserID)
	if err != nil {
		return nil, err
	}
	if row.send.Status != "draft" {
		return nil, ErrNotDraft
	}
	storeSrc, err := s.sources.Get(sourceKey)
	if err != nil {
		return nil, err
	}
	prefix, err := security.NormalizeRelPath(path)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", files.ErrInvalid, err)
	}
	// ListObjects 已应用排除规则并跳过 symlink 与托管命名空间。
	objects, err := s.files.ListObjects(storeSrc)
	if err != nil {
		return nil, err
	}
	prefixSelector := prefix
	var selected []string
	for _, object := range objects {
		if prefixSelector == "" || object.Key == prefixSelector || strings.HasPrefix(object.Key, prefixSelector+"/") {
			selected = append(selected, object.Key)
		}
	}
	if len(selected) == 0 {
		return nil, ErrNotFound
	}
	sendSrc, err := s.sources.GetByID(row.sourceID)
	if err != nil {
		return nil, err
	}
	copied := make([]*SendFile, 0, len(selected))
	for _, key := range selected {
		if hasSendFileConflict(s.db, row.send.ID, key) {
			continue // 已存在于包内的路径跳过，保持幂等
		}
		body, info, unlock, err := s.files.OpenForRead(storeSrc, key)
		if err != nil {
			return copied, fmt.Errorf("读取 %s 失败: %w", key, err)
		}
		file, writeErr := s.writeSendFile(row, sendSrc, key, body)
		unlock()
		closeErr := body.Close()
		if writeErr != nil {
			if closeErr != nil {
				return copied, errors.Join(writeErr, closeErr)
			}
			return copied, writeErr
		}
		if closeErr != nil {
			return copied, closeErr
		}
		_ = info
		copied = append(copied, file)
	}
	return copied, nil
}

func hasSendFileConflict(db *sql.DB, transferID int64, relPath string) bool {
	var one int
	err := db.QueryRow(`SELECT 1 FROM transfer_files WHERE transfer_id = ? AND relative_path = ?`,
		transferID, relPath).Scan(&one)
	return err == nil
}

// writeSendFile 执行带日志的单文件写入：journal → 配额 → 托管原子写 → 台账事务。
func (s *Service) writeSendFile(row *sendRow, src *models.StorageSource, relPath string, body io.Reader) (*SendFile, error) {
	finalRel := sendPayloadRel(row.send.PublicKey, relPath)
	op := s.newUploadOperation("send-file", src.ID, row.send.ID, 0, finalRel)
	if err := s.writeUploadOperation(op); err != nil {
		return nil, fmt.Errorf("记录流转上传日志失败: %w", err)
	}
	keepJournal := true
	defer func() {
		if keepJournal {
			_ = s.removeUploadOperation(op.OperationID)
		}
	}()

	file, err := s.writeWithQuota(row, src, finalRel, body)
	if err != nil {
		return nil, err
	}

	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(relPath)), ".")
	mimeType := mime.TypeByExtension(filepath.Ext(relPath))
	now := time.Now().UTC()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO transfer_files (transfer_id, relative_path, size, ext, mime_type, created_at)
  VALUES (?, ?, ?, ?, ?, ?)`, row.send.ID, relPath, file.size, ext, mimeType, now); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE transfers SET total_files = total_files + 1, total_size = total_size + ?, updated_at = ?
  WHERE id = ?`, file.size, now, row.send.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	keepJournal = false
	_ = s.removeUploadOperation(op.OperationID)
	return &SendFile{RelativePath: relPath, Size: file.size, MimeType: mimeType, CreatedAt: now}, nil
}

type writtenFile struct {
	size int64
}

// writeWithQuota 合成两级上限：源物理配额与流转中心活跃配额。
func (s *Service) writeWithQuota(row *sendRow, src *models.StorageSource, finalRel string, body io.Reader) (writtenFile, error) {
	quotaGuard, err := s.files.BeginQuotaWrite(src, "")
	if err != nil {
		return writtenFile{}, err
	}
	defer quotaGuard.Close()
	maxBytes, limited := quotaGuard.MaxBytes()
	activeRemaining, activeUnlimited, err := s.activeQuotaRemaining()
	if err != nil {
		return writtenFile{}, err
	}
	if !activeUnlimited && (!limited || activeRemaining < maxBytes) {
		maxBytes = activeRemaining
		limited = true
	}
	written, err := s.files.WriteManagedFile(src, finalRel, ManagedScopeDir, body, maxBytes, limited)
	if err != nil {
		return writtenFile{}, err
	}
	return writtenFile{size: written}, nil
}

// FinalizeSend 把草稿定稿为 active；至少需要一个文件。
func (s *Service) FinalizeSend(transferID, ownerUserID int64) (*Send, error) {
	row, err := s.loadOwnSend(transferID, ownerUserID)
	if err != nil {
		return nil, err
	}
	if row.send.Status != "draft" {
		return nil, ErrNotDraft
	}
	if row.send.TotalFiles == 0 {
		return nil, ErrNoFiles
	}
	now := time.Now().UTC()
	if _, err := s.db.Exec(`UPDATE transfers SET status = 'active', finalized_at = ?, updated_at = ? WHERE id = ?`,
		now, now, row.send.ID); err != nil {
		return nil, err
	}
	updated, err := s.getSendByID(row.send.ID)
	if err != nil {
		return nil, err
	}
	return &updated.send, nil
}

// RevokeSend 主动撤销：立即删除载荷，台账保留为历史。
func (s *Service) RevokeSend(transferID, ownerUserID int64) error {
	row, err := s.loadOwnSend(transferID, ownerUserID)
	if err != nil {
		return err
	}
	if row.send.Status == "revoked" || row.send.Status == "expired" {
		return nil
	}
	if err := s.deleteSendPayload(row); err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.db.Exec(`UPDATE transfers SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?`,
		now, now, row.send.ID)
	return err
}

// deleteSendPayload 删除整个发件包载荷目录。
func (s *Service) deleteSendPayload(row *sendRow) error {
	src, err := s.sources.GetByID(row.sourceID)
	if err != nil {
		return err
	}
	return s.files.DeleteManaged(src, sendPayloadRel(row.send.PublicKey, ""), ManagedScopeDir)
}

// --- 公开读取（Send） ---

// SendPublicInfo 是未解锁时公开可见的摘要。
type SendPublicInfo struct {
	PublicKey     string     `json:"public_key"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	FileCount     int64      `json:"file_count"`
	TotalSize     int64      `json:"total_size"`
	HasPassword   bool       `json:"has_password"`
	DownloadsLeft *int64     `json:"downloads_left"`
	ExpiresAt     *time.Time `json:"expires_at"`
}

// LookupSend 公开解析发件包；已撤销/不存在返回 ErrNotFound，过期返回 ErrExpired。
func (s *Service) LookupSend(publicKey string) (*SendPublicInfo, error) {
	row, err := s.getSendByKey(publicKey)
	if err != nil {
		return nil, err
	}
	if err := checkSendActive(&row.send); err != nil {
		return nil, err
	}
	info := &SendPublicInfo{
		PublicKey:   row.send.PublicKey,
		Title:       row.send.Title,
		Description: row.send.Description,
		FileCount:   row.send.TotalFiles,
		TotalSize:   row.send.TotalSize,
		HasPassword: row.send.HasPassword,
		ExpiresAt:   row.send.ExpiresAt,
	}
	if row.send.MaxDownloads != nil {
		left := *row.send.MaxDownloads - row.send.DownloadCount
		info.DownloadsLeft = &left
	}
	return info, nil
}

// checkSendActive 的语义：revoked/缺失 → 不存在；过期 → ErrExpired。
func checkSendActive(send *Send) error {
	switch send.Status {
	case "active":
	case "revoked", "expired", "draft":
		return ErrNotFound
	default:
		return ErrNotFound
	}
	if send.ExpiresAt != nil && !time.Now().Before(*send.ExpiresAt) {
		return ErrExpired
	}
	return nil
}

// UnlockSend 校验取件码与可选密码，签发公开访问会话。
func (s *Service) UnlockSend(publicKey, pickupCode, password string) (string, time.Time, error) {
	row, err := s.getSendByKey(publicKey)
	if err != nil {
		return "", time.Time{}, ErrNotFound
	}
	if err := checkSendActive(&row.send); err != nil {
		return "", time.Time{}, err
	}
	if !s.verifyCode(row.pickupHash, pickupCode) {
		return "", time.Time{}, ErrPickupCode
	}
	if row.passwordHash != "" && !auth.VerifyPassword(row.passwordHash, password) {
		return "", time.Time{}, ErrPassword
	}
	return s.createSession(row.send.ID, 0, row.send.ExpiresAt)
}

// AuthorizeSend 校验会话并返回发件包（下载端点使用）。
func (s *Service) AuthorizeSend(publicKey, sessionToken string) (*Send, error) {
	row, err := s.getSendByKey(publicKey)
	if err != nil {
		return nil, err
	}
	if err := s.checkSession(row.send.ID, 0, sessionToken); err != nil {
		return nil, err
	}
	if err := checkSendActive(&row.send); err != nil {
		return nil, err
	}
	return &row.send, nil
}

// ListSendFiles 返回包内文件列表（需有效会话）。
func (s *Service) ListSendFiles(publicKey, sessionToken string) ([]*SendFile, error) {
	send, err := s.AuthorizeSend(publicKey, sessionToken)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT `+sendFileColumns+` FROM transfer_files
  WHERE transfer_id = ? ORDER BY relative_path`, send.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*SendFile{}
	for rows.Next() {
		file, err := scanSendFile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, file)
	}
	return out, rows.Err()
}

// ReserveSendDownload 原子占用一次下载名额并返回发件包与源。
// max_downloads 竞争由条件 UPDATE 保证（并发下载不会超限）。
func (s *Service) ReserveSendDownload(publicKey, sessionToken string) (*Send, *models.StorageSource, error) {
	row, err := s.getSendByKey(publicKey)
	if err != nil {
		return nil, nil, err
	}
	if err := s.checkSession(row.send.ID, 0, sessionToken); err != nil {
		return nil, nil, err
	}
	if err := checkSendActive(&row.send); err != nil {
		return nil, nil, err
	}
	now := time.Now().UTC()
	result, err := s.db.Exec(`UPDATE transfers SET download_count = download_count + 1
  WHERE id = ? AND status = 'active'
    AND (max_downloads IS NULL OR download_count < max_downloads)
    AND (expires_at IS NULL OR expires_at > ?)`, row.send.ID, now)
	if err != nil {
		return nil, nil, err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		// 并发竞争失败：重读当前行再分类，避免用过期快照误判。
		row, err = s.getSendByKey(publicKey)
		if err != nil {
			return nil, nil, err
		}
		if row.send.MaxDownloads != nil && row.send.DownloadCount >= *row.send.MaxDownloads {
			return nil, nil, ErrDownloadLimit
		}
		if err := checkSendActive(&row.send); err != nil {
			return nil, nil, err
		}
		return nil, nil, ErrConflictState
	}
	src, err := s.sources.GetByID(row.sourceID)
	if err != nil {
		return nil, nil, err
	}
	return &row.send, src, nil
}

// OpenSendFile 打开包内文件用于下载/预览；路径由台账构造，不拼接用户输入。
func (s *Service) OpenSendFile(src *models.StorageSource, publicKey string, fileID int64) (*SendFile, *os.File, os.FileInfo, func(), error) {
	file, err := scanSendFile(s.db.QueryRow(`SELECT `+sendFileColumns+`
  FROM transfer_files WHERE transfer_id = (SELECT id FROM transfers WHERE public_key = ?) AND id = ?`,
		publicKey, fileID))
	if err != nil {
		return nil, nil, nil, nil, err
	}
	f, info, unlock, err := s.files.OpenManagedForRead(src, sendPayloadRel(publicKey, file.RelativePath), ManagedScopeDir)
	if err != nil {
		return nil, nil, nil, nil, ErrNotFound
	}
	return file, f, info, unlock, nil
}

// OpenManagedForDownload 按文件 ID 打开托管载荷（打包下载使用）。
func (s *Service) OpenManagedForDownload(src *models.StorageSource, publicKey string, fileID int64) (*os.File, os.FileInfo, func(), error) {
	file, err := scanSendFile(s.db.QueryRow(`SELECT `+sendFileColumns+`
  FROM transfer_files WHERE transfer_id = (SELECT id FROM transfers WHERE public_key = ?) AND id = ?`,
		publicKey, fileID))
	if err != nil {
		return nil, nil, nil, err
	}
	return s.files.OpenManagedForRead(src, sendPayloadRel(publicKey, file.RelativePath), ManagedScopeDir)
}

// --- 内部工具 ---

func sendPayloadRel(publicKey, logicalRel string) string {
	base := security.ManagedNamespaceSegment + "/" + ManagedScopeDir + "/" + sendDir + "/" + publicKey
	if logicalRel == "" {
		return base
	}
	return base + "/" + logicalRel
}

// codeDigest 取件码/收件码摘要：HMAC-SHA256（服务器密钥），防止拖库后离线爆破。
func (s *Service) codeDigest(code string) string {
	mac := hmac.New(sha256.New, s.masterKey)
	mac.Write([]byte(code))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Service) verifyCode(digest, code string) bool {
	if strings.TrimSpace(code) == "" {
		return false
	}
	return hmac.Equal([]byte(s.codeDigest(strings.ToUpper(strings.TrimSpace(code)))), []byte(digest))
}

func generatePickupCode() string {
	out := make([]byte, pickupCodeLength)
	for i := range out {
		index, err := rand.Int(rand.Reader, big.NewInt(int64(len(pickupCodeAlphabet))))
		if err != nil {
			panic("crypto/rand 不可用: " + err.Error())
		}
		out[i] = pickupCodeAlphabet[index.Int64()]
	}
	return string(out)
}

func (s *Service) createSession(transferID, collectionID int64, taskExpiry *time.Time) (string, time.Time, error) {
	now := time.Now().UTC()
	expires := now.Add(sessionTTL)
	if taskExpiry != nil && taskExpiry.Before(expires) {
		expires = *taskExpiry
	}
	token := auth.NewRandomToken("", 32)
	var ref any
	if transferID != 0 {
		ref = transferID
	}
	var colRef any
	if collectionID != 0 {
		colRef = collectionID
	}
	if _, err := s.db.Exec(`INSERT INTO transfer_access_sessions
  (token_hash, transfer_id, collection_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
		auth.HashToken(token), ref, colRef, now, expires); err != nil {
		return "", time.Time{}, err
	}
	return token, expires, nil
}

func (s *Service) checkSession(transferID, collectionID int64, token string) error {
	if strings.TrimSpace(token) == "" {
		return ErrNotFound
	}
	var one int
	err := s.db.QueryRow(`SELECT 1 FROM transfer_access_sessions
  WHERE token_hash = ? AND expires_at > ?
    AND ((? != 0 AND transfer_id = ?) OR (? != 0 AND collection_id = ?))`,
		auth.HashToken(token), time.Now().UTC(), transferID, transferID, collectionID, collectionID).Scan(&one)
	if err != nil {
		return ErrNotFound
	}
	return nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullableTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func parseInt64(value string) (int64, error) {
	return strconv.ParseInt(strings.TrimSpace(value), 10, 64)
}
