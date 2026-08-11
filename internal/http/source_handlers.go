package httpserver

import (
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/sources"
)

func (s *Server) writeSourceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, sources.ErrNotFound):
		WriteError(w, r, CodeSourceNotFound, err.Error(), nil)
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
		Name            string    `json:"name"`
		Description     string    `json:"description"`
		RootPath        string    `json:"root_path"`
		ExcludePatterns *[]string `json:"exclude_patterns"`
		ImportExisting  bool      `json:"import_existing"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	in := sources.CreateInput{
		Name:           req.Name,
		Description:    req.Description,
		RootPath:       req.RootPath,
		ImportExisting: req.ImportExisting,
	}
	if req.ExcludePatterns != nil {
		in.ExcludePatterns = *req.ExcludePatterns
		in.HasPatterns = true
	}

	src, reconcile, err := s.files.CreateSource(in)
	if err != nil {
		if errors.Is(err, files.ErrSourceInitialization) {
			s.adminAudit(r, "create_source", audit.StatusFailed, CodeInternalError)
			WriteError(w, r, CodeInternalError, "扫描已有文件失败，未创建存储源", nil)
			return
		}
		s.adminAudit(r, "create_source", audit.StatusFailed, CodeValidationError)
		s.writeSourceError(w, r, err)
		return
	}
	s.adminAudit(r, "create_source", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"source": src, "reconcile": reconcile})
}

func (s *Server) handleAdminGetSource(w http.ResponseWriter, r *http.Request) {
	src, err := s.sources.Get(r.PathValue("key"))
	if err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	patterns, err := s.sources.ExcludePatterns(src.ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询排除规则失败", nil)
		return
	}
	quota, err := s.files.StorageQuota(src)
	if err != nil {
		WriteError(w, r, CodeInternalError, "统计存储源用量失败", nil)
		return
	}
	ledgerUsage, err := s.files.LedgerSourceUsage(src.ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询文件台账用量失败", nil)
		return
	}
	WriteData(w, r, map[string]any{
		"source": src, "exclude_patterns": patterns, "quota": quota, "ledger_usage_bytes": ledgerUsage,
	})
}

func (s *Server) handleAdminReconcileSource(w http.ResponseWriter, r *http.Request) {
	src, err := s.sources.Get(r.PathValue("key"))
	if err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	release := s.files.LockQuotaUpdate(src.Key)
	defer release()
	result, err := s.files.ReconcileSource(src)
	if err != nil {
		s.adminAudit(r, "reconcile_source", audit.StatusFailed, CodeInternalError)
		WriteError(w, r, CodeInternalError, "校准文件台账失败", nil)
		return
	}
	s.adminAudit(r, "reconcile_source", audit.StatusSuccess, "")
	WriteData(w, r, result)
}

func (s *Server) handleAdminUpdateSource(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name              *string   `json:"name"`
		Description       *string   `json:"description"`
		PublicReadEnabled *bool     `json:"public_read_enabled"`
		PublicMountPath   *string   `json:"public_mount_path"`
		WebdavEnabled     *bool     `json:"webdav_enabled"`
		ImageBedEnabled   *bool     `json:"image_bed_enabled"`
		QuotaBytes        *int64    `json:"quota_bytes"`
		ExcludePatterns   *[]string `json:"exclude_patterns"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.QuotaBytes != nil {
		releaseQuota := s.files.LockQuotaUpdate(r.PathValue("key"))
		defer releaseQuota()
	}

	src, err := s.sources.Update(r.PathValue("key"), sources.UpdateInput{
		Name:              req.Name,
		Description:       req.Description,
		PublicReadEnabled: req.PublicReadEnabled,
		PublicMountPath:   req.PublicMountPath,
		WebdavEnabled:     req.WebdavEnabled,
		ImageBedEnabled:   req.ImageBedEnabled,
		QuotaBytes:        req.QuotaBytes,
		ExcludePatterns:   req.ExcludePatterns,
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
		if err := s.sources.SetDisabled(r.PathValue("key"), disabled); err != nil {
			s.writeSourceError(w, r, err)
			return
		}
		s.adminAudit(r, action, audit.StatusSuccess, "")
		WriteData(w, r, map[string]any{"ok": true})
	}
}

func (s *Server) handleAdminDeleteSource(w http.ResponseWriter, r *http.Request) {
	src, err := s.sources.Get(r.PathValue("key"))
	if err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	trashCount, err := s.files.SourceTrashCount(src.ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "检查存储源回收站失败", nil)
		return
	}
	if trashCount > 0 {
		WriteError(w, r, CodeConflict, "存储源回收站不为空，请先恢复或永久清理其中内容", map[string]any{"trash_count": trashCount})
		return
	}
	transferCount, err := s.files.SourceTransferOperationCount(src.ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "检查存储源中断移动失败", nil)
		return
	}
	if transferCount > 0 {
		WriteError(w, r, CodeConflict, "存储源存在尚未恢复的跨来源移动，请重启服务完成恢复", map[string]any{"transfer_count": transferCount})
		return
	}
	fileUploadCount, err := s.files.SourceFileUploadOperationCount(src.ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "检查存储源中断普通上传失败", nil)
		return
	}
	if fileUploadCount > 0 {
		WriteError(w, r, CodeConflict, "存储源存在尚未恢复的普通文件上传，请重启服务完成恢复", map[string]any{"upload_count": fileUploadCount})
		return
	}
	if s.s3Multipart != nil {
		partOperationCount, err := s.s3Multipart.SourcePartOperationCount(src.ID)
		if err != nil {
			WriteError(w, r, CodeInternalError, "检查存储源中断 Multipart 分片上传失败", nil)
			return
		}
		if partOperationCount > 0 {
			WriteError(w, r, CodeConflict, "存储源存在尚未恢复的 S3 Multipart 分片上传，请重启服务完成恢复", map[string]any{"multipart_part_count": partOperationCount})
			return
		}
		completionCount, err := s.s3Multipart.SourceCompletionOperationCount(src.ID)
		if err != nil {
			WriteError(w, r, CodeInternalError, "检查存储源中断 Multipart 完成操作失败", nil)
			return
		}
		if completionCount > 0 {
			WriteError(w, r, CodeConflict, "存储源存在尚未恢复的 S3 Multipart 完成操作，请重启服务完成恢复", map[string]any{"multipart_completion_count": completionCount})
			return
		}
	}
	if s.imagebed != nil {
		uploadCount, err := s.imagebed.SourceUploadOperationCount(src.ID)
		if err != nil {
			WriteError(w, r, CodeInternalError, "检查存储源中断图床上传失败", nil)
			return
		}
		if uploadCount > 0 {
			WriteError(w, r, CodeConflict, "存储源存在尚未恢复的图床上传，请重启服务完成恢复", map[string]any{"upload_count": uploadCount})
			return
		}
	}
	if err := s.sources.Delete(src.Key); err != nil {
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
	src, err := s.sources.Get(r.PathValue("key"))
	if err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	if err := s.sources.SetExcludePatterns(src.ID, req.Patterns); err != nil {
		s.writeSourceError(w, r, err)
		return
	}
	s.adminAudit(r, "update_exclude_patterns", audit.StatusSuccess, "")
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

func (s *Server) handleSourceQuota(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	if !s.authorizeSourcePath(w, r, src, "", false, false) {
		return
	}
	quota, err := s.files.StorageQuota(src)
	if err != nil {
		WriteError(w, r, CodeInternalError, "统计存储源用量失败", nil)
		return
	}
	WriteData(w, r, quota)
}
