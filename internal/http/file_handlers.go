package httpserver

import (
	"errors"
	"fmt"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

// resolveSource 解析系统生成的不透明 key，并检查存储源存在且未禁用。
// 路径级权限必须在规范化实际操作路径后由 authorizeSourcePath 检查。
func (s *Server) resolveSource(w http.ResponseWriter, r *http.Request) *models.StorageSource {
	return s.resolveSourceKey(w, r, r.PathValue("key"))
}

func (s *Server) resolveSourceKey(w http.ResponseWriter, r *http.Request, sourceKey string) *models.StorageSource {
	src, err := s.sources.Get(sourceKey)
	if err != nil {
		if errors.Is(err, sources.ErrNotFound) {
			WriteError(w, r, CodeSourceNotFound, "存储源不存在", nil)
		} else {
			WriteError(w, r, CodeInternalError, "查询存储源失败", nil)
		}
		return nil
	}
	if src.IsDisabled {
		WriteError(w, r, CodeSourceDisabled, "存储源已禁用", nil)
		return nil
	}

	return src
}

func (s *Server) authorizeSourcePath(w http.ResponseWriter, r *http.Request, src *models.StorageSource, relPath string, needWrite, subtree bool) bool {
	normalized, err := security.NormalizeRelPath(relPath)
	if err != nil {
		WriteError(w, r, CodePathInvalid, err.Error(), nil)
		return false
	}
	user := CurrentUser(r.Context())
	var allowed bool
	if subtree && needWrite {
		allowed, err = s.sources.CanWriteSubtree(user, src.Key, normalized)
	} else if subtree {
		allowed, err = s.sources.CanReadSubtree(user, src.Key, normalized)
	} else if needWrite {
		allowed, err = s.sources.CanWritePath(user, src.Key, normalized)
	} else {
		allowed, err = s.sources.CanReadPath(user, src.Key, normalized)
	}
	if err != nil {
		WriteError(w, r, CodeInternalError, "权限检查失败", nil)
		return false
	}
	if !allowed {
		WriteError(w, r, CodeForbidden, "没有该路径的访问权限", nil)
		return false
	}
	return true
}

func joinPolicyPath(parent, name string) (string, error) {
	parent, err := security.NormalizeRelPath(parent)
	if err != nil {
		return "", err
	}
	if err := security.ValidateFileName(name); err != nil {
		return "", err
	}
	if parent == "" {
		return name, nil
	}
	return parent + "/" + name, nil
}

// writeFileError 映射文件服务错误到统一错误码。
func writeFileError(w http.ResponseWriter, r *http.Request, err error) {
	var maxBytesErr *http.MaxBytesError
	switch {
	case errors.Is(err, files.ErrNotFound):
		WriteError(w, r, CodeFileNotFound, "文件不存在", nil)
	case errors.Is(err, files.ErrTrashNotFound):
		WriteError(w, r, CodeFileNotFound, "回收站条目不存在", nil)
	case errors.Is(err, files.ErrAlreadyExists):
		WriteError(w, r, CodeFileAlreadyExists, "目标已存在", nil)
	case errors.Is(err, files.ErrPathExcluded):
		WriteError(w, r, CodePathExcluded, "路径不可访问", nil)
	case errors.Is(err, files.ErrUnsupported):
		WriteError(w, r, CodePathInvalid, "不支持的文件类型", nil)
	case errors.Is(err, files.ErrInvalid):
		WriteError(w, r, CodePathInvalid, err.Error(), nil)
	case errors.Is(err, files.ErrLocked):
		WriteError(w, r, CodeLocked, "资源已被 WebDAV 锁定", nil)
	case errors.Is(err, files.ErrQuotaExceeded):
		WriteError(w, r, CodeInsufficientStorage, err.Error(), nil)
	case errors.As(err, &maxBytesErr):
		WriteError(w, r, CodePayloadTooLarge, "文件超过大小限制", nil)
	default:
		WriteError(w, r, CodeInternalError, "文件操作失败", nil)
	}
}

// fileAudit 记录文件写操作审计（README §20.1）。
func (s *Server) fileAudit(r *http.Request, action string, src *models.StorageSource, relPath, targetRel string, opErr error) {
	u := CurrentUser(r.Context())
	e := audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryWeb, Action: action,
		StorageSourceID: &src.ID, RelativePath: relPath, TargetRelativePath: targetRel,
		IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(),
		Status: audit.StatusSuccess,
	}
	if opErr != nil {
		e.Status = audit.StatusFailed
		e.ErrorCode = CodeInternalError
	}
	s.audit.Log(e)
}

// --- 文件列表 / 信息 ---

func (s *Server) handleListFiles(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	q := r.URL.Query()
	if !s.authorizeSourcePath(w, r, src, q.Get("path"), false, false) {
		return
	}
	page, _ := strconv.Atoi(q.Get("page"))
	pageSize, _ := strconv.Atoi(q.Get("page_size"))

	result, err := s.files.List(src, q.Get("path"), files.ListOptions{
		Page: page, PageSize: pageSize,
		Sort: q.Get("sort"), Order: q.Get("order"),
	}, true)
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	WriteData(w, r, result)
}

func (s *Server) handleStatFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	if !s.authorizeSourcePath(w, r, src, r.URL.Query().Get("path"), false, false) {
		return
	}
	entry, err := s.files.Stat(src, r.URL.Query().Get("path"))
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	WriteData(w, r, entry)
}

// --- 下载（README §13.9/§13.10/§13.11） ---

// sanitizeFilename 清理响应头文件名中的危险字符，防 header 注入。
func sanitizeFilename(name string) string {
	name = strings.NewReplacer("\r", "", "\n", "", "\"", "'").Replace(name)
	return name
}

func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	relPath := r.URL.Query().Get("path")
	if !s.authorizeSourcePath(w, r, src, relPath, false, false) {
		return
	}
	f, info, unlock, err := s.files.OpenForRead(src, relPath)
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	defer unlock()
	defer f.Close()

	// 私有下载默认强制下载 + 不缓存。
	filename := sanitizeFilename(path.Base("/" + relPath))
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

// --- 写操作 ---

func (s *Server) handleCreateFolder(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	target, err := joinPolicyPath(req.Path, req.Name)
	if err != nil {
		writeFileError(w, r, fmt.Errorf("%w: %s", files.ErrInvalid, err))
		return
	}
	if !s.authorizeSourcePath(w, r, src, target, true, false) {
		return
	}
	relPath, err := s.files.Mkdir(src, req.Path, req.Name)
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "create_folder", src, relPath, "", nil)
	WriteData(w, r, map[string]any{"path": "/" + relPath})
}

func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}

	maxBytes := s.cfg.Upload.MaxFileSizeMB*1024*1024 + 1024*1024 // multipart 元数据余量
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)

	mr, err := r.MultipartReader()
	if err != nil {
		WriteError(w, r, CodeValidationError, "请求必须是 multipart/form-data", nil)
		return
	}

	dirRel := r.URL.Query().Get("path")
	overwrite := r.URL.Query().Get("overwrite") == "true"

	for {
		part, err := mr.NextPart()
		if err != nil {
			WriteError(w, r, CodeValidationError, "缺少 file 字段", nil)
			return
		}
		if part.FormName() != "file" {
			continue
		}
		filename := path.Base(part.FileName())
		target, pathErr := joinPolicyPath(dirRel, filename)
		if pathErr != nil {
			writeFileError(w, r, fmt.Errorf("%w: %s", files.ErrInvalid, pathErr))
			return
		}
		if !s.authorizeSourcePath(w, r, src, target, true, false) {
			return
		}
		user := CurrentUser(r.Context())
		relPath, size, err := s.files.UploadWithLockTokens(src, dirRel, filename, part, overwrite, nil, &user.ID)
		if err != nil {
			s.fileAudit(r, "upload", src, dirRel+"/"+filename, "", err)
			writeFileError(w, r, err)
			return
		}
		s.fileAudit(r, "upload", src, relPath, "", nil)
		WriteData(w, r, map[string]any{"path": "/" + relPath, "size": size})
		return
	}
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	relPath := r.URL.Query().Get("path")
	if !s.authorizeSourcePath(w, r, src, relPath, true, true) {
		return
	}
	user := CurrentUser(r.Context())
	entry, err := s.files.MoveToTrash(src, relPath, user.ID)
	if err != nil {
		s.fileAudit(r, "trash", src, strings.TrimPrefix(relPath, "/"), "", err)
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "trash", src, strings.TrimPrefix(relPath, "/"), "", nil)
	WriteData(w, r, entry)
}

func (s *Server) handleListTrash(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil || !s.authorizeSourcePath(w, r, src, "", false, false) {
		return
	}
	user := CurrentUser(r.Context())
	entries, err := s.files.ListTrash(src, user.ID, user.IsAdmin())
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询回收站失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: entries, Total: int64(len(entries))})
}

func (s *Server) handleRestoreTrash(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	entry, err := s.files.GetTrash(src, r.PathValue("trashKey"))
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	user := CurrentUser(r.Context())
	if !user.IsAdmin() && entry.DeletedByUserID != user.ID {
		WriteError(w, r, CodeForbidden, "无权恢复该回收站条目", nil)
		return
	}
	var req struct {
		TargetPath string `json:"target_path"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	targetPath := req.TargetPath
	if strings.TrimSpace(targetPath) == "" {
		targetPath = entry.OriginalRelativePath
	}
	if !s.authorizeSourcePath(w, r, src, targetPath, true, true) {
		return
	}
	restored, err := s.files.RestoreTrash(src, entry.Key, targetPath, user.ID)
	if err != nil {
		s.fileAudit(r, "restore", src, entry.OriginalRelativePath, strings.TrimPrefix(targetPath, "/"), err)
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "restore", src, entry.OriginalRelativePath, restored.OriginalRelativePath, nil)
	WriteData(w, r, restored)
}

func (s *Server) handlePurgeTrash(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	entry, err := s.files.GetTrash(src, r.PathValue("trashKey"))
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	user := CurrentUser(r.Context())
	if !user.IsAdmin() && entry.DeletedByUserID != user.ID {
		WriteError(w, r, CodeForbidden, "无权永久清理该回收站条目", nil)
		return
	}
	if !s.authorizeSourcePath(w, r, src, entry.OriginalRelativePath, false, false) {
		return
	}
	if err := s.files.PurgeTrash(src, entry.Key); err != nil {
		s.fileAudit(r, "purge", src, entry.OriginalRelativePath, "", err)
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "purge", src, entry.OriginalRelativePath, "", nil)
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handleRenameFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	var req struct {
		Path    string `json:"path"`
		NewName string `json:"new_name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	oldRel, err := security.NormalizeRelPath(req.Path)
	if err != nil || oldRel == "" {
		writeFileError(w, r, fmt.Errorf("%w: 非法路径", files.ErrInvalid))
		return
	}
	parent := path.Dir(oldRel)
	if parent == "." {
		parent = ""
	}
	newRel, err := joinPolicyPath(parent, req.NewName)
	if err != nil {
		writeFileError(w, r, fmt.Errorf("%w: %s", files.ErrInvalid, err))
		return
	}
	if !s.authorizeSourcePath(w, r, src, oldRel, true, true) || !s.authorizeSourcePath(w, r, src, newRel, true, true) {
		return
	}
	user := CurrentUser(r.Context())
	newRel, err = s.files.RenameAs(src, req.Path, req.NewName, &user.ID)
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "rename", src, strings.TrimPrefix(req.Path, "/"), newRel, nil)
	WriteData(w, r, map[string]any{"path": "/" + newRel})
}

func (s *Server) handleMoveFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	var req struct {
		Path            string `json:"path"`
		TargetSourceKey string `json:"target_source_key"`
		TargetPath      string `json:"target_path"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	target := src
	if req.TargetSourceKey != "" && req.TargetSourceKey != src.Key {
		target = s.resolveSourceKey(w, r, req.TargetSourceKey)
		if target == nil {
			return
		}
	}
	if !s.authorizeSourcePath(w, r, src, req.Path, true, true) || !s.authorizeSourcePath(w, r, target, req.TargetPath, true, true) {
		return
	}
	user := CurrentUser(r.Context())
	result, err := s.files.MoveAcrossSources(src, target, req.Path, req.TargetPath, &user.ID)
	if err != nil {
		s.fileAudit(r, "move", src, strings.TrimPrefix(req.Path, "/"), strings.TrimPrefix(req.TargetPath, "/"), err)
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "move", src, strings.TrimPrefix(req.Path, "/"), result.Path, nil)
	result.Path = "/" + result.Path
	WriteData(w, r, result)
}

func (s *Server) handleCopyFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	var req struct {
		Path            string `json:"path"`
		TargetSourceKey string `json:"target_source_key"`
		TargetPath      string `json:"target_path"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	target := src
	if req.TargetSourceKey != "" && req.TargetSourceKey != src.Key {
		target = s.resolveSourceKey(w, r, req.TargetSourceKey)
		if target == nil {
			return
		}
	}
	if !s.authorizeSourcePath(w, r, src, req.Path, false, true) || !s.authorizeSourcePath(w, r, target, req.TargetPath, true, true) {
		return
	}
	user := CurrentUser(r.Context())
	result, err := s.files.Copy(src, target, req.Path, req.TargetPath, &user.ID)
	if err != nil {
		s.fileAudit(r, "copy", src, strings.TrimPrefix(req.Path, "/"), strings.TrimPrefix(req.TargetPath, "/"), err)
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "copy", src, strings.TrimPrefix(req.Path, "/"), result.Path, nil)
	result.Path = "/" + result.Path
	WriteData(w, r, result)
}

func (s *Server) handlePathPermission(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r)
	if src == nil {
		return
	}
	relPath, err := security.NormalizeRelPath(r.URL.Query().Get("path"))
	if err != nil {
		WriteError(w, r, CodePathInvalid, err.Error(), nil)
		return
	}
	permission, err := s.sources.PermissionAtPath(CurrentUser(r.Context()), src.Key, relPath)
	if err != nil {
		WriteError(w, r, CodeInternalError, "权限检查失败", nil)
		return
	}
	if permission == "" {
		WriteError(w, r, CodeForbidden, "没有该路径的访问权限", nil)
		return
	}
	WriteData(w, r, map[string]string{"permission": permission})
}
