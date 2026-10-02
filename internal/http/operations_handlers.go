package httpserver

import (
	"net/http"

	"github.com/omni-store/omnistore/internal/audit"
)

// --- 管理员：运维中心（2.0 Epic C） ---

func (s *Server) handleAdminOperationsStatus(w http.ResponseWriter, r *http.Request) {
	status, err := s.operations.GetStatus()
	if err != nil {
		WriteError(w, r, CodeInternalError, "聚合运维状态失败", nil)
		return
	}
	WriteData(w, r, status)
}

func (s *Server) handleAdminIntegrityCheck(w http.ResponseWriter, r *http.Request) {
	report, err := s.operations.RunIntegrityCheck()
	if err != nil {
		WriteError(w, r, CodeInternalError, "完整性检查失败", nil)
		return
	}
	s.adminAudit(r, "operations_integrity_check", audit.StatusSuccess, "")
	WriteData(w, r, report)
}

func (s *Server) handleAdminOperationsCleanup(w http.ResponseWriter, r *http.Request) {
	result, err := s.operations.RunCleanup(r.Context())
	if err != nil {
		// 部分失败也返回已完成部分，错误信息附在响应里。
		s.adminAudit(r, "operations_cleanup", audit.StatusFailed, err.Error())
		WriteError(w, r, CodeInternalError, "清理未完全成功: "+err.Error(), nil)
		return
	}
	s.adminAudit(r, "operations_cleanup", audit.StatusSuccess, "")
	WriteData(w, r, result)
}
