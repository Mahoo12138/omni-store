// Package models 定义系统数据结构。
package models

import "time"

// 外观主题模式（user_preferences.theme）。
// ThemeSystem 跟随操作系统的 prefers-color-scheme，是默认值。
const (
	ThemeLight  = "light"
	ThemeDark   = "dark"
	ThemeSystem = "system"
)

// ValidTheme 判断主题值是否落在允许的三档内。
// 表上有 CHECK 约束，这里是服务层的先行校验，用来给出面向用户的错误而不是 SQLite 约束报错。
func ValidTheme(theme string) bool {
	switch theme {
	case ThemeLight, ThemeDark, ThemeSystem:
		return true
	}
	return false
}

// Preferences 对应 user_preferences 表，是账号级界面偏好。
// 读接口在用户尚无记录时返回 DefaultPreferences，不为读操作建行。
type Preferences struct {
	Theme     string    `json:"theme"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DefaultPreferences 返回未设置过偏好时的取值：外观跟随系统。
func DefaultPreferences() Preferences {
	return Preferences{Theme: ThemeSystem}
}
