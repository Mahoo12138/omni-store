package httpserver

import (
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/capabilities"
)

// --- 管理员：Site Capability 绑定（2.0 Epic A） ---

func (s *Server) handleAdminListCapabilities(w http.ResponseWriter, r *http.Request) {
	bindings, err := s.capabilities.ListBindings()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询 Site Capability 绑定失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: bindings, Total: int64(len(bindings))})
}

func (s *Server) handleAdminUpdateCapability(w http.ResponseWriter, r *http.Request) {
	capability := r.PathValue("capability")
	var req struct {
		Enabled          *bool   `json:"enabled"`
		StorageSourceKey *string `json:"storage_source_key"`
		ExpectedRevision *int64  `json:"expected_revision"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	binding, err := s.capabilities.UpdateBinding(capability, capabilities.UpdateInput{
		Enabled:          req.Enabled,
		StorageSourceKey: req.StorageSourceKey,
		ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		switch {
		case errors.Is(err, capabilities.ErrUnknownCapability):
			WriteError(w, r, CodeFileNotFound, err.Error(), nil)
		case errors.Is(err, capabilities.ErrRevisionConflict):
			WriteError(w, r, CodeConflict, err.Error(), nil)
		case errors.Is(err, capabilities.ErrSourceRequired):
			WriteError(w, r, CodeValidationError, err.Error(), nil)
		default:
			WriteError(w, r, CodeInternalError, "更新 Site Capability 绑定失败", nil)
		}
		return
	}
	s.adminAudit(r, "update_site_capability", audit.StatusSuccess, "")
	WriteData(w, r, binding)
}
