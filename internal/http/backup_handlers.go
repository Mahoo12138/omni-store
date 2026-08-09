package httpserver

import (
	"mime"
	"net/http"
	"os"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/backup"
	"github.com/omni-store/omnistore/internal/buildinfo"
)

// handleAdminExportSystemConfig creates a point-in-time system configuration package.
func (s *Server) handleAdminExportSystemConfig(w http.ResponseWriter, r *http.Request) {
	pkg, err := backup.CreatePackage(r.Context(), s.cfg, s.db, buildinfo.Version, time.Now())
	if err != nil {
		s.adminAudit(r, "export_system_config", audit.StatusFailed, CodeInternalError)
		WriteError(w, r, CodeInternalError, "导出系统配置包失败", nil)
		return
	}
	defer pkg.Cleanup()

	file, err := os.Open(pkg.Path)
	if err != nil {
		s.adminAudit(r, "export_system_config", audit.StatusFailed, CodeInternalError)
		WriteError(w, r, CodeInternalError, "读取系统配置包失败", nil)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		s.adminAudit(r, "export_system_config", audit.StatusFailed, CodeInternalError)
		WriteError(w, r, CodeInternalError, "读取系统配置包失败", nil)
		return
	}

	s.adminAudit(r, "export_system_config", audit.StatusSuccess, "")
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": pkg.Filename}))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, pkg.Filename, info.ModTime(), file)
}
