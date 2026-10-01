package httpserver

import (
	"archive/zip"
	"errors"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/transfers"
)

// --- 流转中心（2.0 Phase 4）：所有者 API + 公开取件/提交 API ---

func writeTransferError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, transfers.ErrNotFound):
		WriteError(w, r, CodeFileNotFound, "任务不存在或已撤销", nil)
	case errors.Is(err, transfers.ErrExpired):
		WriteError(w, r, CodeTransferExpired, "任务已过期", nil)
	case errors.Is(err, transfers.ErrRevoked):
		WriteError(w, r, CodeFileNotFound, "任务已撤销", nil)
	case errors.Is(err, transfers.ErrClosed):
		WriteError(w, r, CodeTransferExpired, "收集任务已关闭", nil)
	case errors.Is(err, transfers.ErrPickupCode):
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	case errors.Is(err, transfers.ErrPassword):
		WriteError(w, r, CodeForbidden, err.Error(), nil)
	case errors.Is(err, transfers.ErrDownloadLimit):
		WriteError(w, r, CodeForbidden, err.Error(), nil)
	case errors.Is(err, transfers.ErrQuotaExceeded):
		WriteError(w, r, CodeInsufficientStorage, err.Error(), nil)
	case errors.Is(err, transfers.ErrFileSizeExceeded), errors.Is(err, transfers.ErrTotalSizeExceeded),
		errors.Is(err, transfers.ErrTypeNotAllowed), errors.Is(err, transfers.ErrNameRequired),
		errors.Is(err, transfers.ErrNoteRequired):
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	case errors.Is(err, transfers.ErrNotDraft), errors.Is(err, transfers.ErrNoFiles),
		errors.Is(err, transfers.ErrConflictState), errors.Is(err, transfers.ErrSettingsInvalid):
		WriteError(w, r, CodeConflict, err.Error(), nil)
	case errors.Is(err, files.ErrAlreadyExists):
		WriteError(w, r, CodeFileAlreadyExists, err.Error(), nil)
	case errors.Is(err, files.ErrQuotaExceeded):
		WriteError(w, r, CodeInsufficientStorage, err.Error(), nil)
	default:
		WriteError(w, r, CodeInternalError, "流转操作失败", nil)
	}
}

func bearerToken(r *http.Request) string {
	authz := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(authz) <= len(prefix) || !strings.EqualFold(authz[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(authz[len(prefix):])
}

// --- 所有者：发件包 ---

func (s *Server) handleCreateTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title          string `json:"title"`
		Description    string `json:"description"`
		ExpiresInHours *int64 `json:"expires_in_hours"`
		MaxDownloads   *int64 `json:"max_downloads"`
		Password       string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user := CurrentUser(r.Context())
	send, pickupCode, err := s.transfers.CreateSend(transfers.CreateSendInput{
		OwnerUserID: user.ID, Title: req.Title, Description: req.Description,
		ExpiresInHours: req.ExpiresInHours, MaxDownloads: req.MaxDownloads, Password: req.Password,
	})
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "transfer_create", Status: audit.StatusSuccess,
	})
	// 取件码只在此响应中出现一次。
	WriteData(w, r, map[string]any{"send": send, "pickup_code": pickupCode})
}

func (s *Server) handleListMyTransfers(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	items, err := s.transfers.ListSendsByOwner(user.ID)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: int64(len(items))})
}

func (s *Server) handleFinalizeTransfer(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	id, err := strconv.ParseInt(r.PathValue("transferID"), 10, 64)
	if err != nil {
		WriteError(w, r, CodeValidationError, "任务 ID 非法", nil)
		return
	}
	send, err := s.transfers.FinalizeSend(id, user.ID)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "transfer_finalize", Status: audit.StatusSuccess,
	})
	WriteData(w, r, send)
}

func (s *Server) handleRevokeTransfer(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	id, err := strconv.ParseInt(r.PathValue("transferID"), 10, 64)
	if err != nil {
		WriteError(w, r, CodeValidationError, "任务 ID 非法", nil)
		return
	}
	if err := s.transfers.RevokeSend(id, user.ID); err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "transfer_revoke", Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"ok": true})
}

// handleTransferStoreCopy 把已有普通文件/目录复制进草稿（保留目录结构）。
func (s *Server) handleTransferStoreCopy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceKey string   `json:"source_key"`
		Paths     []string `json:"paths"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user := CurrentUser(r.Context())
	id, err := strconv.ParseInt(r.PathValue("transferID"), 10, 64)
	if err != nil {
		WriteError(w, r, CodeValidationError, "任务 ID 非法", nil)
		return
	}
	if len(req.Paths) == 0 || len(req.Paths) > 50 {
		WriteError(w, r, CodeValidationError, "请选择 1 到 50 个路径", nil)
		return
	}
	// 用户必须对每个来源路径子树有读权限（逐路径 Policy，AGENT_GUIDE §8）。
	for _, path := range req.Paths {
		allowed, err := s.sources.CanReadSubtree(user, req.SourceKey, path)
		if err != nil {
			WriteError(w, r, CodeInternalError, "检查读取权限失败", nil)
			return
		}
		if !allowed {
			WriteError(w, r, CodeForbidden, "没有该路径的读取权限", nil)
			return
		}
	}
	copied := []any{}
	for _, path := range req.Paths {
		files, err := s.transfers.AddSendFilesFromStore(id, user.ID, req.SourceKey, path)
		if err != nil {
			writeTransferError(w, r, err)
			return
		}
		for _, file := range files {
			copied = append(copied, file)
		}
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "transfer_copy_from_store", Status: audit.StatusSuccess,
	})
	WriteData(w, r, ListData{Items: copied, Total: int64(len(copied))})
}

// handleTransferUpload 直传一个文件进草稿（multipart，含 relative_path）。
func (s *Server) handleTransferUpload(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	id, err := strconv.ParseInt(r.PathValue("transferID"), 10, 64)
	if err != nil {
		WriteError(w, r, CodeValidationError, "任务 ID 非法", nil)
		return
	}
	relativePath := strings.TrimSpace(r.FormValue("relative_path"))
	if relativePath == "" {
		part, err := r.MultipartReader()
		if err == nil {
			for {
				header, partErr := part.NextPart()
				if partErr != nil {
					break
				}
				if header.FormName() == "relative_path" {
					value, _ := io.ReadAll(io.LimitReader(header, 4097))
					relativePath = strings.TrimSpace(string(value))
					break
				}
			}
		}
	}
	if relativePath == "" {
		WriteError(w, r, CodeValidationError, "缺少 relative_path", nil)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		WriteError(w, r, CodeValidationError, "缺少 file 字段", nil)
		return
	}
	defer file.Close()
	_ = header
	created, err := s.transfers.AddSendUpload(id, user.ID, relativePath, file)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "transfer_upload", RelativePath: relativePath, Status: audit.StatusSuccess,
	})
	WriteData(w, r, created)
}

// --- 所有者：收集任务 ---

func (s *Server) handleCreateCollection(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title          string   `json:"title"`
		Description    string   `json:"description"`
		ExpiresInHours *int64   `json:"expires_in_hours"`
		Password       string   `json:"password"`
		MaxFileSizeMB  *int64   `json:"max_file_size_mb"`
		MaxTotalSizeMB *int64   `json:"max_total_size_mb"`
		RequireName    bool     `json:"require_name"`
		RequireNote    bool     `json:"require_note"`
		AllowedExts    []string `json:"allowed_exts"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user := CurrentUser(r.Context())
	collection, code, err := s.transfers.CreateCollection(transfers.CreateCollectionInput{
		OwnerUserID: user.ID, Title: req.Title, Description: req.Description,
		ExpiresInHours: req.ExpiresInHours, Password: req.Password,
		MaxFileSizeMB: req.MaxFileSizeMB, MaxTotalSizeMB: req.MaxTotalSizeMB,
		RequireName: req.RequireName, RequireNote: req.RequireNote, AllowedExts: req.AllowedExts,
	})
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "collection_create", Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"collection": collection, "code": code})
}

func (s *Server) handleListMyCollections(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	items, err := s.transfers.ListCollectionsByOwner(user.ID)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: int64(len(items))})
}

func (s *Server) handleCloseCollection(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	id, err := strconv.ParseInt(r.PathValue("collectionID"), 10, 64)
	if err != nil {
		WriteError(w, r, CodeValidationError, "任务 ID 非法", nil)
		return
	}
	if err := s.transfers.CloseCollection(id, user.ID); err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "collection_close", Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handleCollectionInbox(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	id, err := strconv.ParseInt(r.PathValue("collectionID"), 10, 64)
	if err != nil {
		WriteError(w, r, CodeValidationError, "任务 ID 非法", nil)
		return
	}
	items, err := s.transfers.ListSubmissions(id, user.ID)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: int64(len(items))})
}

func (s *Server) handleSubmissionDownload(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	ids, ok := parseTransferPathIDs(w, r, "collectionID", "submissionID", "fileID")
	if !ok {
		return
	}
	_, relativePath, f, info, unlock, err := s.transfers.OpenSubmissionFile(ids[0], user.ID, ids[1], ids[2])
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	defer unlock()
	defer f.Close()
	if err := setUserContentHeaders(w, f, sanitizeFilename(path.Base(relativePath)), true); err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

// handleSubmissionSaveToFiles 把提交复制到有写权限的普通目录。
func (s *Server) handleSubmissionSaveToFiles(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceKey string `json:"source_key"`
		Path      string `json:"path"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user := CurrentUser(r.Context())
	ids, ok := parseTransferPathIDs(w, r, "collectionID", "submissionID")
	if !ok {
		return
	}
	allowed, err := s.sources.CanWriteSubtree(user, req.SourceKey, req.Path)
	if err != nil {
		WriteError(w, r, CodeInternalError, "检查写入权限失败", nil)
		return
	}
	if !allowed {
		WriteError(w, r, CodeForbidden, "没有该目录的写权限", nil)
		return
	}
	saved, err := s.transfers.SaveSubmissionToFiles(ids[0], user.ID, ids[1], req.SourceKey, req.Path)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryTransfer,
		Action: "submission_save_to_files", RelativePath: req.Path, Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"saved": saved})
}

func parseTransferPathIDs(w http.ResponseWriter, r *http.Request, names ...string) ([]int64, bool) {
	ids := make([]int64, 0, len(names))
	for _, name := range names {
		id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
		if err != nil || id <= 0 {
			WriteError(w, r, CodeValidationError, "路径 ID 非法", nil)
			return nil, false
		}
		ids = append(ids, id)
	}
	return ids, true
}

// --- 管理员：流转中心设置 ---

func (s *Server) handleAdminGetTransferSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.transfers.GetSettings()
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	WriteData(w, r, settings)
}

func (s *Server) handleAdminSetTransferSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ActiveQuotaBytes   *int64 `json:"active_quota_bytes"`
		DefaultExpiryHours *int64 `json:"default_expiry_hours"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	current, err := s.transfers.GetSettings()
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	if req.ActiveQuotaBytes != nil {
		current.ActiveQuotaBytes = *req.ActiveQuotaBytes
	}
	if req.DefaultExpiryHours != nil {
		current.DefaultExpiryHours = *req.DefaultExpiryHours
	}
	if err := s.transfers.SetSettings(*current); err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.adminAudit(r, "update_transfer_settings", audit.StatusSuccess, "")
	WriteData(w, r, current)
}

// --- 公开：取件（Send） ---

func (s *Server) handlePublicTransferLookup(w http.ResponseWriter, r *http.Request) {
	info, err := s.transfers.LookupSend(r.PathValue("publicKey"))
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	WriteData(w, r, info)
}

func (s *Server) handlePublicTransferUnlock(w http.ResponseWriter, r *http.Request) {
	ip := s.proxy.ClientIP(r)
	// 按「IP + 任务」限流：一个目标的爆破不锁死其他任务的合法取件。
	if !s.transferUnlockLimiter.Allow(ip + "|" + r.PathValue("publicKey")) {
		WriteError(w, r, CodeRateLimited, "尝试过于频繁，请稍后再试", nil)
		return
	}
	var req struct {
		PickupCode string `json:"pickup_code"`
		Password   string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	token, expires, err := s.transfers.UnlockSend(r.PathValue("publicKey"), req.PickupCode, req.Password)
	if err != nil {
		s.audit.Log(audit.Entry{
			ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
			Action: "transfer_unlock", IPAddress: ip, Status: audit.StatusFailed, ErrorCode: err.Error(),
		})
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
		Action: "transfer_unlock", IPAddress: ip, Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"token": token, "expires_at": expires})
}

func (s *Server) handlePublicTransferFiles(w http.ResponseWriter, r *http.Request) {
	items, err := s.transfers.ListSendFiles(r.PathValue("publicKey"), bearerToken(r))
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: int64(len(items))})
}

func (s *Server) handlePublicTransferFile(w http.ResponseWriter, r *http.Request) {
	publicKey := r.PathValue("publicKey")
	fileID, err := strconv.ParseInt(r.PathValue("fileID"), 10, 64)
	if err != nil {
		WriteError(w, r, CodeValidationError, "文件 ID 非法", nil)
		return
	}
	send, src, err := s.transfers.ReserveSendDownload(publicKey, bearerToken(r))
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	file, f, info, unlock, err := s.transfers.OpenSendFile(src, publicKey, fileID)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	defer unlock()
	defer f.Close()
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
		Action: "transfer_download", StorageSourceID: &send.ID, RelativePath: file.RelativePath,
		Status: audit.StatusSuccess,
	})
	inline := r.URL.Query().Get("inline") == "1"
	if err := setUserContentHeaders(w, f, sanitizeFilename(path.Base(file.RelativePath)), !inline); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

// handlePublicTransferArchive 流式打包全部文件；占用一次下载名额。
func (s *Server) handlePublicTransferArchive(w http.ResponseWriter, r *http.Request) {
	publicKey := r.PathValue("publicKey")
	send, src, err := s.transfers.ReserveSendDownload(publicKey, bearerToken(r))
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	files, err := s.transfers.ListSendFilesByID(send.ID)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
		Action: "transfer_archive", StorageSourceID: &send.ID, Status: audit.StatusSuccess,
	})
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{
		"filename": sanitizeFilename(send.Title) + ".zip",
	}))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()
	for _, file := range files {
		inner, info, unlock, err := s.transfers.OpenManagedForDownload(src, publicKey, file.ID)
		if err != nil {
			return // 已开始写流，只能截断；名额已计。
		}
		header := &zip.FileHeader{Name: file.RelativePath, Method: zip.Deflate}
		header.SetModTime(info.ModTime())
		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			unlock()
			return
		}
		_, copyErr := io.Copy(writer, inner)
		closeErr := inner.Close()
		unlock()
		if copyErr != nil || closeErr != nil {
			return
		}
	}
}

// --- 公开：收集（Collect） ---

func (s *Server) handlePublicCollectionLookup(w http.ResponseWriter, r *http.Request) {
	info, err := s.transfers.LookupCollection(r.PathValue("publicKey"))
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	WriteData(w, r, info)
}

func (s *Server) handlePublicCollectionUnlock(w http.ResponseWriter, r *http.Request) {
	ip := s.proxy.ClientIP(r)
	if !s.transferUnlockLimiter.Allow(ip + "|" + r.PathValue("publicKey")) {
		WriteError(w, r, CodeRateLimited, "尝试过于频繁，请稍后再试", nil)
		return
	}
	var req struct {
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	token, expires, err := s.transfers.UnlockCollection(r.PathValue("publicKey"), req.Code, req.Password)
	if err != nil {
		s.audit.Log(audit.Entry{
			ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
			Action: "collection_unlock", IPAddress: ip, Status: audit.StatusFailed, ErrorCode: err.Error(),
		})
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
		Action: "collection_unlock", IPAddress: ip, Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"token": token, "expires_at": expires})
}

// handlePublicCollectionSubmit 匿名 upload-only 提交：只能写入自己的提交，
// 无列举、无读取、无覆盖他人提交的入口。
func (s *Server) handlePublicCollectionSubmit(w http.ResponseWriter, r *http.Request) {
	ip := s.proxy.ClientIP(r)
	if !s.collectionSubmitLimiter.Allow(ip + "|" + r.PathValue("publicKey")) {
		WriteError(w, r, CodeRateLimited, "提交过于频繁，请稍后再试", nil)
		return
	}
	publicKey := r.PathValue("publicKey")
	token := bearerToken(r)
	if token == "" {
		WriteError(w, r, CodeUnauthorized, "请先使用收件码解锁", nil)
		return
	}
	if err := r.ParseMultipartForm(s.cfg.Upload.MaxFileSizeMB*1024*1024 + 1024*1024); err != nil {
		WriteError(w, r, CodeValidationError, "请求必须是 multipart/form-data", nil)
		return
	}
	name := strings.TrimSpace(r.FormValue("name"))
	note := strings.TrimSpace(r.FormValue("note"))
	relativePaths := r.MultipartForm.Value["relative_path"]
	formFiles := r.MultipartForm.File["file"]
	if len(formFiles) == 0 || len(formFiles) != len(relativePaths) {
		WriteError(w, r, CodeValidationError, "file 与 relative_path 数量不匹配", nil)
		return
	}
	incoming := make([]transfers.IncomingSubmissionFile, 0, len(formFiles))
	for i, header := range formFiles {
		file, err := header.Open()
		if err != nil {
			WriteError(w, r, CodeValidationError, "读取上传文件失败", nil)
			return
		}
		defer file.Close()
		incoming = append(incoming, transfers.IncomingSubmissionFile{
			RelativePath: relativePaths[i],
			Body:         file,
		})
	}
	submission, err := s.transfers.SubmitToCollection(publicKey, token, name, note, incoming)
	if err != nil {
		s.audit.Log(audit.Entry{
			ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
			Action: "collection_submit", IPAddress: ip, Status: audit.StatusFailed, ErrorCode: err.Error(),
		})
		writeTransferError(w, r, err)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
		Action: "collection_submit", IPAddress: ip, RelativePath: submission.SubmitterName,
		Status: audit.StatusSuccess,
	})
	WriteData(w, r, submission)
}
