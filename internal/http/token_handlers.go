package httpserver

import (
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
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
