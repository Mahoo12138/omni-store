package httpserver

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/users"
)

// SessionCookieName 返回登录态 Cookie 名称。
func SessionCookieName() string {
	return auth.SessionCookieName
}

func (s *Server) setSessionCookie(w http.ResponseWriter, sessionID string) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    sessionID,
		Path:     "/",
		MaxAge:   int(s.sessions.TTL().Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.cfg.Security.CookieSecure,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.cfg.Security.CookieSecure,
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		WriteError(w, r, CodeValidationError, "请求体格式错误", nil)
		return false
	}
	return true
}

// --- 初始化超级管理员（README §8.2） ---

// handleSetupStatus 返回系统是否已初始化。
func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	n, err := s.users.Count()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询失败", nil)
		return
	}
	WriteData(w, r, map[string]any{"initialized": n > 0})
}

// handleSetupAdmin 创建第一个超级管理员。仅在没有任何用户时可用。
func (s *Server) handleSetupAdmin(w http.ResponseWriter, r *http.Request) {
	n, err := s.users.Count()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询失败", nil)
		return
	}
	if n > 0 {
		WriteError(w, r, CodeForbidden, "系统已初始化", nil)
		return
	}

	var req struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	u, err := s.users.Create(req.Username, req.DisplayName, req.Password, models.RoleSuperAdmin)
	if err != nil {
		s.writeUserError(w, r, err)
		return
	}

	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryAdmin, Action: "create_user",
		IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(),
		Status: audit.StatusSuccess,
	})
	WriteData(w, r, u)
}

// --- 登录 / 退出 / 当前用户 ---

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	ip := s.proxy.ClientIP(r)
	ua := r.UserAgent()

	fail := func(userID *int64) {
		s.audit.Log(audit.Entry{
			ActorType: audit.ActorAnonymous, ActorUserID: userID,
			EntryType: audit.EntryWeb, Action: "login_failed",
			IPAddress: ip, UserAgent: ua,
			Status: audit.StatusFailed, ErrorCode: CodeUnauthorized,
		})
		WriteError(w, r, CodeUnauthorized, "用户名或密码错误", nil)
	}

	u, err := s.users.GetByUsername(req.Username)
	if err != nil {
		if errors.Is(err, users.ErrNotFound) {
			// 仍执行一次哈希比较，避免用户名枚举时间差。
			auth.VerifyPassword("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy", req.Password)
			fail(nil)
			return
		}
		WriteError(w, r, CodeInternalError, "登录失败", nil)
		return
	}

	hash, err := s.users.PasswordHashByUsername(req.Username)
	if err != nil || !auth.VerifyPassword(hash, req.Password) {
		fail(&u.ID)
		return
	}
	if u.IsDisabled {
		fail(&u.ID)
		return
	}

	sessionID, csrfToken, err := s.sessions.Create(u.ID, ua, ip)
	if err != nil {
		WriteError(w, r, CodeInternalError, "创建会话失败", nil)
		return
	}
	s.setSessionCookie(w, sessionID)

	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryWeb, Action: "login_success",
		IPAddress: ip, UserAgent: ua, Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"user": u, "csrf_token": csrfToken})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(auth.SessionCookieName); err == nil {
		_ = s.sessions.Delete(cookie.Value)
	}
	s.clearSessionCookie(w)
	WriteData(w, r, map[string]any{"ok": true})
}

// handleMe 返回当前用户，并轮换返回新的 CSRF Token（SPA 刷新后恢复登录态用）。
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	sess := currentSession(r.Context())
	csrfToken, err := s.sessions.RotateCSRF(sess.SessionID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "会话更新失败", nil)
		return
	}
	WriteData(w, r, map[string]any{
		"user":       CurrentUser(r.Context()),
		"csrf_token": csrfToken,
	})
}

func (s *Server) writeUserError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, users.ErrUsernameTaken):
		WriteError(w, r, CodeConflict, err.Error(), nil)
	case errors.Is(err, users.ErrInvalidUsername), errors.Is(err, users.ErrWeakPassword):
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	case errors.Is(err, users.ErrNotFound):
		WriteError(w, r, CodeFileNotFound, err.Error(), nil)
	default:
		WriteError(w, r, CodeInternalError, "操作失败", nil)
	}
}
