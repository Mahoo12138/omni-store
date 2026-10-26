package users

import (
	"database/sql"
	"errors"
	"time"

	"github.com/omni-store/omnistore/internal/models"
)

// ErrInvalidTheme 主题值不在 light/dark/system 三档内。
var ErrInvalidTheme = errors.New("主题只支持 light、dark、system")

// Preferences 读取账号级界面偏好。用户尚未设置过偏好时返回默认值（theme=system），
// 不建行：读操作不应写库，也让首次登录用户保持零记录。
func (s *Service) Preferences(userID int64) (models.Preferences, error) {
	var (
		theme     string
		updatedAt time.Time
	)
	err := s.db.QueryRow(`SELECT theme, updated_at FROM user_preferences WHERE user_id = ?`, userID).
		Scan(&theme, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return models.DefaultPreferences(), nil
	}
	if err != nil {
		return models.Preferences{}, err
	}
	return models.Preferences{Theme: theme, UpdatedAt: updatedAt}, nil
}

// SetPreferencesTheme 写入外观主题偏好并返回落库后的记录。
// 值先经服务层校验，避免 SQLite CHECK 约束错误直接冒到接口层。
func (s *Service) SetPreferencesTheme(userID int64, theme string) (models.Preferences, error) {
	if !models.ValidTheme(theme) {
		return models.Preferences{}, ErrInvalidTheme
	}
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO user_preferences (user_id, theme, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, updated_at = excluded.updated_at`,
		userID, theme, now)
	if err != nil {
		return models.Preferences{}, err
	}
	return models.Preferences{Theme: theme, UpdatedAt: now}, nil
}
