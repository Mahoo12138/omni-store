package httpserver

import (
	"context"
	"net/http"

	"github.com/omni-store/omnistore/internal/models"
)

const (
	currentUserKey ctxKey = 1
	sessionKey     ctxKey = 2
)

// CurrentUser 从 context 取当前登录用户。
func CurrentUser(ctx context.Context) *models.User {
	u, _ := ctx.Value(currentUserKey).(*models.User)
	return u
}

func currentSession(ctx context.Context) *models.Session {
	s, _ := ctx.Value(sessionKey).(*models.Session)
	return s
}

// requireAuth 校验 Cookie Session；写操作强制校验 X-CSRF-Token（README §8.5）。
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(SessionCookieName())
		if err != nil {
			WriteError(w, r, CodeUnauthorized, "未登录", nil)
			return
		}
		user, sess, err := s.sessions.Validate(cookie.Value)
		if err != nil {
			s.clearSessionCookie(w)
			WriteError(w, r, CodeUnauthorized, "登录已失效，请重新登录", nil)
			return
		}

		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			if !s.sessions.VerifyCSRF(sess, r.Header.Get("X-CSRF-Token")) {
				WriteError(w, r, CodeForbidden, "CSRF 校验失败", nil)
				return
			}
		}

		ctx := context.WithValue(r.Context(), currentUserKey, user)
		ctx = context.WithValue(ctx, sessionKey, sess)
		next(w, r.WithContext(ctx))
	}
}

// requireAdmin 在 requireAuth 基础上要求超级管理员角色。
func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		if !CurrentUser(r.Context()).IsAdmin() {
			WriteError(w, r, CodeForbidden, "需要超级管理员权限", nil)
			return
		}
		next(w, r)
	})
}
