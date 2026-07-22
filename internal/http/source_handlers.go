package httpserver

import (
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/sources"
)

func (s *Server) writeSourceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, sources.ErrNotFound):
		WriteError(w, r, CodeSourceNotFound, err.Error(), nil)
	case errors.Is(err, sources.ErrSourceIDTaken):
		WriteError(w, r, CodeConflict, err.Error(), nil)
	default:
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	}
}

// --- 管理员：存储源管理（README §25.3） ---

func (s *Server) handleAdminListSources(w http.ResponseWriter, r *http.Request) {
	list, err := s.sources.List()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询存储源失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: list, Total: int64(len(list))})
}

func (s *Server) handleAdminPreflightSource(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RootPath        string    `json:"root_path"`
		ExcludePatterns *[]string `json:"exclude_patterns"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	in := sources.PreflightInput{RootPath: req.RootPath}
	if req.ExcludePatterns != nil {
		in.ExcludePatterns = *req.ExcludePatterns
		in.HasPatterns = true
	}
	preview, err := s.sources.Preflight(in)
	if err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	WriteData(w, r, preview)
}

func (s *Server) handleAdminCreateSource(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceID        string    `json:"source_id"`
		Name            string    `json:"name"`
		Description     string    `json:"description"`
		RootPath        string    `json:"root_path"`
		ExcludePatterns *[]string `json:"exclude_patterns"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	in := sources.CreateInput{
		SourceID:    req.SourceID,
		Name:        req.Name,
		Description: req.Description,
		RootPath:    req.RootPath,
	}
	if req.ExcludePatterns != nil {
		in.ExcludePatterns = *req.ExcludePatterns
		in.HasPatterns = true
	}

	src, err := s.sources.Create(in)
	if err != nil {
		s.adminAudit(r, "create_source", audit.StatusFailed, CodeValidationError)
		s.writeSourceError(w, r, err)
		return
	}
	s.adminAudit(r, "create_source", audit.StatusSuccess, "")
	WriteData(w, r, src)
}

func (s *Server) handleAdminGetSource(w http.ResponseWriter, r *http.Request) {
	src, err := s.sources.Get(r.PathValue("source_id"))
	if err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	patterns, err := s.sources.ExcludePatterns(src.SourceID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询排除规则失败", nil)
		return
	}
	WriteData(w, r, map[string]any{"source": src, "exclude_patterns": patterns})
}

func (s *Server) handleAdminUpdateSource(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name              *string `json:"name"`
		Description       *string `json:"description"`
		PublicReadEnabled *bool   `json:"public_read_enabled"`
		PublicMountPath   *string `json:"public_mount_path"`
		WebdavEnabled     *bool   `json:"webdav_enabled"`
		ImageBedEnabled   *bool   `json:"image_bed_enabled"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	src, err := s.sources.Update(r.PathValue("source_id"), sources.UpdateInput{
		Name:              req.Name,
		Description:       req.Description,
		PublicReadEnabled: req.PublicReadEnabled,
		PublicMountPath:   req.PublicMountPath,
		WebdavEnabled:     req.WebdavEnabled,
		ImageBedEnabled:   req.ImageBedEnabled,
	})
	if err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	s.adminAudit(r, "update_source", audit.StatusSuccess, "")
	WriteData(w, r, src)
}

func (s *Server) handleAdminSetSourceDisabled(disabled bool) http.HandlerFunc {
	action := "enable_source"
	if disabled {
		action = "disable_source"
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if err := s.sources.SetDisabled(r.PathValue("source_id"), disabled); err != nil {
			s.writeSourceError(w, r, err)
			return
		}
		s.adminAudit(r, action, audit.StatusSuccess, "")
		WriteData(w, r, map[string]any{"ok": true})
	}
}

func (s *Server) handleAdminDeleteSource(w http.ResponseWriter, r *http.Request) {
	if err := s.sources.Delete(r.PathValue("source_id")); err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	s.adminAudit(r, "delete_source", audit.StatusSuccess, "")
	// 前端必须提示：此操作只移除 OmniStore 记录，不删除磁盘真实文件（README §10.4）。
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handleAdminSetExcludePatterns(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Patterns []string `json:"patterns"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.sources.SetExcludePatterns(r.PathValue("source_id"), req.Patterns); err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	s.adminAudit(r, "update_exclude_patterns", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"ok": true})
}

// --- 管理员：权限分配 ---

func (s *Server) handleAdminListPermissions(w http.ResponseWriter, r *http.Request) {
	if _, err := s.sources.Get(r.PathValue("source_id")); err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	list, err := s.sources.PermissionsOfSource(r.PathValue("source_id"))
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询权限失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: list, Total: int64(len(list))})
}

func (s *Server) handleAdminSetPermission(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		WriteError(w, r, CodeValidationError, "非法用户 ID", nil)
		return
	}
	var req struct {
		Permission string `json:"permission"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if _, err := s.users.GetByID(id); err != nil {
		WriteError(w, r, CodeValidationError, "用户不存在", nil)
		return
	}
	if err := s.sources.SetPermission(id, r.PathValue("source_id"), req.Permission); err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	s.adminAudit(r, "grant_permission", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handleAdminRemovePermission(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		WriteError(w, r, CodeValidationError, "非法用户 ID", nil)
		return
	}
	if err := s.sources.RemovePermission(id, r.PathValue("source_id")); err != nil {
		WriteError(w, r, CodeInternalError, "取消权限失败", nil)
		return
	}
	s.adminAudit(r, "revoke_permission", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"ok": true})
}

// --- 登录用户：可访问存储源列表 ---

func (s *Server) handleListMySources(w http.ResponseWriter, r *http.Request) {
	list, err := s.sources.ListForUser(CurrentUser(r.Context()))
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询存储源失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: list, Total: int64(len(list))})
}
