package httpserver

import (
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/imagebed"
	"github.com/omni-store/omnistore/internal/models"
)

// readMultipartFile 从 multipart 请求中取出 file 字段（流式，不整体读入内存）。
func readMultipartFile(w http.ResponseWriter, r *http.Request, maxBytes int64) (*multipart.Part, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes+1024*1024)
	mr, err := r.MultipartReader()
	if err != nil {
		return nil, errors.New("请求必须是 multipart/form-data")
	}
	for {
		part, err := mr.NextPart()
		if err != nil {
			return nil, errors.New("缺少 file 字段")
		}
		if part.FormName() == "file" {
			return part, nil
		}
	}
}

func writeImageBedError(w http.ResponseWriter, r *http.Request, err error) {
	var maxBytesErr *http.MaxBytesError
	switch {
	case errors.Is(err, imagebed.ErrUnsupportedFormat):
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	case errors.Is(err, imagebed.ErrNoTarget), errors.Is(err, imagebed.ErrTargetInvalid):
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	case errors.Is(err, imagebed.ErrNotFound):
		WriteError(w, r, CodeFileNotFound, "图片不存在", nil)
	case errors.Is(err, imagebed.ErrAnonymousDisabled):
		WriteError(w, r, CodeForbidden, err.Error(), nil)
	case errors.As(err, &maxBytesErr):
		WriteError(w, r, CodePayloadTooLarge, "图片超过大小限制", nil)
	default:
		WriteError(w, r, CodeInternalError, "图床操作失败", nil)
	}
}

// --- 公开图片访问：GET /i/{image_id}.{ext}（README §17.8） ---

func (s *Server) handleServeImage(w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("image_file")
	ext := path.Ext(file) // 含点
	imageID := file[:len(file)-len(ext)]
	if imageID == "" || len(ext) < 2 {
		http.NotFound(w, r)
		return
	}

	img, f, info, unlock, err := s.imagebed.OpenImage(imageID, ext[1:])
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer unlock()
	defer f.Close()

	w.Header().Set("Content-Type", img.MimeType)
	w.Header().Set("Content-Disposition", "inline")
	// 图床 URL 内容不可变，长缓存（README §13.11）。
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(w, r, "", info.ModTime(), f)
}

// handleServeThumbnail 按需生成并返回固定规格缩略图。
func (s *Server) handleServeThumbnail(w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("thumbnail_file")
	if !strings.HasSuffix(file, ".jpg") {
		http.NotFound(w, r)
		return
	}
	imageID := strings.TrimSuffix(file, ".jpg")
	if imageID == "" {
		http.NotFound(w, r)
		return
	}

	f, info, etag, err := s.imagebed.OpenThumbnail(r.Context(), imageID)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Disposition", "inline")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("ETag", etag)
	http.ServeContent(w, r, "", info.ModTime(), f)
}

// --- 登录用户图床（网页端） ---

func (s *Server) handleImageBedTargets(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	targets, err := s.imagebed.Targets(user)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询图床目标失败", nil)
		return
	}
	def, err := s.imagebed.DefaultTarget(user.ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询默认目标失败", nil)
		return
	}
	WriteData(w, r, map[string]any{"targets": targets, "default_key": def})
}

func (s *Server) handleSetImageBedDefaultTarget(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key string `json:"key"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.imagebed.SetDefaultTarget(CurrentUser(r.Context()), req.Key); err != nil {
		writeImageBedError(w, r, err)
		return
	}
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) imageBedAudit(r *http.Request, entryType, action string, userID *int64, storageSourceID *int64, sourceKey string, opErr error) {
	actorType := audit.ActorUser
	if userID == nil {
		actorType = audit.ActorAnonymous
	}
	e := audit.Entry{
		ActorType: actorType, ActorUserID: userID,
		EntryType: entryType, Action: action,
		IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(),
		Status: audit.StatusSuccess,
	}
	if storageSourceID != nil {
		e.StorageSourceID = storageSourceID
	} else if src, err := s.sources.Get(sourceKey); err == nil {
		e.StorageSourceID = &src.ID
	}
	if opErr != nil {
		e.Status = audit.StatusFailed
	}
	s.audit.Log(e)
}

func imageStorageSourceID(img *models.Image) *int64 {
	if img == nil {
		return nil
	}
	id := img.StorageSourceID
	return &id
}

// handleImageBedUpload 网页端登录用户上传（Cookie + CSRF）。
func (s *Server) handleImageBedUpload(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	part, err := readMultipartFile(w, r, s.cfg.ImageBed.UserMaxFileSizeMB*1024*1024)
	if err != nil {
		WriteError(w, r, CodeValidationError, err.Error(), nil)
		return
	}

	sourceKey := r.URL.Query().Get("key") // 可临时切换目标（README §17.3）
	img, err := s.imagebed.UploadForUser(user, sourceKey, path.Base(part.FileName()), part)
	s.imageBedAudit(r, audit.EntryImageBed, "image_upload", &user.ID, imageStorageSourceID(img), sourceKey, err)
	if err != nil {
		writeImageBedError(w, r, err)
		return
	}
	WriteData(w, r, img)
}

func (s *Server) handleImageBedHistory(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	items, total, err := s.imagebed.ListForOwner(&user.ID, page, pageSize)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询图床历史失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: total})
}

func (s *Server) handleImageBedDelete(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	err := s.imagebed.DeleteByUser(user, r.PathValue("image_id"))
	s.imageBedAudit(r, audit.EntryImageBed, "image_delete", &user.ID, nil, "", err)
	if err != nil {
		writeImageBedError(w, r, err)
		return
	}
	WriteData(w, r, map[string]any{"ok": true})
}

// --- PicGo 兼容接口（README §17.14，Bearer Token，独立响应格式） ---

func writePicGo(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (s *Server) handlePicGoUpload(w http.ResponseWriter, r *http.Request) {
	// Bearer {image_bed_token}，只能用于图床上传（README §8.7）。
	authz := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(authz) <= len(prefix) || authz[:len(prefix)] != prefix {
		writePicGo(w, http.StatusUnauthorized, map[string]any{"success": false, "message": "缺少 Bearer Token"})
		return
	}
	// PicGo Token 不携带用户名，按哈希直查。
	user, err := s.tokens.VerifyByToken(auth.TokenTypeImageBed, authz[len(prefix):])
	if err != nil {
		writePicGo(w, http.StatusUnauthorized, map[string]any{"success": false, "message": "Token 无效"})
		return
	}

	part, err := readMultipartFile(w, r, s.cfg.ImageBed.UserMaxFileSizeMB*1024*1024)
	if err != nil {
		writePicGo(w, http.StatusBadRequest, map[string]any{"success": false, "message": err.Error()})
		return
	}

	// PicGo 上传使用默认图床目标，不允许指定存储源 key（README §17.3）。
	img, err := s.imagebed.UploadForUser(user, "", path.Base(part.FileName()), part)
	s.imageBedAudit(r, audit.EntryImageBed, "image_upload", &user.ID, imageStorageSourceID(img), "", err)
	if err != nil {
		msg := "上传失败"
		var maxBytesErr *http.MaxBytesError
		switch {
		case errors.Is(err, imagebed.ErrUnsupportedFormat),
			errors.Is(err, imagebed.ErrNoTarget),
			errors.Is(err, imagebed.ErrTargetInvalid):
			msg = err.Error()
		case errors.As(err, &maxBytesErr):
			msg = "图片超过大小限制"
		}
		writePicGo(w, http.StatusBadRequest, map[string]any{"success": false, "message": msg})
		return
	}
	writePicGo(w, http.StatusOK, map[string]any{"success": true, "data": map[string]any{"url": img.PublicURL}})
}

// --- 匿名公共图床（README §17.5/§17.6） ---

func (s *Server) handleAnonymousImageBedStatus(w http.ResponseWriter, r *http.Request) {
	settings, err := s.imagebed.GetAnonymousSettings()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询失败", nil)
		return
	}
	// 对外只暴露开关，不暴露目标 key。
	WriteData(w, r, map[string]any{
		"enabled":          settings.Enabled,
		"max_file_size_mb": s.cfg.ImageBed.AnonymousMaxFileSizeMB,
	})
}

func (s *Server) handleAnonymousImageBedUpload(w http.ResponseWriter, r *http.Request) {
	ip := s.proxy.ClientIP(r)
	if s.cfg.ImageBed.AnonymousRateLimit.Enabled && !s.anonLimiter.Allow(ip) {
		WriteError(w, r, CodeRateLimited, "上传过于频繁，请稍后再试", nil)
		return
	}

	part, err := readMultipartFile(w, r, s.cfg.ImageBed.AnonymousMaxFileSizeMB*1024*1024)
	if err != nil {
		WriteError(w, r, CodeValidationError, err.Error(), nil)
		return
	}

	img, err := s.imagebed.UploadAnonymous(path.Base(part.FileName()), part)
	s.imageBedAudit(r, audit.EntryAnonymousImageBed, "image_upload", nil, imageStorageSourceID(img), "", err)
	if err != nil {
		writeImageBedError(w, r, err)
		return
	}
	// 匿名用户只拿到公开 URL，不返回内部记录详情。
	WriteData(w, r, map[string]any{"url": img.PublicURL})
}

// --- 管理员：匿名图床配置与管理 ---

func (s *Server) handleAdminGetAnonymousSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.imagebed.GetAnonymousSettings()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询失败", nil)
		return
	}
	WriteData(w, r, settings)
}

func (s *Server) handleAdminSetAnonymousSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled bool   `json:"enabled"`
		Key     string `json:"key"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.imagebed.SetAnonymousSettings(req.Enabled, req.Key); err != nil {
		writeImageBedError(w, r, err)
		return
	}
	s.adminAudit(r, "update_anonymous_image_bed", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handleAdminListAnonymousImages(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	items, total, err := s.imagebed.ListForOwner(nil, page, pageSize)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: total})
}

func (s *Server) handleAdminDeleteAnonymousImage(w http.ResponseWriter, r *http.Request) {
	err := s.imagebed.DeleteByAdmin(r.PathValue("image_id"))
	if err != nil {
		writeImageBedError(w, r, err)
		return
	}
	s.adminAudit(r, "delete_anonymous_image", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"ok": true})
}
