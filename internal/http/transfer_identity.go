package httpserver

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/transfers"
)

const transferGuestCookieName = "omnistore_transfer_guest"

type transferOwnerContextKey struct{}

type transferIdentityDTO struct {
	Kind           string                 `json:"kind"`
	OwnerKey       string                 `json:"owner_key"`
	CSRFToken      string                 `json:"csrf_token"`
	ExpiresAt      time.Time              `json:"expires_at"`
	MaxExpiryHours int64                  `json:"max_expiry_hours"`
	Limits         *transfers.GuestLimits `json:"limits"`
}

func currentTransferOwner(r *http.Request) transfers.Owner {
	if owner, ok := r.Context().Value(transferOwnerContextKey{}).(transfers.Owner); ok {
		return owner
	}
	if user := CurrentUser(r.Context()); user != nil {
		return transfers.Owner{UserID: user.ID}
	}
	return transfers.Owner{}
}

// requireTransferOwner 仅用于中转所有者接口；不会给 guest 注入普通 CurrentUser。
func (s *Server) requireTransferOwner(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, err := r.Cookie(SessionCookieName()); err == nil {
			s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
				owner := transfers.Owner{UserID: CurrentUser(r.Context()).ID}
				next(w, r.WithContext(context.WithValue(r.Context(), transferOwnerContextKey{}, owner)))
			})(w, r)
			return
		}
		cookie, err := r.Cookie(transferGuestCookieName)
		if err != nil {
			WriteError(w, r, CodeUnauthorized, "请先建立访客中转身份或登录", nil)
			return
		}
		guest, err := s.transfers.GetGuestIdentity(cookie.Value)
		if err != nil {
			s.clearTransferGuestCookie(w)
			WriteError(w, r, CodeUnauthorized, "访客中转身份已失效", nil)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			csrf := r.Header.Get("X-CSRF-Token")
			if csrf == "" || !auth.TokenEqual(s.transfers.GuestCSRFToken(cookie.Value), csrf) {
				WriteError(w, r, CodeForbidden, "CSRF 校验失败", nil)
				return
			}
		}
		owner := transfers.Owner{GuestID: guest.ID}
		next(w, r.WithContext(context.WithValue(r.Context(), transferOwnerContextKey{}, owner)))
	}
}

func (s *Server) clearTransferGuestCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: transferGuestCookieName, Path: "/api/v1", MaxAge: -1, HttpOnly: true,
		Secure: s.cfg.Security.CookieSecure, SameSite: http.SameSiteLaxMode})
}

func (s *Server) transferBootstrapSameOrigin(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	requestScheme := "http"
	if r.TLS != nil {
		requestScheme = "https"
	}
	if parsed.Scheme == requestScheme && strings.EqualFold(parsed.Host, r.Host) {
		return true
	}
	configured, err := url.Parse(s.cfg.Server.PublicURL)
	return err == nil && strings.EqualFold(parsed.Host, configured.Host) && parsed.Scheme == configured.Scheme
}

func (s *Server) handleTransferIdentity(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Add("Vary", "Cookie")
	if r.Method == http.MethodPost {
		if !s.transferBootstrapSameOrigin(r) {
			WriteError(w, r, CodeForbidden, "访客身份只能在本站建立", nil)
			return
		}
		var req struct{}
		if !decodeJSON(w, r, &req) {
			return
		}
	}
	if cookie, err := r.Cookie(SessionCookieName()); err == nil {
		if user, session, err := s.sessions.Validate(cookie.Value); err == nil {
			WriteData(w, r, transferIdentityDTO{
				Kind: "user", OwnerKey: (transfers.Owner{UserID: user.ID}).Key(),
				CSRFToken: s.sessions.CSRFToken(session.SessionID), ExpiresAt: session.ExpiresAt,
			})
			return
		}
		s.clearSessionCookie(w)
	}
	if cookie, err := r.Cookie(transferGuestCookieName); err == nil {
		if guest, err := s.transfers.GetGuestIdentity(cookie.Value); err == nil {
			s.writeTransferGuestIdentity(w, r, guest, cookie.Value)
			return
		}
		s.clearTransferGuestCookie(w)
	}
	if r.Method != http.MethodPost {
		WriteError(w, r, CodeUnauthorized, "尚未建立中转身份", nil)
		return
	}
	if !s.transferGuestLimiter.Allow("bootstrap|" + s.proxy.ClientIP(r)) {
		WriteError(w, r, CodeRateLimited, "建立访客身份过于频繁，请稍后再试", nil)
		return
	}
	ttl := time.Duration(s.cfg.Security.SessionTTLHours) * time.Hour
	if ttl <= 0 || ttl > transfers.GuestMaxTTL {
		ttl = transfers.GuestMaxTTL
	}
	guest, token, err := s.transfers.CreateGuestIdentity(ttl)
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: transferGuestCookieName, Value: token, Path: "/api/v1", Expires: guest.ExpiresAt,
		MaxAge: int(ttl.Seconds()), HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.cfg.Security.CookieSecure,
	})
	s.writeTransferGuestIdentity(w, r, guest, token)
}

func (s *Server) writeTransferGuestIdentity(w http.ResponseWriter, r *http.Request, guest *transfers.GuestIdentity, token string) {
	limits, err := s.transfers.GuestLimits()
	if err != nil {
		writeTransferError(w, r, err)
		return
	}
	maxHours := int64((time.Until(guest.ExpiresAt) + time.Hour - 1) / time.Hour)
	WriteData(w, r, transferIdentityDTO{
		Kind: "guest", OwnerKey: (transfers.Owner{GuestID: guest.ID}).Key(),
		CSRFToken: s.transfers.GuestCSRFToken(token), ExpiresAt: guest.ExpiresAt, MaxExpiryHours: maxHours, Limits: limits,
	})
}

func (s *Server) allowTransferOwnerCreate(w http.ResponseWriter, r *http.Request) bool {
	if currentTransferOwner(r).GuestID > 0 && !s.transferGuestLimiter.Allow("create|"+s.proxy.ClientIP(r)) {
		WriteError(w, r, CodeRateLimited, "创建任务过于频繁，请稍后再试", nil)
		return false
	}
	return true
}

func (s *Server) auditTransferOwner(r *http.Request, action, relativePath string) {
	owner := currentTransferOwner(r)
	entry := audit.Entry{ActorType: audit.ActorAnonymous, EntryType: audit.EntryTransfer,
		Action: action, RelativePath: relativePath, Status: audit.StatusSuccess, IPAddress: s.proxy.ClientIP(r)}
	if owner.UserID > 0 {
		entry.ActorType, entry.ActorUserID = audit.ActorUser, &owner.UserID
	}
	s.audit.Log(entry)
}
