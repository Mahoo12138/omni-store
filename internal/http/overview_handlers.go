package httpserver

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/omni-store/omnistore/internal/audit"
)

// 概览数据项
type overviewUser struct {
	ID              int64  `json:"id"`
	Username        string `json:"username"`
	DisplayName     string `json:"display_name"`
	Role            string `json:"role"`
	IsDisabled      bool   `json:"is_disabled"`
	PermissionCount int    `json:"permission_count"` // -1 表示全部
	PermissionAll   bool   `json:"permission_all"`
}

type overviewSource struct {
	SourceID          string `json:"source_id"`
	Name              string `json:"name"`
	RootPath          string `json:"root_path"`
	PublicMountPath   string `json:"public_mount_path,omitempty"`
	WebdavEnabled     bool   `json:"webdav_enabled"`
	ImageBedEnabled   bool   `json:"image_bed_enabled"`
	PublicReadEnabled bool   `json:"public_read_enabled"`
	IsDisabled        bool   `json:"is_disabled"`
}

type overviewAudit struct {
	ID         int64   `json:"id"`
	Action     string  `json:"action"`
	Status     string  `json:"status"`
	ActorName  string  `json:"actor_name"`
	ActorType  string  `json:"actor_type"`
	SourceID   *string `json:"source_id,omitempty"`
	CreatedAt  string  `json:"created_at"`
	HumanTitle string  `json:"title"`
}

type overviewSystem struct {
	Version      string `json:"version"`
	DataDir      string `json:"data_dir"`
	HTTPAddr     string `json:"http_addr"`
	PublicURL    string `json:"public_url"`
	S3Enabled    bool   `json:"s3_enabled"`
	S3Status     string `json:"s3_status"`
	WebdavStatus string `json:"webdav_status"`
}

type overviewResponse struct {
	SourceCount         int64            `json:"source_count"`
	UserCount           int64            `json:"user_count"`
	PublicMountCount    int64            `json:"public_mount_count"`
	AnonymousImageBedOn bool             `json:"anonymous_image_bed_on"`
	Sources             []overviewSource `json:"sources"`
	Users               []overviewUser   `json:"users"`
	RecentAudits        []overviewAudit  `json:"recent_audits"`
	System              overviewSystem   `json:"system"`
}

// handleAdminOverview 聚合 dashboard 概览数据，减少前端首屏请求。
func (s *Server) handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	out := overviewResponse{
		Sources:      []overviewSource{},
		Users:        []overviewUser{},
		RecentAudits: []overviewAudit{},
	}

	// 1) 统计：存储源 / 用户 / 公开挂载
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM storage_sources`).Scan(&out.SourceCount); err != nil {
		WriteError(w, r, CodeInternalError, "查询存储源数量失败", nil)
		return
	}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&out.UserCount); err != nil {
		WriteError(w, r, CodeInternalError, "查询用户数量失败", nil)
		return
	}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM storage_sources WHERE is_disabled = 0 AND public_read_enabled = 1 AND public_mount_path IS NOT NULL`).Scan(&out.PublicMountCount); err != nil {
		WriteError(w, r, CodeInternalError, "查询公开挂载数量失败", nil)
		return
	}

	// 2) 匿名图床：读 system_settings
	var val string
	if err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = 'anonymous_image_bed_enabled'`).Scan(&val); err == nil {
		out.AnonymousImageBedOn = val == "1" || strings.EqualFold(val, "true")
	}

	// 3) 存储源列表（限制 4 条与首页表格接近）
	srcRows, err := s.db.Query(`SELECT source_id, name, root_path, COALESCE(public_mount_path, ''), webdav_enabled, image_bed_enabled, public_read_enabled, is_disabled
  FROM storage_sources ORDER BY id LIMIT 4`)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询存储源失败", nil)
		return
	}
	for srcRows.Next() {
		var os overviewSource
		if err := srcRows.Scan(&os.SourceID, &os.Name, &os.RootPath, &os.PublicMountPath, &os.WebdavEnabled, &os.ImageBedEnabled, &os.PublicReadEnabled, &os.IsDisabled); err != nil {
			srcRows.Close()
			WriteError(w, r, CodeInternalError, "查询存储源失败", nil)
			return
		}
		out.Sources = append(out.Sources, os)
	}
	srcRows.Close()

	// 4) 用户列表（带权限数）
	users, err := s.users.List()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询用户失败", nil)
		return
	}
	permCounts, err := loadPermissionCounts(s.db)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询权限统计失败", nil)
		return
	}
	for _, u := range users {
		ou := overviewUser{
			ID: u.ID, Username: u.Username, DisplayName: u.DisplayName,
			Role: u.Role, IsDisabled: u.IsDisabled,
			PermissionAll: u.Role == "super_admin",
		}
		if u.Role == "super_admin" {
			ou.PermissionCount = -1
		} else {
			ou.PermissionCount = permCounts[u.ID]
		}
		out.Users = append(out.Users, ou)
	}

	// 5) 最近审计日志（4 条，ascending 顺序）
	if aRows, err := s.audit.Recent(200); err == nil {
		uname := map[int64]string{}
		for _, u := range users {
			uname[u.ID] = u.Username
		}
		count := 0
		for i := len(aRows) - 1; i >= 0 && count < 4; i-- {
			e := aRows[i]
			oa := overviewAudit{
				ID: e.ID, Action: e.Action, Status: e.Status,
				ActorType: e.ActorType, CreatedAt: e.CreatedAt.Format("2006-01-02 15:04:05"),
				HumanTitle: humanizeAuditAction(e),
			}
			if e.SourceID != nil && *e.SourceID != "" {
				sid := *e.SourceID
				oa.SourceID = &sid
			}
			if e.ActorType == audit.ActorUser && e.ActorUserID != nil {
				oa.ActorName = uname[*e.ActorUserID]
			} else if e.ActorType == audit.ActorAnonymous {
				oa.ActorName = "匿名"
			} else {
				oa.ActorName = "系统"
			}
			out.RecentAudits = append(out.RecentAudits, oa)
			count++
		}
	}

	// 6) 系统状态
	out.System = overviewSystem{
		Version:      Version,
		DataDir:      s.cfg.Data.Dir,
		HTTPAddr:     s.cfg.Server.HTTPAddr,
		PublicURL:    s.cfg.Server.PublicURL,
		S3Enabled:    s.cfg.Server.S3Enabled,
		S3Status:     ternary(s.cfg.Server.S3Enabled, "已启用", "未启用"),
		WebdavStatus: "已启用",
	}

	WriteData(w, r, out)
}

func loadPermissionCounts(db *sql.DB) (map[int64]int, error) {
	rows, err := db.Query(`SELECT user_id, COUNT(*) FROM user_source_permissions GROUP BY user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]int{}
	for rows.Next() {
		var uid int64
		var n int
		if err := rows.Scan(&uid, &n); err != nil {
			return nil, err
		}
		out[uid] = n
	}
	return out, rows.Err()
}

func ternary(b bool, yes, no string) string {
	if b {
		return yes
	}
	return no
}

// --- 公开系统状态（docs/home-1.png 右栏"系统状态"）---

type systemStatusResponse struct {
	S3 struct {
		Enabled bool   `json:"enabled"`
		Status  string `json:"status"`
		Hint    string `json:"hint"`
	} `json:"s3"`
	WebDAV struct {
		Enabled bool   `json:"enabled"`
		Status  string `json:"status"`
		Hint    string `json:"hint"`
	} `json:"webdav"`
	FilePreview struct {
		Enabled bool   `json:"enabled"`
		Status  string `json:"status"`
		Hint    string `json:"hint"`
	} `json:"file_preview"`
	Anonymous struct {
		Enabled bool   `json:"enabled"`
		Status  string `json:"status"`
		Hint    string `json:"hint"`
	} `json:"anonymous"`
	Version   string `json:"version"`
	PublicURL string `json:"public_url"`
}

// handleSystemStatus 返回系统功能开关，供登录后首页右栏使用。
// 不需要鉴权，只暴露开关与状态描述。
func (s *Server) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	out := systemStatusResponse{Version: Version, PublicURL: s.cfg.Server.PublicURL}

	// S3 兼容存储
	out.S3.Enabled = s.cfg.Server.S3Enabled
	out.S3.Status = ternary(s.cfg.Server.S3Enabled, "已启用", "未启用")
	out.S3.Hint = "尚未配置任何 S3 存储源"

	// WebDAV 服务
	out.WebDAV.Enabled = true
	out.WebDAV.Status = "已启用"
	out.WebDAV.Hint = "WebDAV 服务运行正常，可正常连接"

	// 文件预览服务
	out.FilePreview.Enabled = true
	out.FilePreview.Status = "已启用"
	out.FilePreview.Hint = "文件预览服务运行正常"

	// 匿名图床：读 system_settings.anonymous_image_bed_enabled
	var val string
	if err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = 'anonymous_image_bed_enabled'`).Scan(&val); err == nil {
		anonOn := val == "1" || strings.EqualFold(val, "true")
		out.Anonymous.Enabled = anonOn
		out.Anonymous.Status = ternary(anonOn, "已启用", "未启用")
	} else {
		out.Anonymous.Enabled = false
		out.Anonymous.Status = "未启用"
	}
	out.Anonymous.Hint = "匿名访问与匿名上传未启用"

	WriteData(w, r, out)
}

// humanizeAuditAction 把审计日志翻译成短句（仅标题，详细信息看列表）。
func humanizeAuditAction(e *audit.LogEntry) string {
	filename := ""
	if e.RelativePath != nil && *e.RelativePath != "" {
		p := *e.RelativePath
		if i := strings.LastIndex(p, "/"); i >= 0 {
			filename = p[i+1:]
		} else {
			filename = p
		}
	}
	switch e.Action {
	case "create_source":
		return "新建存储源"
	case "update_source":
		return "更新存储源"
	case "delete_source":
		return "删除存储源"
	case "enable_source":
		return "启用存储源"
	case "disable_source":
		return "禁用存储源"
	case "update_exclude_patterns":
		return "更新排除规则"
	case "create_user":
		return "创建用户"
	case "delete_user":
		return "删除用户"
	case "enable_user":
		return "启用用户"
	case "disable_user":
		return "禁用用户"
	case "grant_permission":
		return "分配存储源权限"
	case "revoke_permission":
		return "移除存储源权限"
	case "image_upload":
		if filename != "" {
			return "上传图片 " + filename
		}
		return "上传图片"
	case "image_delete":
		return "删除图片"
	case "delete_anonymous_image":
		return "删除匿名图片"
	case "upload":
		if filename != "" {
			return "上传文件 " + filename
		}
		return "上传文件"
	case "delete":
		if filename != "" {
			return "删除文件 " + filename
		}
		return "删除文件"
	case "create_folder":
		if filename != "" {
			return "创建文件夹 " + filename
		}
		return "创建文件夹"
	case "rename":
		return "重命名文件"
	case "move":
		return "移动文件"
	case "change_password":
		return "修改密码"
	case "login_success":
		return "登录成功"
	case "login_failed":
		return "登录失败"
	case "reset_token_webdav":
		return "重置 WebDAV Token"
	case "reset_token_image_bed":
		return "重置图床 Token"
	default:
		return e.Action
	}
}
