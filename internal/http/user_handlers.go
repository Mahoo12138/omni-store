package httpserver

import (
	"net/http"
	"strconv"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
)

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

func (s *Server) adminAudit(r *http.Request, action string, status, errorCode string) {
	u := CurrentUser(r.Context())
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryAdmin, Action: action,
		IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(),
		Status: status, ErrorCode: errorCode,
	})
}

// --- 管理员：用户管理（README §7.2） ---

func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	list, err := s.users.List()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询用户失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: list, Total: int64(len(list))})
}

func (s *Server) handleAdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
		Role        string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Role == "" {
		req.Role = models.RoleUser
	}

	u, err := s.users.Create(req.Username, req.DisplayName, req.Password, req.Role)
	if err != nil {
		s.writeUserError(w, r, err)
		return
	}
	s.adminAudit(r, "create_user", audit.StatusSuccess, "")
	WriteData(w, r, u)
}

// handleAdminSetUserDisabled 处理禁用与启用。
func (s *Server) handleAdminSetUserDisabled(disabled bool) http.HandlerFunc {
	action := "enable_user"
	if disabled {
		action = "disable_user"
	}
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(r)
		if !ok {
			WriteError(w, r, CodeValidationError, "非法用户 ID", nil)
			return
		}
		if id == CurrentUser(r.Context()).ID {
			WriteError(w, r, CodeValidationError, "不能操作自己的账号", nil)
			return
		}
		if err := s.users.SetDisabled(id, disabled); err != nil {
			s.writeUserError(w, r, err)
			return
		}
		if disabled {
			// 禁用后所有入口立即失效（README §26.2）。
			_ = s.sessions.DeleteByUser(id)
		}
		s.adminAudit(r, action, audit.StatusSuccess, "")
		WriteData(w, r, map[string]any{"ok": true})
	}
}

func (s *Server) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		WriteError(w, r, CodeValidationError, "非法用户 ID", nil)
		return
	}
	if id == CurrentUser(r.Context()).ID {
		WriteError(w, r, CodeValidationError, "不能删除自己的账号", nil)
		return
	}
	if err := s.users.Delete(id); err != nil {
		s.writeUserError(w, r, err)
		return
	}
	s.adminAudit(r, "delete_user", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"ok": true})
}

// --- 用户自助（README §7.3） ---

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DisplayName string `json:"display_name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u := CurrentUser(r.Context())
	if err := s.users.UpdateDisplayName(u.ID, req.DisplayName); err != nil {
		WriteError(w, r, CodeValidationError, err.Error(), nil)
		return
	}
	updated, err := s.users.GetByID(u.ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询失败", nil)
		return
	}
	WriteData(w, r, updated)
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u := CurrentUser(r.Context())

	hash, err := s.users.PasswordHashByID(u.ID)
	if err != nil || !auth.VerifyPassword(hash, req.OldPassword) {
		WriteError(w, r, CodeForbidden, "旧密码错误", nil)
		return
	}
	if err := s.users.UpdatePassword(u.ID, req.NewPassword); err != nil {
		s.writeUserError(w, r, err)
		return
	}

	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryWeb, Action: "change_password",
		IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(),
		Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"ok": true})
}
