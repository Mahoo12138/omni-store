package httpserver

import (
	"net/http"
	"strconv"
	"strings"

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

// ActivityItem 是首页"最近活动"面板的一项（docs/home.png）。
type ActivityItem struct {
	ID           int64  `json:"id"`
	Action       string `json:"action"`
	Title        string `json:"title"`
	SourceID     string `json:"source_id,omitempty"`
	SourceName   string `json:"source_name,omitempty"`
	RelativePath string `json:"relative_path,omitempty"`
	CreatedAt    string `json:"created_at"`
}

// handleMyActivity 返回当前用户最近的活动事件（来自 audit_logs）。
// 只挑选对用户有意义的"高阶操作"：上传/删除文件/目录、图床上传/删除等，
// 过滤掉 login/password 这种与个人仪表盘无关的条目。
func (s *Server) handleMyActivity(w http.ResponseWriter, r *http.Request) {
	u := CurrentUser(r.Context())
	limit := 8
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}

	rows, err := s.db.Query(`SELECT a.id, a.action, a.source_id, a.relative_path, a.created_at,
       COALESCE(s.name, '') AS source_name
  FROM audit_logs a
  LEFT JOIN storage_sources s ON s.source_id = a.source_id
  WHERE a.actor_type = 'user' AND a.actor_user_id = ?
    AND a.action NOT IN ('login_success', 'login_failed', 'change_password')
  ORDER BY a.id DESC LIMIT ?`, u.ID, limit)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询活动失败", nil)
		return
	}
	defer rows.Close()

	out := []ActivityItem{}
	for rows.Next() {
		var (
			it           ActivityItem
			sourceID     *string
			relativePath *string
			createdAt    string
		)
		if err := rows.Scan(&it.ID, &it.Action, &sourceID, &relativePath, &createdAt, &it.SourceName); err != nil {
			WriteError(w, r, CodeInternalError, "查询活动失败", nil)
			return
		}
		if sourceID != nil {
			it.SourceID = *sourceID
		}
		if relativePath != nil {
			it.RelativePath = *relativePath
		}
		it.CreatedAt = createdAt
		it.Title = humanizeActivity(it.Action, it.RelativePath, it.SourceName)
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		WriteError(w, r, CodeInternalError, "查询活动失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: out, Total: int64(len(out))})
}

// humanizeActivity 把 audit action 翻译成中文短句。
func humanizeActivity(action, relPath, sourceName string) string {
	filename := ""
	if relPath != "" {
		if i := strings.LastIndex(relPath, "/"); i >= 0 {
			filename = relPath[i+1:]
		} else {
			filename = relPath
		}
	}
	loc := sourceName
	switch action {
	case "image_upload":
		if filename != "" {
			if loc != "" {
				return "上传了 " + filename + " 到 " + loc
			}
			return "上传了 " + filename
		}
		return "上传了图片"
	case "image_delete":
		if filename != "" {
			return "删除了图片 " + filename
		}
		return "删除了图片"
	case "upload":
		if filename != "" {
			if loc != "" {
				return "上传了 " + filename + " 到 " + loc
			}
			return "上传了 " + filename
		}
		return "上传了文件"
	case "delete":
		if filename != "" {
			return "删除了 " + filename
		}
		return "删除了文件"
	case "create_folder":
		if filename != "" {
			return "创建了文件夹 " + filename
		}
		return "创建了文件夹"
	case "rename":
		if filename != "" {
			return "重命名了 " + filename
		}
		return "重命名了文件"
	case "move":
		if filename != "" {
			return "移动了 " + filename
		}
		return "移动了文件"
	default:
		// 未知动作：保留原文。
		return action
	}
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
