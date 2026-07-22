package httpserver

import (
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
)

// --- 用户 Token 自助管理（README §8.6/§8.7） ---

func (s *Server) handleTokenStatus(w http.ResponseWriter, r *http.Request) {
	status, err := s.tokens.Status(CurrentUser(r.Context()).ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询 token 状态失败", nil)
		return
	}
	WriteData(w, r, status)
}

// handleResetToken 生成或重置 Token。明文只在响应中出现一次。
func (s *Server) handleResetToken(tokenType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := CurrentUser(r.Context())
		plaintext, err := s.tokens.Reset(u.ID, tokenType)
		if err != nil {
			WriteError(w, r, CodeInternalError, "重置 token 失败", nil)
			return
		}
		s.audit.Log(audit.Entry{
			ActorType: audit.ActorUser, ActorUserID: &u.ID,
			EntryType: audit.EntryWeb, Action: "reset_token_" + tokenType,
			IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(),
			Status: audit.StatusSuccess,
		})
		WriteData(w, r, map[string]any{
			"token_type": tokenType,
			"token":      plaintext,
			"notice":     "Token 只显示这一次，请立即保存",
		})
	}
}

func (s *Server) handleListImageBedTokens(w http.ResponseWriter, r *http.Request) {
	items, err := s.tokens.ListImageBedTokens(CurrentUser(r.Context()).ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询图床 Token 失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: int64(len(items))})
}

func (s *Server) handleCreateImageBedToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Label string `json:"label"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	u := CurrentUser(r.Context())
	item, plaintext, err := s.tokens.CreateImageBedToken(u.ID, req.Label)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrImageBedTokenLabel):
			WriteError(w, r, CodeValidationError, err.Error(), nil)
		case errors.Is(err, auth.ErrImageBedTokenLimit):
			WriteError(w, r, CodeConflict, err.Error(), nil)
		default:
			WriteError(w, r, CodeInternalError, "创建图床 Token 失败", nil)
		}
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryWeb, Action: "create_image_bed_token",
		IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(), Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{
		"item": item, "token": plaintext,
		"notice": "Token 只显示这一次，请立即保存",
	})
}

func (s *Server) handleDeleteImageBedToken(w http.ResponseWriter, r *http.Request) {
	u := CurrentUser(r.Context())
	err := s.tokens.DeleteImageBedToken(u.ID, r.PathValue("token_id"))
	if errors.Is(err, auth.ErrImageBedTokenNotFound) {
		WriteError(w, r, CodeTokenNotFound, err.Error(), nil)
		return
	}
	if err != nil {
		WriteError(w, r, CodeInternalError, "撤销图床 Token 失败", nil)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &u.ID,
		EntryType: audit.EntryWeb, Action: "delete_image_bed_token",
		IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(), Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"ok": true})
}
