// Package webdav 实现 WebDAV 基础方法（README §16）。
// 鉴权使用 username + WebDAV Token 的 Basic Auth，不使用网页登录密码。
// 支持 OPTIONS / PROPFIND(0,1) / GET / HEAD / PUT / MKCOL / DELETE / MOVE，
// 其余方法返回 501。
package webdav

import (
	"encoding/xml"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

// Handler 是 /dav 入口。
type Handler struct {
	tokens      *auth.Tokens
	sources     *sources.Service
	files       *files.Service
	audit       *audit.Logger
	proxy       *security.ProxyResolver
	logger      *slog.Logger
	maxFileSize int64 // 字节，PUT 受 upload.max_file_size_mb 限制（README §14.1）
}

// New 创建 WebDAV Handler。
func New(tokens *auth.Tokens, srcSvc *sources.Service, fileSvc *files.Service,
	auditLogger *audit.Logger, proxy *security.ProxyResolver, logger *slog.Logger, maxFileSizeMB int64) *Handler {
	return &Handler{
		tokens: tokens, sources: srcSvc, files: fileSvc,
		audit: auditLogger, proxy: proxy, logger: logger,
		maxFileSize: maxFileSizeMB * 1024 * 1024,
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Basic Auth：username + WebDAV Token（README §16.1）。
	username, token, ok := r.BasicAuth()
	if !ok {
		w.Header().Set("WWW-Authenticate", `Basic realm="OmniStore WebDAV"`)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.tokens.Verify(username, auth.TokenTypeWebDAV, token)
	if err != nil {
		w.Header().Set("WWW-Authenticate", `Basic realm="OmniStore WebDAV"`)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// 解析 /dav 之后的路径：/dav/{source_id}/inner...
	rest := strings.TrimPrefix(r.URL.Path, "/dav")
	rest = strings.Trim(rest, "/")

	switch r.Method {
	case "OPTIONS":
		h.handleOptions(w)
	case "PROPFIND":
		h.handlePropfind(w, r, user, rest)
	case http.MethodGet, http.MethodHead:
		h.handleGet(w, r, user, rest)
	case http.MethodPut:
		h.handlePut(w, r, user, rest)
	case "MKCOL":
		h.handleMkcol(w, r, user, rest)
	case http.MethodDelete:
		h.handleDelete(w, r, user, rest)
	case "MOVE":
		h.handleMove(w, r, user, rest)
	default:
		// COPY / LOCK / UNLOCK / PROPPATCH / REPORT / SEARCH / ACL 等（README §16.4）。
		http.Error(w, "not implemented", http.StatusNotImplemented)
	}
}

func (h *Handler) handleOptions(w http.ResponseWriter) {
	w.Header().Set("DAV", "1")
	w.Header().Set("Allow", "OPTIONS, PROPFIND, GET, HEAD, PUT, MKCOL, DELETE, MOVE")
	w.Header().Set("MS-Author-Via", "DAV")
	w.WriteHeader(http.StatusOK)
}

// splitPath 拆出 source_id 和源内相对路径。
func splitPath(rest string) (sourceID, inner string) {
	if rest == "" {
		return "", ""
	}
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], parts[1]
}

// resolveSource 执行 WebDAV 检查链路（README §16.6）：
// 存储源存在 -> 未禁用 -> webdav_enabled -> 用户权限。
func (h *Handler) resolveSource(user *models.User, sourceID string, needWrite bool) (*models.StorageSource, int) {
	src, err := h.sources.Get(sourceID)
	if err != nil {
		return nil, http.StatusNotFound
	}
	if src.IsDisabled || !src.WebdavEnabled {
		return nil, http.StatusNotFound
	}
	var allowed bool
	if needWrite {
		allowed, err = h.sources.CanWriteSource(user, sourceID)
	} else {
		allowed, err = h.sources.CanReadSource(user, sourceID)
	}
	if err != nil || !allowed {
		return nil, http.StatusForbidden
	}
	return src, 0
}

// davSources 返回用户在 /dav 虚拟根可见的存储源。
func (h *Handler) davSources(user *models.User) ([]*models.UserSourceView, error) {
	list, err := h.sources.ListForUser(user)
	if err != nil {
		return nil, err
	}
	out := make([]*models.UserSourceView, 0, len(list))
	for _, v := range list {
		if v.WebdavEnabled {
			out = append(out, v)
		}
	}
	return out, nil
}

// --- PROPFIND ---

type propfindResponse struct {
	XMLName   xml.Name       `xml:"D:response"`
	Href      string         `xml:"D:href"`
	Propstats []davPropstats `xml:"D:propstat"`
}

type davPropstats struct {
	Prop   davProp `xml:"D:prop"`
	Status string  `xml:"D:status"`
}

type davProp struct {
	DisplayName   string       `xml:"D:displayname,omitempty"`
	ResourceType  resourceType `xml:"D:resourcetype"`
	ContentLength *int64       `xml:"D:getcontentlength,omitempty"`
	LastModified  string       `xml:"D:getlastmodified,omitempty"`
}

type resourceType struct {
	Collection *struct{} `xml:"D:collection,omitempty"`
}

type multistatus struct {
	XMLName   xml.Name           `xml:"D:multistatus"`
	XmlnsD    string             `xml:"xmlns:D,attr"`
	Responses []propfindResponse `xml:"D:response"`
}

func davHref(segments ...string) string {
	out := "/dav"
	for _, s := range segments {
		for _, seg := range strings.Split(s, "/") {
			if seg == "" {
				continue
			}
			out += "/" + url.PathEscape(seg)
		}
	}
	return out
}

func dirResponse(href, name string) propfindResponse {
	return propfindResponse{
		Href: href + "/",
		Propstats: []davPropstats{{
			Prop: davProp{
				DisplayName:  name,
				ResourceType: resourceType{Collection: &struct{}{}},
			},
			Status: "HTTP/1.1 200 OK",
		}},
	}
}

func fileResponse(href, name string, size int64, mtime time.Time) propfindResponse {
	return propfindResponse{
		Href: href,
		Propstats: []davPropstats{{
			Prop: davProp{
				DisplayName:   name,
				ContentLength: &size,
				LastModified:  mtime.UTC().Format(http.TimeFormat),
			},
			Status: "HTTP/1.1 200 OK",
		}},
	}
}

func (h *Handler) handlePropfind(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	depth := r.Header.Get("Depth")
	if depth == "" {
		depth = "infinity"
	}
	// Depth: infinity 返回明确错误，避免大目录扫爆（README §16.3）。
	if depth != "0" && depth != "1" {
		http.Error(w, "PROPFIND with Depth: infinity is not supported", http.StatusForbidden)
		return
	}

	var responses []propfindResponse

	sourceID, inner := splitPath(rest)
	if sourceID == "" {
		// /dav 虚拟根目录：列出可访问且启用 WebDAV 的存储源（README §16.2）。
		responses = append(responses, dirResponse(davHref(), "dav"))
		if depth == "1" {
			list, err := h.davSources(user)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			for _, v := range list {
				responses = append(responses, dirResponse(davHref(v.SourceID), v.Name))
			}
		}
	} else {
		src, status := h.resolveSource(user, sourceID, false)
		if status != 0 {
			http.Error(w, http.StatusText(status), status)
			return
		}
		entry, err := h.files.Stat(src, inner)
		if err != nil {
			h.writeError(w, err)
			return
		}

		selfHref := davHref(sourceID, inner)
		switch entry.Type {
		case files.TypeDir:
			responses = append(responses, dirResponse(selfHref, entry.Name))
			if depth == "1" {
				// WebDAV 不分页，一次拉全（上限 500 * N 页在 MVP 简化为最大页）。
				result, err := h.files.List(src, inner, files.ListOptions{Page: 1, PageSize: 500}, false)
				if err != nil {
					h.writeError(w, err)
					return
				}
				for _, e := range result.Items {
					childHref := davHref(sourceID, strings.TrimPrefix(inner+"/"+e.Name, "/"))
					if e.Type == files.TypeDir {
						responses = append(responses, dirResponse(childHref, e.Name))
					} else if e.Type == files.TypeFile {
						responses = append(responses, fileResponse(childHref, e.Name, e.Size, e.MTime))
					}
					// symlink 直接跳过（README §10.7）。
				}
			}
		case files.TypeFile:
			responses = append(responses, fileResponse(selfHref, entry.Name, entry.Size, entry.MTime))
		default:
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
	}

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(http.StatusMultiStatus)
	w.Write([]byte(xml.Header))
	_ = xml.NewEncoder(w).Encode(multistatus{XmlnsD: "DAV:", Responses: responses})
}

// --- GET / HEAD ---

func (h *Handler) handleGet(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	sourceID, inner := splitPath(rest)
	if sourceID == "" {
		http.Error(w, "method not allowed on collection", http.StatusMethodNotAllowed)
		return
	}
	src, status := h.resolveSource(user, sourceID, false)
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}
	f, info, unlock, err := h.files.OpenForRead(src, inner)
	if err != nil {
		h.writeError(w, err)
		return
	}
	defer unlock()
	defer f.Close()

	w.Header().Set("Content-Disposition",
		mime.FormatMediaType("attachment", map[string]string{"filename": path.Base("/" + inner)}))
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

// --- PUT ---

func (h *Handler) handlePut(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	sourceID, inner := splitPath(rest)
	if sourceID == "" || inner == "" {
		// /dav 和 /dav/{source_id} 不能作为文件写入（README §16.2）。
		http.Error(w, "cannot PUT here", http.StatusForbidden)
		return
	}
	src, status := h.resolveSource(user, sourceID, true)
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.maxFileSize)

	dir := path.Dir("/" + inner)
	name := path.Base("/" + inner)
	// WebDAV PUT 按协议习惯覆盖文件（README §13.4）。
	relPath, _, err := h.files.Upload(src, dir, name, r.Body, true)

	h.logAudit(r, user, "upload", sourceID, strings.TrimPrefix(inner, "/"), "", err)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, "payload too large", http.StatusRequestEntityTooLarge)
			return
		}
		h.writeError(w, err)
		return
	}
	_ = relPath
	w.WriteHeader(http.StatusCreated)
}

// --- MKCOL ---

func (h *Handler) handleMkcol(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	sourceID, inner := splitPath(rest)
	if sourceID == "" || inner == "" {
		// 禁止在 /dav 下创建存储源（README §16.2）。
		http.Error(w, "cannot create collection here", http.StatusForbidden)
		return
	}
	src, status := h.resolveSource(user, sourceID, true)
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}

	dir := path.Dir("/" + inner)
	name := path.Base("/" + inner)
	_, err := h.files.Mkdir(src, dir, name)
	h.logAudit(r, user, "create_folder", sourceID, inner, "", err)
	if err != nil {
		if errors.Is(err, files.ErrAlreadyExists) {
			http.Error(w, "already exists", http.StatusMethodNotAllowed) // RFC 4918: 405
			return
		}
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// --- DELETE ---

func (h *Handler) handleDelete(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	sourceID, inner := splitPath(rest)
	if sourceID == "" || inner == "" {
		// 禁止 DELETE /dav/{source_id} 删除存储源（README §16.2）。
		http.Error(w, "cannot delete here", http.StatusForbidden)
		return
	}
	src, status := h.resolveSource(user, sourceID, true)
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}
	err := h.files.Delete(src, inner)
	h.logAudit(r, user, "delete", sourceID, inner, "", err)
	if err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- MOVE ---

func (h *Handler) handleMove(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	sourceID, inner := splitPath(rest)
	if sourceID == "" || inner == "" {
		http.Error(w, "cannot move here", http.StatusForbidden)
		return
	}

	dest := r.Header.Get("Destination")
	if dest == "" {
		http.Error(w, "missing Destination header", http.StatusBadRequest)
		return
	}
	destURL, err := url.Parse(dest)
	if err != nil {
		http.Error(w, "invalid Destination", http.StatusBadRequest)
		return
	}
	destPath := strings.Trim(strings.TrimPrefix(destURL.Path, "/dav"), "/")
	destSourceID, destInner := splitPath(destPath)
	if destSourceID == "" || destInner == "" {
		http.Error(w, "invalid Destination", http.StatusBadRequest)
		return
	}
	// MVP 不支持跨存储源移动（README §16.5）。
	if destSourceID != sourceID {
		http.Error(w, "cross-source MOVE is not supported", http.StatusBadGateway)
		return
	}

	src, status := h.resolveSource(user, sourceID, true)
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}

	newRel, err := h.files.Move(src, inner, destInner)
	h.logAudit(r, user, "move", sourceID, inner, newRel, err)
	if err != nil {
		if errors.Is(err, files.ErrAlreadyExists) {
			// 不覆盖（README §13.6），按 RFC 返回 412。
			http.Error(w, "destination exists", http.StatusPreconditionFailed)
			return
		}
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// --- 工具 ---

func (h *Handler) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, files.ErrNotFound):
		http.Error(w, "not found", http.StatusNotFound)
	case errors.Is(err, files.ErrAlreadyExists):
		http.Error(w, "already exists", http.StatusConflict)
	case errors.Is(err, files.ErrPathExcluded), errors.Is(err, files.ErrUnsupported):
		http.Error(w, "not found", http.StatusNotFound)
	case errors.Is(err, files.ErrInvalid):
		http.Error(w, "bad request", http.StatusBadRequest)
	default:
		h.logger.Error("webdav 内部错误", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

func (h *Handler) logAudit(r *http.Request, user *models.User, action, sourceID, relPath, targetRel string, opErr error) {
	e := audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID,
		EntryType: audit.EntryWebDAV, Action: action,
		SourceID: sourceID, RelativePath: relPath, TargetRelativePath: targetRel,
		IPAddress: h.proxy.ClientIP(r), UserAgent: r.UserAgent(),
		Status: audit.StatusSuccess,
	}
	if opErr != nil {
		e.Status = audit.StatusFailed
		e.ErrorCode = fmt.Sprintf("%v", opErr)
		if len(e.ErrorCode) > 64 {
			e.ErrorCode = e.ErrorCode[:64]
		}
	}
	h.audit.Log(e)
}
