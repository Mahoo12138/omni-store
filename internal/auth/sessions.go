package auth

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/omni-store/omnistore/internal/models"
)

// SessionCookieName 是登录态 Cookie 名称。
const SessionCookieName = "omnistore_session"

// ErrSessionInvalid 表示 Session 不存在、已过期或用户不可用。
var ErrSessionInvalid = errors.New("session 无效")

// Sessions 管理 SQLite 中的登录 Session。
type Sessions struct {
	db  *sql.DB
	ttl time.Duration
}

// NewSessions 创建 Session 服务，ttl 为登录有效期。
func NewSessions(db *sql.DB, ttl time.Duration) *Sessions {
	return &Sessions{db: db, ttl: ttl}
}

// TTL 返回 Session 有效期。
func (s *Sessions) TTL() time.Duration {
	return s.ttl
}

// Create 为用户创建 Session，返回 session_id 和明文 CSRF Token。
// CSRF Token 只保存哈希。
func (s *Sessions) Create(userID int64, userAgent, ipAddress string) (sessionID, csrfToken string, err error) {
	sessionID = NewRandomToken("", 32)
	csrfToken = NewRandomToken("", 32)
	now := time.Now().UTC()

	_, err = s.db.Exec(`INSERT INTO sessions
  (session_id, user_id, csrf_token_hash, expires_at, created_at, last_seen_at, user_agent, ip_address)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		sessionID, userID, HashToken(csrfToken), now.Add(s.ttl), now, now, userAgent, ipAddress)
	if err != nil {
		return "", "", fmt.Errorf("创建 session 失败: %w", err)
	}
	return sessionID, csrfToken, nil
}

// Validate 校验 Session 并返回关联用户。
// Session 过期、用户被禁用都会返回 ErrSessionInvalid。
func (s *Sessions) Validate(sessionID string) (*models.User, *models.Session, error) {
	if sessionID == "" {
		return nil, nil, ErrSessionInvalid
	}
	row := s.db.QueryRow(`SELECT
    s.session_id, s.user_id, s.csrf_token_hash, s.expires_at,
    u.id, u.user_public_id, u.username, u.display_name, u.role, u.is_disabled, u.created_at, u.updated_at
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.session_id = ?`, sessionID)

	var sess models.Session
	var u models.User
	err := row.Scan(
		&sess.SessionID, &sess.UserID, &sess.CSRFTokenHash, &sess.ExpiresAt,
		&u.ID, &u.UserPublicID, &u.Username, &u.DisplayName, &u.Role, &u.IsDisabled, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrSessionInvalid
	}
	if err != nil {
		return nil, nil, fmt.Errorf("查询 session 失败: %w", err)
	}
	if time.Now().UTC().After(sess.ExpiresAt) || u.IsDisabled {
		return nil, nil, ErrSessionInvalid
	}

	// 更新活跃时间，失败不影响本次请求。
	_, _ = s.db.Exec(`UPDATE sessions SET last_seen_at = ? WHERE session_id = ?`,
		time.Now().UTC(), sessionID)
	return &u, &sess, nil
}

// VerifyCSRF 校验明文 CSRF Token 与 Session 中的哈希。
func (s *Sessions) VerifyCSRF(sess *models.Session, csrfToken string) bool {
	if csrfToken == "" {
		return false
	}
	return TokenEqual(sess.CSRFTokenHash, HashToken(csrfToken))
}

// RotateCSRF 重新生成 CSRF Token 并返回明文。
// 用于 SPA 刷新后通过 /auth/me 重新获取 Token。
func (s *Sessions) RotateCSRF(sessionID string) (string, error) {
	csrfToken := NewRandomToken("", 32)
	_, err := s.db.Exec(`UPDATE sessions SET csrf_token_hash = ? WHERE session_id = ?`,
		HashToken(csrfToken), sessionID)
	if err != nil {
		return "", fmt.Errorf("更新 CSRF Token 失败: %w", err)
	}
	return csrfToken, nil
}

// Delete 删除指定 Session（退出登录）。
func (s *Sessions) Delete(sessionID string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE session_id = ?`, sessionID)
	return err
}

// DeleteByUser 删除某用户全部 Session（禁用/删除用户时调用）。
func (s *Sessions) DeleteByUser(userID int64) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

// CleanupExpired 清理过期 Session（README §21 唯一必要后台任务）。
func (s *Sessions) CleanupExpired() (int64, error) {
	res, err := s.db.Exec(`DELETE FROM sessions WHERE expires_at < ?`, time.Now().UTC())
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}
