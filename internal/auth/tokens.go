package auth

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/omni-store/omnistore/internal/models"
)

// Token 类型（user_tokens.token_type）。
const (
	TokenTypeWebDAV   = "webdav"
	TokenTypeImageBed = "image_bed"
)

// ErrTokenInvalid Token 无效或用户不可用。
var ErrTokenInvalid = errors.New("token 无效")

// Tokens 管理用户 WebDAV Token 和图床 API Token。
// 每个用户每种类型最多一个 Token；只保存哈希；明文只在生成时返回一次。
type Tokens struct {
	db *sql.DB
}

// NewTokens 创建 Token 服务。
func NewTokens(db *sql.DB) *Tokens {
	return &Tokens{db: db}
}

// Reset 生成或重置 Token，返回明文（只展示一次）。旧 Token 立即失效。
func (t *Tokens) Reset(userID int64, tokenType string) (string, error) {
	if tokenType != TokenTypeWebDAV && tokenType != TokenTypeImageBed {
		return "", fmt.Errorf("非法 token 类型: %s", tokenType)
	}
	plaintext := NewRandomToken("", 24)
	now := time.Now().UTC()
	_, err := t.db.Exec(`INSERT INTO user_tokens (user_id, token_type, token_hash, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, token_type) DO UPDATE SET token_hash = excluded.token_hash,
    created_at = excluded.created_at, last_used_at = NULL`,
		userID, tokenType, HashToken(plaintext), now)
	if err != nil {
		return "", fmt.Errorf("生成 token 失败: %w", err)
	}
	return plaintext, nil
}

// Verify 按用户名和明文 Token 校验。用户被禁用时 Token 失效（README §8.6）。
func (t *Tokens) Verify(username, tokenType, plaintext string) (*models.User, error) {
	if username == "" || plaintext == "" {
		return nil, ErrTokenInvalid
	}
	row := t.db.QueryRow(`SELECT
    u.id, u.user_public_id, u.username, u.display_name, u.role, u.is_disabled, u.created_at, u.updated_at,
    t.token_hash
  FROM users u JOIN user_tokens t ON t.user_id = u.id
  WHERE u.username = ? AND t.token_type = ?`, username, tokenType)

	var u models.User
	var hash string
	err := row.Scan(&u.ID, &u.UserPublicID, &u.Username, &u.DisplayName, &u.Role,
		&u.IsDisabled, &u.CreatedAt, &u.UpdatedAt, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTokenInvalid
	}
	if err != nil {
		return nil, err
	}
	if u.IsDisabled || !TokenEqual(hash, HashToken(plaintext)) {
		return nil, ErrTokenInvalid
	}

	_, _ = t.db.Exec(`UPDATE user_tokens SET last_used_at = ? WHERE user_id = ? AND token_type = ?`,
		time.Now().UTC(), u.ID, tokenType)
	return &u, nil
}

// VerifyByToken 按明文 Token 直接校验（PicGo 等不携带用户名的入口）。
// 数据库只存哈希，按哈希精确查找。
func (t *Tokens) VerifyByToken(tokenType, plaintext string) (*models.User, error) {
	if plaintext == "" {
		return nil, ErrTokenInvalid
	}
	row := t.db.QueryRow(`SELECT
    u.id, u.user_public_id, u.username, u.display_name, u.role, u.is_disabled, u.created_at, u.updated_at
  FROM users u JOIN user_tokens t ON t.user_id = u.id
  WHERE t.token_type = ? AND t.token_hash = ?`, tokenType, HashToken(plaintext))

	var u models.User
	err := row.Scan(&u.ID, &u.UserPublicID, &u.Username, &u.DisplayName, &u.Role,
		&u.IsDisabled, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTokenInvalid
	}
	if err != nil {
		return nil, err
	}
	if u.IsDisabled {
		return nil, ErrTokenInvalid
	}
	_, _ = t.db.Exec(`UPDATE user_tokens SET last_used_at = ? WHERE user_id = ? AND token_type = ?`,
		time.Now().UTC(), u.ID, tokenType)
	return &u, nil
}

// TokenStatus 是 Token 状态（不含明文）。
type TokenStatus struct {
	Exists     bool       `json:"exists"`
	CreatedAt  *time.Time `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
}

// Status 返回用户各类型 Token 状态。
func (t *Tokens) Status(userID int64) (map[string]TokenStatus, error) {
	out := map[string]TokenStatus{
		TokenTypeWebDAV:   {},
		TokenTypeImageBed: {},
	}
	rows, err := t.db.Query(`SELECT token_type, created_at, last_used_at FROM user_tokens WHERE user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var typ string
		var createdAt time.Time
		var lastUsed sql.NullTime
		if err := rows.Scan(&typ, &createdAt, &lastUsed); err != nil {
			return nil, err
		}
		st := TokenStatus{Exists: true, CreatedAt: &createdAt}
		if lastUsed.Valid {
			st.LastUsedAt = &lastUsed.Time
		}
		out[typ] = st
	}
	return out, rows.Err()
}
