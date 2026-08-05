package webdav

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

const (
	defaultLockTimeout = time.Hour
	maxLockTimeout     = 7 * 24 * time.Hour
	maxLockBodyBytes   = 64 * 1024
)

type lockInfoRequest struct {
	XMLName xml.Name `xml:"lockinfo"`
	Scope   struct {
		Exclusive *struct{} `xml:"exclusive"`
		Shared    *struct{} `xml:"shared"`
	} `xml:"lockscope"`
	Type struct {
		Write *struct{} `xml:"write"`
	} `xml:"locktype"`
	Owner *davOwner `xml:"owner"`
}

type davOwner struct {
	InnerXML string `xml:",innerxml"`
}

type davLockType struct {
	Write *struct{} `xml:"D:write"`
}

type davLockScope struct {
	Exclusive *struct{} `xml:"D:exclusive"`
}

type davHrefValue struct {
	Href string `xml:"D:href"`
}

type davActiveLock struct {
	LockType  davLockType  `xml:"D:locktype"`
	LockScope davLockScope `xml:"D:lockscope"`
	Depth     string       `xml:"D:depth"`
	Owner     *davOwner    `xml:"D:owner,omitempty"`
	Timeout   string       `xml:"D:timeout"`
	LockToken davHrefValue `xml:"D:locktoken"`
	LockRoot  davHrefValue `xml:"D:lockroot"`
}

type davLockDiscovery struct {
	ActiveLocks []davActiveLock `xml:"D:activelock"`
}

type davLockEntry struct {
	LockScope davLockScope `xml:"D:lockscope"`
	LockType  davLockType  `xml:"D:locktype"`
}

type davSupportedLock struct {
	Entries []davLockEntry `xml:"D:lockentry"`
}

type davLockProp struct {
	XMLName       xml.Name         `xml:"D:prop"`
	XmlnsD        string           `xml:"xmlns:D,attr"`
	LockDiscovery davLockDiscovery `xml:"D:lockdiscovery"`
}

func (h *Handler) handleLock(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	sourceKey, inner := splitPath(rest)
	if sourceKey == "" {
		http.Error(w, "cannot lock virtual root", http.StatusForbidden)
		return
	}
	src, status := h.resolveSource(user, sourceKey, inner, true, false)
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}
	relPath, err := security.NormalizeRelPath(inner)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxLockBodyBytes+1))
	if err != nil || len(body) > maxLockBodyBytes {
		http.Error(w, "invalid LOCK body", http.StatusBadRequest)
		return
	}
	timeout := parseLockTimeout(r.Header.Get("Timeout"))
	if len(bytes.TrimSpace(body)) == 0 {
		h.handleLockRefresh(w, r, user, src, relPath, timeout)
		return
	}

	depth := strings.ToLower(strings.TrimSpace(r.Header.Get("Depth")))
	if depth == "" {
		depth = locks.DepthInfinity
	}
	if depth != locks.DepthZero && depth != locks.DepthInfinity {
		http.Error(w, "Depth must be 0 or infinity", http.StatusBadRequest)
		return
	}
	var request lockInfoRequest
	if err := xml.Unmarshal(body, &request); err != nil || request.Scope.Exclusive == nil || request.Scope.Shared != nil || request.Type.Write == nil {
		http.Error(w, "only exclusive write locks are supported", http.StatusBadRequest)
		return
	}

	// 先执行统一路径与 symlink 校验；资源是否存在会在持久锁创建后再次确认，
	// 以覆盖“首次 Stat 后资源恰好被删除或创建”的竞态。
	if _, err := h.files.Stat(src, relPath); err != nil {
		if !errors.Is(err, files.ErrNotFound) {
			h.writeError(w, err)
			return
		}
		if relPath == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
	}
	ownerXML := ""
	if request.Owner != nil {
		ownerXML = request.Owner.InnerXML
	}
	lock, err := h.persistent.Create(r.Context(), src.ID, relPath, depth, ownerXML, user.ID, timeout)
	if err != nil {
		h.logAudit(r, user, "lock", sourceKey, relPath, "", err)
		if errors.Is(err, locks.ErrPersistentLocked) {
			http.Error(w, "locked", http.StatusLocked)
			return
		}
		h.writeError(w, err)
		return
	}
	exists := true
	if _, err := h.files.Stat(src, relPath); err != nil {
		if !errors.Is(err, files.ErrNotFound) {
			_ = h.persistent.Delete(context.Background(), lock.Token)
			h.logAudit(r, user, "lock", sourceKey, relPath, "", err)
			h.writeError(w, err)
			return
		}
		exists = false
	}
	created := false
	if !exists {
		dir := path.Dir("/" + relPath)
		name := path.Base("/" + relPath)
		if _, _, err := h.files.UploadWithLockTokens(src, dir, name, bytes.NewReader(nil), false, []string{lock.Token}, &user.ID); err != nil {
			_ = h.persistent.Delete(context.Background(), lock.Token)
			h.logAudit(r, user, "lock", sourceKey, relPath, "", err)
			h.writeError(w, err)
			return
		}
		created = true
	}
	h.logAudit(r, user, "lock", sourceKey, relPath, "", nil)
	w.Header().Set("Lock-Token", "<"+lock.Token+">")
	h.writeLockResponse(w, lock, src.Key, map[bool]int{true: http.StatusCreated, false: http.StatusOK}[created])
}

func (h *Handler) handleLockRefresh(w http.ResponseWriter, r *http.Request, user *models.User, src *models.StorageSource, relPath string, timeout time.Duration) {
	tokens := extractLockTokens(r.Header.Get("If"))
	if len(tokens) != 1 {
		http.Error(w, "LOCK refresh requires exactly one lock token", http.StatusBadRequest)
		return
	}
	lock, err := h.persistent.Refresh(r.Context(), tokens[0], user.ID, src.ID, relPath, timeout)
	h.logAudit(r, user, "refresh_lock", src.Key, relPath, "", err)
	if err != nil {
		switch {
		case errors.Is(err, locks.ErrLockForbidden):
			http.Error(w, "forbidden", http.StatusForbidden)
		case errors.Is(err, locks.ErrLockNotFound):
			http.Error(w, "precondition failed", http.StatusPreconditionFailed)
		default:
			h.writeError(w, err)
		}
		return
	}
	h.writeLockResponse(w, lock, src.Key, http.StatusOK)
}

func (h *Handler) handleUnlock(w http.ResponseWriter, r *http.Request, user *models.User, rest string) {
	sourceKey, inner := splitPath(rest)
	if sourceKey == "" {
		http.Error(w, "cannot unlock virtual root", http.StatusForbidden)
		return
	}
	src, status := h.resolveSource(user, sourceKey, inner, true, false)
	if status != 0 {
		http.Error(w, http.StatusText(status), status)
		return
	}
	relPath, err := security.NormalizeRelPath(inner)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tokens := extractLockTokens(r.Header.Get("Lock-Token"))
	if len(tokens) != 1 {
		http.Error(w, "missing Lock-Token header", http.StatusBadRequest)
		return
	}
	err = h.persistent.Unlock(r.Context(), tokens[0], user.ID, src.ID, relPath)
	h.logAudit(r, user, "unlock", sourceKey, relPath, "", err)
	if err != nil {
		switch {
		case errors.Is(err, locks.ErrLockForbidden):
			http.Error(w, "forbidden", http.StatusForbidden)
		case errors.Is(err, locks.ErrLockNotFound):
			http.Error(w, "lock token does not match request URI", http.StatusConflict)
		default:
			h.writeError(w, err)
		}
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) writeLockResponse(w http.ResponseWriter, lock *locks.PersistentLock, sourceKey string, status int) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(xml.Header))
	_ = xml.NewEncoder(w).Encode(davLockProp{XmlnsD: "DAV:", LockDiscovery: davLockDiscovery{
		ActiveLocks: []davActiveLock{activeLockXML(*lock, sourceKey)},
	}})
}

func activeLockXML(lock locks.PersistentLock, sourceKey string) davActiveLock {
	remaining := int64(time.Until(lock.ExpiresAt).Seconds())
	if remaining < 0 {
		remaining = 0
	}
	var owner *davOwner
	if lock.OwnerXML != "" {
		owner = &davOwner{InnerXML: lock.OwnerXML}
	}
	return davActiveLock{
		LockType:  davLockType{Write: &struct{}{}},
		LockScope: davLockScope{Exclusive: &struct{}{}},
		Depth:     lock.Depth,
		Owner:     owner,
		Timeout:   fmt.Sprintf("Second-%d", remaining),
		LockToken: davHrefValue{Href: lock.Token},
		LockRoot:  davHrefValue{Href: davHref(sourceKey, lock.RelativePath)},
	}
}

func (h *Handler) addLockProperties(r *http.Request, response *propfindResponse, sourceKey, relPath string) error {
	src, err := h.sources.Get(sourceKey)
	if err != nil {
		return err
	}
	active, err := h.persistent.Discover(r.Context(), src.ID, relPath)
	if err != nil {
		return err
	}
	discovery := &davLockDiscovery{ActiveLocks: make([]davActiveLock, 0, len(active))}
	for _, lock := range active {
		discovery.ActiveLocks = append(discovery.ActiveLocks, activeLockXML(lock, sourceKey))
	}
	for i := range response.Propstats {
		response.Propstats[i].Prop.SupportedLock = &davSupportedLock{Entries: []davLockEntry{{
			LockScope: davLockScope{Exclusive: &struct{}{}},
			LockType:  davLockType{Write: &struct{}{}},
		}}}
		response.Propstats[i].Prop.LockDiscovery = discovery
	}
	return nil
}

func parseLockTimeout(header string) time.Duration {
	for _, value := range strings.Split(header, ",") {
		value = strings.TrimSpace(value)
		if strings.EqualFold(value, "Infinite") {
			return maxLockTimeout
		}
		if len(value) > 7 && strings.EqualFold(value[:7], "Second-") {
			seconds, err := strconv.ParseInt(value[7:], 10, 64)
			if err == nil && seconds > 0 {
				if seconds > int64(maxLockTimeout/time.Second) {
					return maxLockTimeout
				}
				return time.Duration(seconds) * time.Second
			}
		}
	}
	return defaultLockTimeout
}

// extractLockTokens extracts submitted state tokens while ignoring tagged resource URIs.
func extractLockTokens(header string) []string {
	seen := map[string]struct{}{}
	var out []string
	for {
		start := strings.IndexByte(header, '<')
		if start < 0 {
			break
		}
		prefix := strings.TrimSpace(header[:start])
		negated := strings.HasSuffix(strings.ToLower(prefix), "not") &&
			(len(prefix) == 3 || prefix[len(prefix)-4] == '(' || unicode.IsSpace(rune(prefix[len(prefix)-4])))
		header = header[start+1:]
		end := strings.IndexByte(header, '>')
		if end < 0 {
			break
		}
		value := strings.TrimSpace(header[:end])
		header = header[end+1:]
		if negated {
			continue
		}
		if !strings.HasPrefix(strings.ToLower(value), "urn:uuid:") && !strings.HasPrefix(strings.ToLower(value), "opaquelocktoken:") {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
