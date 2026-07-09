package httpserver

import (
	"database/sql"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/imagebed"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/publicdisk"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
	"github.com/omni-store/omnistore/internal/webdav"
	"github.com/omni-store/omnistore/web"
)

// Version 由构建时注入，MVP 先用固定值。
var Version = "0.1.0-dev"

// Server 聚合 HTTP 层依赖。
type Server struct {
	cfg      *config.Config
	db       *sql.DB
	logger   *slog.Logger
	users    *users.Service
	sources  *sources.Service
	files    *files.Service
	public   *publicdisk.Service
	sessions *auth.Sessions
	tokens   *auth.Tokens
	imagebed    *imagebed.Service
	anonLimiter *imagebed.RateLimiter
	audit    *audit.Logger
	proxy    *security.ProxyResolver
}

// New 创建 HTTP Server，同时返回内部 Server 以便 main 启动后台任务。
func New(cfg *config.Config, dbConn *sql.DB, logger *slog.Logger) (*http.Server, *Server) {
	s := &Server{
		cfg:      cfg,
		db:       dbConn,
		logger:   logger,
		users:    users.NewService(dbConn),
		sessions: auth.NewSessions(dbConn, time.Duration(cfg.Security.SessionTTLHours)*time.Hour),
		audit:    audit.New(dbConn, cfg.Audit.Enabled, cfg.Audit.MaxEntries, logger),
		proxy:    security.NewProxyResolver(cfg.Server.TrustedProxies),
	}
	s.sources = sources.NewService(dbConn, cfg.Data.Dir)
	s.files = files.NewService(dbConn, s.sources, locks.NewManager())
	s.public = publicdisk.NewService(dbConn, s.sources, s.files)
	s.tokens = auth.NewTokens(dbConn)
	ib, err := imagebed.NewService(dbConn, cfg.ImageBed.RootPath, cfg.Server.PublicURL, s.sources, s.files)
	if err != nil {
		// 配置错误应在启动时直接失败。
		panic(err)
	}
	s.imagebed = ib
	s.anonLimiter = imagebed.NewRateLimiter(cfg.ImageBed.AnonymousRateLimit.PerIPPerHour)

	mux := http.NewServeMux()

	// 系统
	mux.HandleFunc("GET /api/v1/health", s.handleHealth)

	// 初始化超级管理员
	mux.HandleFunc("GET /api/v1/setup/status", s.handleSetupStatus)
	mux.HandleFunc("POST /api/v1/setup/admin", s.handleSetupAdmin)

	// 认证
	mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/v1/auth/me", s.requireAuth(s.handleMe))

	// 用户自助
	mux.HandleFunc("PATCH /api/v1/me/profile", s.requireAuth(s.handleUpdateProfile))
	mux.HandleFunc("POST /api/v1/me/password", s.requireAuth(s.handleChangePassword))
	mux.HandleFunc("GET /api/v1/me/tokens", s.requireAuth(s.handleTokenStatus))
	mux.HandleFunc("POST /api/v1/me/tokens/webdav/reset", s.requireAuth(s.handleResetToken(auth.TokenTypeWebDAV)))
	mux.HandleFunc("POST /api/v1/me/tokens/image-bed/reset", s.requireAuth(s.handleResetToken(auth.TokenTypeImageBed)))

	// 管理员：用户管理
	mux.HandleFunc("GET /api/v1/admin/users", s.requireAdmin(s.handleAdminListUsers))
	mux.HandleFunc("POST /api/v1/admin/users", s.requireAdmin(s.handleAdminCreateUser))
	mux.HandleFunc("POST /api/v1/admin/users/{id}/disable", s.requireAdmin(s.handleAdminSetUserDisabled(true)))
	mux.HandleFunc("POST /api/v1/admin/users/{id}/enable", s.requireAdmin(s.handleAdminSetUserDisabled(false)))
	mux.HandleFunc("DELETE /api/v1/admin/users/{id}", s.requireAdmin(s.handleAdminDeleteUser))

	// 登录用户：可访问存储源
	mux.HandleFunc("GET /api/v1/sources", s.requireAuth(s.handleListMySources))

	// 私有网盘文件操作（README §13.2）
	mux.HandleFunc("GET /api/v1/sources/{source_id}/files", s.requireAuth(s.handleListFiles))
	mux.HandleFunc("GET /api/v1/sources/{source_id}/files/stat", s.requireAuth(s.handleStatFile))
	mux.HandleFunc("GET /api/v1/sources/{source_id}/download", s.requireAuth(s.handleDownloadFile))
	mux.HandleFunc("POST /api/v1/sources/{source_id}/folders", s.requireAuth(s.handleCreateFolder))
	mux.HandleFunc("POST /api/v1/sources/{source_id}/upload", s.requireAuth(s.handleUploadFile))
	mux.HandleFunc("DELETE /api/v1/sources/{source_id}/files", s.requireAuth(s.handleDeleteFile))
	mux.HandleFunc("POST /api/v1/sources/{source_id}/files/rename", s.requireAuth(s.handleRenameFile))
	mux.HandleFunc("POST /api/v1/sources/{source_id}/files/move", s.requireAuth(s.handleMoveFile))

	// 管理员：存储源管理
	mux.HandleFunc("GET /api/v1/admin/sources", s.requireAdmin(s.handleAdminListSources))
	mux.HandleFunc("POST /api/v1/admin/sources", s.requireAdmin(s.handleAdminCreateSource))
	mux.HandleFunc("GET /api/v1/admin/sources/{source_id}", s.requireAdmin(s.handleAdminGetSource))
	mux.HandleFunc("PATCH /api/v1/admin/sources/{source_id}", s.requireAdmin(s.handleAdminUpdateSource))
	mux.HandleFunc("POST /api/v1/admin/sources/{source_id}/disable", s.requireAdmin(s.handleAdminSetSourceDisabled(true)))
	mux.HandleFunc("POST /api/v1/admin/sources/{source_id}/enable", s.requireAdmin(s.handleAdminSetSourceDisabled(false)))
	mux.HandleFunc("DELETE /api/v1/admin/sources/{source_id}", s.requireAdmin(s.handleAdminDeleteSource))
	mux.HandleFunc("PUT /api/v1/admin/sources/{source_id}/exclude-patterns", s.requireAdmin(s.handleAdminSetExcludePatterns))

	// 管理员：权限分配
	mux.HandleFunc("GET /api/v1/admin/sources/{source_id}/permissions", s.requireAdmin(s.handleAdminListPermissions))
	mux.HandleFunc("PUT /api/v1/admin/sources/{source_id}/permissions/{id}", s.requireAdmin(s.handleAdminSetPermission))
	mux.HandleFunc("DELETE /api/v1/admin/sources/{source_id}/permissions/{id}", s.requireAdmin(s.handleAdminRemovePermission))

	// 公开网盘（匿名可访问，README §12.5）
	mux.HandleFunc("GET /api/v1/public/mounts", s.handlePublicMounts)
	mux.HandleFunc("GET /api/v1/public/browse", s.handlePublicBrowse)
	mux.HandleFunc("GET /raw/{virtual_path...}", s.handlePublicRaw)

	// WebDAV（README §16）
	davHandler := webdav.New(s.tokens, s.sources, s.files, s.audit, s.proxy, logger, cfg.Upload.MaxFileSizeMB)
	mux.Handle("/dav", davHandler)
	mux.Handle("/dav/", davHandler)

	// 图床：公开图片访问（README §17.8）
	mux.HandleFunc("GET /i/{image_file}", s.handleServeImage)

	// 图床：登录用户（README §17.3/§17.11/§17.12）
	mux.HandleFunc("GET /api/v1/image-bed/targets", s.requireAuth(s.handleImageBedTargets))
	mux.HandleFunc("PUT /api/v1/image-bed/default-target", s.requireAuth(s.handleSetImageBedDefaultTarget))
	mux.HandleFunc("POST /api/v1/image-bed/uploads", s.requireAuth(s.handleImageBedUpload))
	mux.HandleFunc("GET /api/v1/image-bed/images", s.requireAuth(s.handleImageBedHistory))
	mux.HandleFunc("DELETE /api/v1/image-bed/images/{image_id}", s.requireAuth(s.handleImageBedDelete))

	// 图床：PicGo 兼容接口（Bearer Token，README §17.14）
	mux.HandleFunc("POST /api/v1/image-bed/upload", s.handlePicGoUpload)

	// 图床：匿名公共图床（README §17.5）
	mux.HandleFunc("GET /api/v1/image-bed/anonymous-status", s.handleAnonymousImageBedStatus)
	mux.HandleFunc("POST /api/v1/image-bed/anonymous-upload", s.handleAnonymousImageBedUpload)

	// 管理员：匿名图床配置与匿名图片管理
	mux.HandleFunc("GET /api/v1/admin/image-bed/anonymous-settings", s.requireAdmin(s.handleAdminGetAnonymousSettings))
	mux.HandleFunc("PUT /api/v1/admin/image-bed/anonymous-settings", s.requireAdmin(s.handleAdminSetAnonymousSettings))
	mux.HandleFunc("GET /api/v1/admin/image-bed/anonymous-images", s.requireAdmin(s.handleAdminListAnonymousImages))
	mux.HandleFunc("DELETE /api/v1/admin/image-bed/anonymous-images/{image_id}", s.requireAdmin(s.handleAdminDeleteAnonymousImage))

	// 管理员：审计日志（最近 200 条，README §20.3）
	mux.HandleFunc("GET /api/v1/admin/audit-logs", s.requireAdmin(s.handleAdminAuditLogs))

	// API 未匹配路由统一返回 JSON 404，避免落入 SPA fallback。
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, r, CodeFileNotFound, "接口不存在", nil)
	})
	mux.Handle("/", s.spaHandler())

	var handler http.Handler = mux
	handler = WithRecover(logger, handler)
	handler = WithAccessLog(logger, handler)
	handler = WithRequestID(handler)

	return &http.Server{
		Addr:    cfg.Server.HTTPAddr,
		Handler: handler,
	}, s
}

// StartSessionCleanup 启动每小时一次的过期 Session 清理（README §21）。
func StartSessionCleanup(sessions *auth.Sessions, logger *slog.Logger, stop <-chan struct{}) {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if n, err := sessions.CleanupExpired(); err != nil {
					logger.Error("清理过期 session 失败", "err", err)
				} else if n > 0 {
					logger.Info("清理过期 session", "count", n)
				}
			case <-stop:
				return
			}
		}
	}()
}

// Sessions 暴露 Session 服务供 main 启动后台清理任务。
func (s *Server) Sessions() *auth.Sessions {
	return s.sessions
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Ping(); err != nil {
		WriteError(w, r, CodeInternalError, "数据库不可用", nil)
		return
	}
	WriteData(w, r, map[string]any{
		"status":  "ok",
		"version": Version,
	})
}

// spaHandler 提供嵌入式前端静态资源。
// 命中真实文件时直接返回；未命中时回退 index.html 交给前端路由。
func (s *Server) spaHandler() http.Handler {
	dist, err := fs.Sub(web.DistFS, "dist")
	if err != nil {
		panic("前端构建产物未嵌入: " + err.Error())
	}
	fileServer := http.FileServerFS(dist)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(dist, p); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// 前端路由 fallback
		http.ServeFileFS(w, r, dist, "index.html")
	})
}
