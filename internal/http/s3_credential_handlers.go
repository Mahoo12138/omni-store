package httpserver

import (
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/s3api"
)

func (s *Server) handleListS3Credentials(w http.ResponseWriter, r *http.Request) {
	items, err := s.s3Keys.List(CurrentUser(r.Context()).ID)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询 S3 凭据失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: items, Total: int64(len(items))})
}

func (s *Server) handleCreateS3Credential(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user := CurrentUser(r.Context())
	item, secret, err := s.s3Keys.Create(user.ID, req.Name)
	if err != nil {
		switch {
		case errors.Is(err, s3api.ErrCredentialName):
			WriteError(w, r, CodeValidationError, err.Error(), nil)
		case errors.Is(err, s3api.ErrCredentialLimit):
			WriteError(w, r, CodeConflict, err.Error(), nil)
		default:
			s.logger.Error("创建 S3 凭据失败", "err", err)
			WriteError(w, r, CodeInternalError, "创建 S3 凭据失败", nil)
		}
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryWeb,
		Action: "create_s3_credential", IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(),
		Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{
		"item": item, "secret_access_key": secret,
		"notice": "Secret Access Key 只显示这一次，请立即保存",
	})
}

func (s *Server) handleSetS3CredentialDisabled(disabled bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := CurrentUser(r.Context())
		accessKeyID := r.PathValue("access_key_id")
		if err := s.s3Keys.SetDisabled(user.ID, accessKeyID, disabled); err != nil {
			if errors.Is(err, s3api.ErrCredentialNotFound) {
				WriteError(w, r, CodeTokenNotFound, err.Error(), nil)
				return
			}
			WriteError(w, r, CodeInternalError, "更新 S3 凭据失败", nil)
			return
		}
		action := "enable_s3_credential"
		if disabled {
			action = "disable_s3_credential"
		}
		s.audit.Log(audit.Entry{
			ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryWeb,
			Action: action, IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(), Status: audit.StatusSuccess,
		})
		WriteData(w, r, map[string]any{"ok": true})
	}
}

func (s *Server) handleDeleteS3Credential(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r.Context())
	if err := s.s3Keys.Delete(user.ID, r.PathValue("access_key_id")); err != nil {
		if errors.Is(err, s3api.ErrCredentialNotFound) {
			WriteError(w, r, CodeTokenNotFound, err.Error(), nil)
			return
		}
		WriteError(w, r, CodeInternalError, "删除 S3 凭据失败", nil)
		return
	}
	s.audit.Log(audit.Entry{
		ActorType: audit.ActorUser, ActorUserID: &user.ID, EntryType: audit.EntryWeb,
		Action: "delete_s3_credential", IPAddress: s.proxy.ClientIP(r), UserAgent: r.UserAgent(), Status: audit.StatusSuccess,
	})
	WriteData(w, r, map[string]any{"ok": true})
}
