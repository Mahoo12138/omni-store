package httpserver

import (
	"errors"
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/sources"
)

func (s *Server) writePolicyError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, sources.ErrPolicyNotFound):
		WriteError(w, r, CodePolicyNotFound, err.Error(), nil)
	case errors.Is(err, sources.ErrNotFound):
		WriteError(w, r, CodeSourceNotFound, err.Error(), nil)
	default:
		WriteError(w, r, CodeValidationError, err.Error(), nil)
	}
}

func (s *Server) handleAdminListPolicies(w http.ResponseWriter, r *http.Request) {
	policies, err := s.sources.ListPolicies()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询访问策略失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: policies, Total: int64(len(policies))})
}

func (s *Server) handleAdminGetPolicy(w http.ResponseWriter, r *http.Request) {
	policy, err := s.sources.GetPolicy(r.PathValue("key"))
	if err != nil {
		s.writePolicyError(w, r, err)
		return
	}
	WriteData(w, r, policy)
}

func (s *Server) handleAdminCreatePolicy(w http.ResponseWriter, r *http.Request) {
	var input sources.PolicyInput
	if !decodeJSON(w, r, &input) {
		return
	}
	policy, err := s.sources.CreatePolicy(input)
	if err != nil {
		s.adminAudit(r, "create_access_policy", audit.StatusFailed, CodeValidationError)
		s.writePolicyError(w, r, err)
		return
	}
	s.adminAudit(r, "create_access_policy", audit.StatusSuccess, "")
	WriteData(w, r, policy)
}

func (s *Server) handleAdminUpdatePolicy(w http.ResponseWriter, r *http.Request) {
	var input sources.PolicyInput
	if !decodeJSON(w, r, &input) {
		return
	}
	policy, err := s.sources.UpdatePolicy(r.PathValue("key"), input)
	if err != nil {
		s.adminAudit(r, "update_access_policy", audit.StatusFailed, CodeValidationError)
		s.writePolicyError(w, r, err)
		return
	}
	s.adminAudit(r, "update_access_policy", audit.StatusSuccess, "")
	WriteData(w, r, policy)
}

func (s *Server) handleAdminDeletePolicy(w http.ResponseWriter, r *http.Request) {
	if err := s.sources.DeletePolicy(r.PathValue("key")); err != nil {
		s.writePolicyError(w, r, err)
		return
	}
	s.adminAudit(r, "delete_access_policy", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"ok": true})
}
