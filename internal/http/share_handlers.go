package httpserver

import (
	"errors"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/shares"
)

func (s *Server) handleListShares(w http.ResponseWriter, r *http.Request) {
	items, err := s.shares.List(CurrentUser(r.Context()))
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询分享失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: int64(len(items))})
}

func (s *Server) handleCreateShare(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceKey    string     `json:"source_key"`
		Path         string     `json:"path"`
		Password     string     `json:"password"`
		ExpiresAt    *time.Time `json:"expires_at"`
		MaxDownloads int64      `json:"max_downloads"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	share, err := s.shares.Create(CurrentUser(r.Context()), shares.CreateInput{
		SourceKey: req.SourceKey, Path: req.Path, Password: req.Password,
		ExpiresAt: req.ExpiresAt, MaxDownloads: req.MaxDownloads,
	})
	if err != nil {
		s.writeShareError(w, r, err)
		return
	}
	if src, getErr := s.sources.Get(share.SourceKey); getErr == nil {
		s.fileAudit(r, "create_share", src, share.RelativePath, "", nil)
	}
	WriteData(w, r, share)
}

func (s *Server) handleDeleteShare(w http.ResponseWriter, r *http.Request) {
	share, err := s.shares.Delete(CurrentUser(r.Context()), r.PathValue("shareKey"))
	if err != nil {
		s.writeShareError(w, r, err)
		return
	}
	if src, getErr := s.sources.Get(share.SourceKey); getErr == nil {
		s.fileAudit(r, "revoke_share", src, share.RelativePath, "", nil)
	}
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handlePublicShareInfo(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("shareKey")
	info, err := s.shares.PublicInfo(key, shareSessionToken(r, key))
	if err != nil {
		s.writePublicShareError(w, r, err)
		return
	}
	WriteData(w, r, info)
}

func (s *Server) handlePublicShareUnlock(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	token, expires, err := s.shares.Unlock(r.PathValue("shareKey"), req.Password, s.proxy.ClientIP(r))
	if err != nil {
		if errors.Is(err, shares.ErrPassword) {
			WriteError(w, r, CodeUnauthorized, "访问密码错误或尝试次数过多", nil)
			return
		}
		s.writePublicShareError(w, r, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: shares.AccessCookieName(r.PathValue("shareKey")), Value: token, Path: "/", Expires: expires,
		MaxAge: int(time.Until(expires).Seconds()), HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: s.cfg.Security.CookieSecure,
	})
	WriteData(w, r, map[string]any{"ok": true})
}

func (s *Server) handlePublicShareBrowse(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	key := r.PathValue("shareKey")
	result, err := s.shares.Browse(key, shareSessionToken(r, key), r.URL.Query().Get("path"), files.ListOptions{
		Page: page, PageSize: pageSize, Sort: r.URL.Query().Get("sort"), Order: r.URL.Query().Get("order"),
	})
	if err != nil {
		s.writePublicShareError(w, r, err)
		return
	}
	WriteData(w, r, result)
}

func (s *Server) handlePublicShareRaw(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("shareKey")
	share, src, relPath, err := s.shares.Resolve(key, shareSessionToken(r, key), r.PathValue("childPath"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	f, info, unlock, err := s.shares.Files().OpenForRead(src, relPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer unlock()
	defer f.Close()
	if r.Method == http.MethodGet {
		if err := s.shares.ReserveDownload(share.ID); err != nil {
			http.NotFound(w, r)
			return
		}
	}
	filename := sanitizeFilename(path.Base("/" + relPath))
	if err := setUserContentHeaders(w, f, filename, r.URL.Query().Get("download") == "1"); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	s.audit.Log(audit.Entry{ActorType: audit.ActorAnonymous, EntryType: audit.EntryWeb, Action: "share_download",
		StorageSourceID: &src.ID, RelativePath: strings.TrimPrefix(relPath, "/"), IPAddress: s.proxy.ClientIP(r),
		UserAgent: r.UserAgent(), Status: audit.StatusSuccess})
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func shareSessionToken(r *http.Request, shareKey string) string {
	cookie, err := r.Cookie(shares.AccessCookieName(shareKey))
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (s *Server) writeShareError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, shares.ErrNotFound), errors.Is(err, files.ErrNotFound):
		WriteError(w, r, CodeFileNotFound, "分享目标不存在", nil)
	case errors.Is(err, shares.ErrForbidden):
		WriteError(w, r, CodeForbidden, err.Error(), nil)
	case errors.Is(err, shares.ErrPasswordLength), errors.Is(err, shares.ErrExpiry), errors.Is(err, shares.ErrDownloadLimit), errors.Is(err, files.ErrInvalid):
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	default:
		WriteError(w, r, CodeInternalError, "分享操作失败", nil)
	}
}

func (s *Server) writePublicShareError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, shares.ErrLocked) {
		WriteError(w, r, CodeUnauthorized, "请先输入访问密码", nil)
		return
	}
	// 公开侧统一 404，避免区分失效、次数耗尽、禁用来源或真实文件缺失。
	WriteError(w, r, CodeFileNotFound, "分享不存在或已失效", nil)
}
