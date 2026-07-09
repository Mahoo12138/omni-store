package httpserver

import "net/http"

// handleAdminAuditLogs 返回最近 200 条审计日志（README §20.3）。
func (s *Server) handleAdminAuditLogs(w http.ResponseWriter, r *http.Request) {
	entries, err := s.audit.Recent(200)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询审计日志失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: entries, Total: int64(len(entries))})
}
