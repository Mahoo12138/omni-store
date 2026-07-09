package httpserver

import (
	"errors"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

// resolveSource 解析 source_id 并执行统一检查链路（README §28）：
// 存储源存在 -> 未禁用 -> 用户权限。needWrite 为 true 时要求读写权限。
func (s *Server) resolveSource(w http.ResponseWriter, r *http.Request, needWrite bool) *models.StorageSource {
	sourceID := r.PathValue("source_id")
	src, err := s.sources.Get(sourceID)
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

	user := CurrentUser(r.Context())
	var allowed bool
	if needWrite {
		allowed, err = s.sources.CanWriteSource(user, sourceID)
	} else {
		allowed, err = s.sources.CanReadSource(user, sourceID)
	}
	if err != nil {
		WriteError(w, r, CodeInternalError, "权限检查失败", nil)
		return nil
	}
	if !allowed {
		WriteError(w, r, CodeForbidden, "没有该存储源的访问权限", nil)
		return nil
	}
	return src
}

// writeFileError 映射文件服务错误到统一错误码。
func writeFileError(w http.ResponseWriter, r *http.Request, err error) {
	var maxBytesErr *http.MaxBytesError
	switch {
	case errors.Is(err, files.ErrNotFound):
		WriteError(w, r, CodeFileNotFound, "文件不存在", nil)
	case errors.Is(err, files.ErrAlreadyExists):
		WriteError(w, r, CodeFileAlreadyExists, "目标已存在", nil)
	case errors.Is(err, files.ErrPathExcluded):
		WriteError(w, r, CodePathExcluded, "路径不可访问", nil)
	case errors.Is(err, files.ErrUnsupported):
		WriteError(w, r, CodePathInvalid, "不支持的文件类型", nil)
	case errors.Is(err, files.ErrInvalid):
		WriteError(w, r, CodePathInvalid, err.Error(), nil)
	case errors.As(err, &maxBytesErr):
		WriteError(w, r, CodePayloadTooLarge, "文件超过大小限制", nil)
	default:
		WriteError(w, r, CodeInternalError, "文件操作失败", nil)
	}
}

// fileAudit 记录文件写操作审计（README §20.1）。
func (s *Server) fileAudit(r *http.Request, action, sourceID, relPath, targetRel string, opErr error) {
	u := CurrentUser(r.Context())
	e := audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryWeb, Action: action,
		SourceID: sourceID, RelativePath: relPath, TargetRelativePath: targetRel,
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
	src := s.resolveSource(w, r, false)
	if src == nil {
		return
	}
	q := r.URL.Query()
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
	src := s.resolveSource(w, r, false)
	if src == nil {
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
	src := s.resolveSource(w, r, false)
	if src == nil {
		return
	}
	relPath := r.URL.Query().Get("path")
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
	src := s.resolveSource(w, r, true)
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
	relPath, err := s.files.Mkdir(src, req.Path, req.Name)
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "create_folder", src.SourceID, relPath, "", nil)
	WriteData(w, r, map[string]any{"path": "/" + relPath})
}

func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r, true)
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
		relPath, size, err := s.files.Upload(src, dirRel, filename, part, overwrite)
		if err != nil {
			s.fileAudit(r, "upload", src.SourceID, dirRel+"/"+filename, "", err)
			writeFileError(w, r, err)
			return
		}
		s.fileAudit(r, "upload", src.SourceID, relPath, "", nil)
		WriteData(w, r, map[string]any{"path": "/" + relPath, "size": size})
		return
	}
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r, true)
	if src == nil {
		return
	}
	relPath := r.URL.Query().Get("path")
	if err := s.files.Delete(src, relPath); err != nil {
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "delete", src.SourceID, strings.TrimPrefix(relPath, "/"), "", nil)
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handleRenameFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r, true)
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
	newRel, err := s.files.Rename(src, req.Path, req.NewName)
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "rename", src.SourceID, strings.TrimPrefix(req.Path, "/"), newRel, nil)
	WriteData(w, r, map[string]any{"path": "/" + newRel})
}

func (s *Server) handleMoveFile(w http.ResponseWriter, r *http.Request) {
	src := s.resolveSource(w, r, true)
	if src == nil {
		return
	}
	var req struct {
		Path       string `json:"path"`
		TargetPath string `json:"target_path"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	newRel, err := s.files.Move(src, req.Path, req.TargetPath)
	if err != nil {
		writeFileError(w, r, err)
		return
	}
	s.fileAudit(r, "move", src.SourceID, strings.TrimPrefix(req.Path, "/"), newRel, nil)
	WriteData(w, r, map[string]any{"path": "/" + newRel})
}
