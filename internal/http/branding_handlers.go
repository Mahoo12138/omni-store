package httpserver

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/omni-store/omnistore/internal/audit"
)

// 实例名称品牌信息（1.2.0）：存 system_settings，公开侧经 system/status 暴露。
const (
	settingKeyInstanceName = "instance_name"
	defaultInstanceName    = "OmniStore"
	maxInstanceNameRunes   = 64
)

// instanceName 返回当前实例显示名称，未配置时回退默认值。
func (s *Server) instanceName() string {
	var val string
	if err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = ?`,
		settingKeyInstanceName).Scan(&val); err != nil {
		return defaultInstanceName
	}
	if name := strings.TrimSpace(val); name != "" {
		return name
	}
	return defaultInstanceName
}

func (s *Server) handleAdminGetBranding(w http.ResponseWriter, r *http.Request) {
	WriteData(w, r, map[string]any{"instance_name": s.instanceName()})
}

func (s *Server) handleAdminSetBranding(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InstanceName string `json:"instance_name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	name := strings.TrimSpace(req.InstanceName)
	if utf8.RuneCountInString(name) > maxInstanceNameRunes {
		WriteError(w, r, CodeValidationError, "实例名称不能超过 64 个字符", nil)
		return
	}
	now := time.Now().UTC()
	var err error
	if name == "" {
		// 空值表示恢复默认名称。
		_, err = s.db.Exec(`DELETE FROM system_settings WHERE key = ?`, settingKeyInstanceName)
	} else {
		_, err = s.db.Exec(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			settingKeyInstanceName, name, now)
	}
	if err != nil {
		WriteError(w, r, CodeInternalError, "保存实例名称失败", nil)
		return
	}
	s.adminAudit(r, "update_branding", audit.StatusSuccess, "")
	WriteData(w, r, map[string]any{"instance_name": s.instanceName()})
}
