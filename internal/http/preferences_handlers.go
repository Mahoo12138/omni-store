package httpserver

import (
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/users"
)

// handleMyPreferences 返回当前账号的界面偏好。
// 未设置过的账号返回默认值（theme=system），不落库。
func (s *Server) handleMyPreferences(w http.ResponseWriter, r *http.Request) {
	prefs, err := s.users.Preferences(CurrentUser(r.Context()).ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询偏好失败", nil)
		return
	}
	WriteData(w, r, prefs)
}

// handleUpdatePreferences 写入界面偏好。写操作由 requireAuth 强制校验 X-CSRF-Token。
// 只接受 light/dark/system 三档；其它值返回校验错误，不落库。
func (s *Server) handleUpdatePreferences(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Theme string `json:"theme"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	prefs, err := s.users.SetPreferencesTheme(CurrentUser(r.Context()).ID, req.Theme)
	if errors.Is(err, users.ErrInvalidTheme) {
		WriteError(w, r, CodeValidationError, err.Error(), nil)
		return
	}
	if err != nil {
		WriteError(w, r, CodeInternalError, "保存偏好失败", nil)
		return
	}
	WriteData(w, r, prefs)
}
