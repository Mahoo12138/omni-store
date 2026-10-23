package transfers

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
)

const (
	GuestMaxTTL           = 7 * 24 * time.Hour
	GuestActiveQuotaBytes = int64(1024 * 1024 * 1024)
	GuestMaxActiveTasks   = int64(20)
	guestDefaultExpiry    = int64(24)
)

// Owner 区分中转账号与访客；恰有一个正数 ID，二者没有共用的权限空间。
type Owner struct {
	UserID  int64
	GuestID int64
}

func (o Owner) valid() bool {
	return (o.UserID > 0 && o.GuestID == 0) || (o.UserID == 0 && o.GuestID > 0)
}

func (o Owner) Key() string {
	if o.UserID > 0 {
		return fmt.Sprintf("user:%d", o.UserID)
	}
	return fmt.Sprintf("guest:%d", o.GuestID)
}

func (o Owner) sqlValues() (any, any) {
	if o.UserID > 0 {
		return o.UserID, nil
	}
	return nil, o.GuestID
}

type GuestIdentity struct {
	ID        int64
	ExpiresAt time.Time
}

type GuestLimits struct {
	MaxFileSize    int64 `json:"max_file_size"`
	MaxActiveBytes int64 `json:"max_active_bytes"`
	MaxActiveTasks int64 `json:"max_active_tasks"`
}

func (s *Service) SetGuestMaxFileSize(maxBytes int64) {
	if maxBytes <= 0 || maxBytes > GuestActiveQuotaBytes {
		maxBytes = GuestActiveQuotaBytes
	}
	s.guestMaxFileSize = maxBytes
}

func (s *Service) GuestLimits() (*GuestLimits, error) {
	settings, err := s.GetSettings()
	if err != nil {
		return nil, err
	}
	activeBytes := GuestActiveQuotaBytes
	if settings.ActiveQuotaBytes > 0 && settings.ActiveQuotaBytes < activeBytes {
		activeBytes = settings.ActiveQuotaBytes
	}
	fileBytes := s.guestMaxFileSize
	if activeBytes < fileBytes {
		fileBytes = activeBytes
	}
	return &GuestLimits{MaxFileSize: fileBytes, MaxActiveBytes: activeBytes, MaxActiveTasks: GuestMaxActiveTasks}, nil
}

func (s *Service) CreateGuestIdentity(ttl time.Duration) (*GuestIdentity, string, error) {
	if ttl <= 0 || ttl > GuestMaxTTL {
		ttl = GuestMaxTTL
	}
	now := time.Now().UTC()
	token := auth.NewRandomToken("", 32)
	result, err := s.db.Exec(`INSERT INTO transfer_guest_identities (token_hash, created_at, expires_at) VALUES (?, ?, ?)`,
		auth.HashToken(token), now, now.Add(ttl))
	if err != nil {
		return nil, "", err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, "", err
	}
	return &GuestIdentity{ID: id, ExpiresAt: now.Add(ttl)}, token, nil
}

func (s *Service) GetGuestIdentity(token string) (*GuestIdentity, error) {
	if strings.TrimSpace(token) == "" {
		return nil, ErrNotFound
	}
	var guest GuestIdentity
	err := s.db.QueryRow(`SELECT id, expires_at FROM transfer_guest_identities WHERE token_hash = ? AND expires_at > ?`,
		auth.HashToken(token), time.Now().UTC()).Scan(&guest.ID, &guest.ExpiresAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return &guest, err
}

// GuestCSRFToken 从 Cookie 单向派生稳定的独立 CSRF Token，Cookie 明文不返回给脚本。
func (s *Service) GuestCSRFToken(token string) string {
	if token == "" {
		return ""
	}
	return s.codeDigest("omnistore-transfer-guest-csrf-v1:" + token)
}

func (s *Service) validateOwner(owner Owner) error {
	if !owner.valid() {
		return ErrNotFound
	}
	if owner.GuestID == 0 {
		return nil
	}
	var id int64
	if err := s.db.QueryRow(`SELECT id FROM transfer_guest_identities WHERE id = ? AND expires_at > ?`, owner.GuestID, time.Now().UTC()).Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *Service) computeOwnerExpiry(explicit *int64, defaultHours int64, owner Owner) (*time.Time, error) {
	if err := s.validateOwner(owner); err != nil {
		return nil, err
	}
	if owner.GuestID == 0 {
		return computeExpiry(explicit, defaultHours)
	}
	if explicit != nil && *explicit <= 0 {
		return nil, ErrSettingsInvalid
	}
	if defaultHours <= 0 {
		defaultHours = guestDefaultExpiry
	}
	var identityExpiry time.Time
	if err := s.db.QueryRow(`SELECT expires_at FROM transfer_guest_identities WHERE id = ?`, owner.GuestID).Scan(&identityExpiry); err != nil {
		return nil, err
	}
	hours := defaultHours
	if explicit != nil {
		hours = *explicit
	}
	// 在乘 time.Hour 前截断到身份期限，极大合法小时数也不能溢出 duration。
	if hours >= int64(GuestMaxTTL/time.Hour) {
		return &identityExpiry, nil
	}
	expires, err := computeExpiry(explicit, defaultHours)
	if err != nil {
		return nil, err
	}
	if expires.After(identityExpiry) {
		return &identityExpiry, nil
	}
	return expires, nil
}

func checkOwnerCreate(tx *sql.Tx, owner Owner) error {
	if !owner.valid() {
		return ErrNotFound
	}
	if owner.GuestID == 0 {
		return nil
	}
	var expires time.Time
	if err := tx.QueryRow(`SELECT expires_at FROM transfer_guest_identities WHERE id = ?`, owner.GuestID).Scan(&expires); err != nil || !time.Now().Before(expires) {
		return ErrNotFound
	}
	var count int64
	if err := tx.QueryRow(`SELECT
  (SELECT COUNT(*) FROM transfers WHERE owner_guest_id = ? AND status IN ('draft', 'active') AND expires_at > ?) +
  (SELECT COUNT(*) FROM transfer_collections WHERE owner_guest_id = ? AND status = 'active' AND expires_at > ?)`,
		owner.GuestID, time.Now().UTC(), owner.GuestID, time.Now().UTC()).Scan(&count); err != nil {
		return err
	}
	if count >= GuestMaxActiveTasks {
		return fmt.Errorf("%w: 访客最多同时保留 %d 个任务", ErrConflictState, GuestMaxActiveTasks)
	}
	return nil
}

func (s *Service) guestQuotaRemaining(guestID int64) (int64, error) {
	var usage int64
	if err := s.db.QueryRow(`SELECT
  (SELECT COALESCE(SUM(total_size), 0) FROM transfers WHERE owner_guest_id = ? AND status IN ('draft', 'active')) +
  (SELECT COALESCE(SUM(total_size), 0) FROM transfer_collections WHERE owner_guest_id = ? AND status IN ('active', 'closed'))`, guestID, guestID).Scan(&usage); err != nil {
		return 0, err
	}
	remaining := GuestActiveQuotaBytes - usage
	if remaining < 0 {
		remaining = 0
	}
	return remaining, nil
}

// checkTransferWrite 在提交事务内重新核验全局/访客配额，阻止并发写入沿用旧余额。
func checkTransferWrite(tx *sql.Tx, guestID, written int64) error {
	var limit, usage int64
	if err := tx.QueryRow(`SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM system_settings WHERE key = ?), 0),
  (SELECT COALESCE(SUM(total_size), 0) FROM transfers WHERE status IN ('draft', 'active')) +
  (SELECT COALESCE(SUM(total_size), 0) FROM transfer_collections WHERE status IN ('active', 'closed'))`, SettingActiveQuotaBytes).Scan(&limit, &usage); err != nil {
		return err
	}
	if limit > 0 && written > limit-usage {
		return ErrQuotaExceeded
	}
	if guestID == 0 {
		return nil
	}
	var expires time.Time
	if err := tx.QueryRow(`SELECT expires_at FROM transfer_guest_identities WHERE id = ?`, guestID).Scan(&expires); err != nil || !time.Now().Before(expires) {
		return ErrNotFound
	}
	if err := tx.QueryRow(`SELECT
  (SELECT COALESCE(SUM(total_size), 0) FROM transfers WHERE owner_guest_id = ? AND status IN ('draft', 'active')) +
  (SELECT COALESCE(SUM(total_size), 0) FROM transfer_collections WHERE owner_guest_id = ? AND status IN ('active', 'closed'))`, guestID, guestID).Scan(&usage); err != nil {
		return err
	}
	if written > GuestActiveQuotaBytes-usage {
		return ErrQuotaExceeded
	}
	return nil
}
