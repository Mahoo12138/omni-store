// OmniStore 入口。
//
// 用法:
//
//	omnistore server [--config path]                                启动 HTTP 服务
//	omnistore admin reset-password --username <name> [--config path]  紧急重置密码
//	omnistore version                                                查看构建版本
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/buildinfo"
	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/datadir"
	"github.com/omni-store/omnistore/internal/db"
	httpserver "github.com/omni-store/omnistore/internal/http"
	"github.com/omni-store/omnistore/internal/users"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "server":
		err = runServer(os.Args[2:])
	case "admin":
		err = runAdmin(os.Args[2:])
	case "version", "-v", "--version":
		printVersion()
		return
	case "-h", "--help", "help":
		usage()
		return
	default:
		fmt.Fprintf(os.Stderr, "未知命令: %s\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "错误:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Println(`OmniStore - 轻量级自部署存储中心

用法:
  omnistore server [--config path]
      启动 HTTP 服务

  omnistore admin reset-password --username <name> [--password <new>] [--config path]
      紧急重置用户密码（只能在能访问数据库的机器上执行）
      不指定 --password 时自动生成随机密码并打印一次

  omnistore version
      显示版本、Git commit、构建时间和 Go 版本`)
}

func printVersion() {
	info := buildinfo.Current()
	fmt.Printf("OmniStore %s\n", info.Version)
	fmt.Printf("commit: %s\n", info.Commit)
	fmt.Printf("built: %s\n", info.BuildTime)
	fmt.Printf("go: %s (%s/%s)\n", info.GoVersion, runtime.GOOS, runtime.GOARCH)
}

func runServer(args []string) error {
	fs := flag.NewFlagSet("server", flag.ExitOnError)
	configFile := fs.String("config", "", "配置文件路径（默认 ./config.yaml，可用 OMNISTORE_CONFIG_FILE 指定）")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(*configFile)
	if err != nil {
		return err
	}

	logger := newLogger(cfg.Log.Level)

	if err := datadir.Prepare(cfg.Data.Dir); err != nil {
		return err
	}

	dbConn, err := db.Open(cfg.DatabasePath())
	if err != nil {
		return err
	}
	defer dbConn.Close()
	logger.Info("数据库就绪", "path", cfg.DatabasePath())

	srv, app := httpserver.New(cfg, dbConn, logger)
	transferRecovery, err := app.Files().RecoverTransferOperations()
	if err != nil {
		return fmt.Errorf("恢复中断的跨来源移动失败: %w", err)
	}
	if transferRecovery.CompletedMoves+transferRecovery.RolledBackMoves > 0 {
		logger.Info("已恢复中断的跨来源移动",
			"completed_moves", transferRecovery.CompletedMoves,
			"rolled_back_moves", transferRecovery.RolledBackMoves)
	}
	trashRecovery, err := app.Files().RecoverTrashOperations()
	if err != nil {
		return fmt.Errorf("恢复中断的回收站操作失败: %w", err)
	}
	if trashRecovery.CompletedMoves+trashRecovery.RolledBackMoves+
		trashRecovery.CompletedRestores+trashRecovery.RolledBackRestores+
		trashRecovery.CompletedPurges > 0 {
		logger.Info("已恢复中断的回收站操作",
			"completed_moves", trashRecovery.CompletedMoves,
			"rolled_back_moves", trashRecovery.RolledBackMoves,
			"completed_restores", trashRecovery.CompletedRestores,
			"rolled_back_restores", trashRecovery.RolledBackRestores,
			"completed_purges", trashRecovery.CompletedPurges)
	}
	fileUploadRecovery, err := app.Files().RecoverFileUploadOperations()
	if err != nil {
		return fmt.Errorf("恢复中断的普通文件上传失败: %w", err)
	}
	if fileUploadRecovery.CompletedUploads+fileUploadRecovery.RolledBackUploads > 0 {
		logger.Info("已恢复中断的普通文件上传",
			"completed_uploads", fileUploadRecovery.CompletedUploads,
			"rolled_back_uploads", fileUploadRecovery.RolledBackUploads)
	}
	multipartPartRecovery, err := app.S3Multipart().RecoverMultipartPartOperations()
	if err != nil {
		return fmt.Errorf("恢复中断的 S3 Multipart 分片上传失败: %w", err)
	}
	if multipartPartRecovery.CompletedParts+multipartPartRecovery.RolledBackParts > 0 {
		logger.Info("已恢复中断的 S3 Multipart 分片上传",
			"completed_parts", multipartPartRecovery.CompletedParts,
			"rolled_back_parts", multipartPartRecovery.RolledBackParts)
	}
	multipartRecovery, err := app.S3Multipart().RecoverMultipartCompletions()
	if err != nil {
		return fmt.Errorf("恢复中断的 S3 Multipart 完成操作失败: %w", err)
	}
	if multipartRecovery.CompletedUploads+multipartRecovery.RolledBackUploads > 0 {
		logger.Info("已恢复中断的 S3 Multipart 完成操作",
			"completed_uploads", multipartRecovery.CompletedUploads,
			"rolled_back_uploads", multipartRecovery.RolledBackUploads)
	}
	uploadRecovery, err := app.ImageBed().RecoverUploadOperations()
	if err != nil {
		return fmt.Errorf("恢复中断的图床上传失败: %w", err)
	}
	if uploadRecovery.CompletedUploads+uploadRecovery.RolledBackUploads > 0 {
		logger.Info("已恢复中断的图床上传",
			"completed_uploads", uploadRecovery.CompletedUploads,
			"rolled_back_uploads", uploadRecovery.RolledBackUploads)
	}

	stopCleanup := make(chan struct{})
	httpserver.StartSessionCleanup(app.Sessions(), logger, stopCleanup)
	if cfg.Server.S3Enabled {
		httpserver.StartS3MultipartCleanup(app.S3Multipart(), logger, stopCleanup)
	}
	if cfg.Upload.CleanupStaleFiles {
		httpserver.StartUploadCleanup(app.Files(),
			time.Duration(cfg.Upload.TempFileMaxAgeHours)*time.Hour, logger, stopCleanup)
	}
	httpserver.StartWebDAVLockCleanup(app.Files(), logger, stopCleanup)
	httpserver.StartThumbnailCacheCleanup(app.ImageBed(), logger, stopCleanup)
	defer close(stopCleanup)

	servers := []*http.Server{srv}
	errCh := make(chan error, 2)
	go func() {
		logger.Info("HTTP 服务启动", "addr", cfg.Server.HTTPAddr, "public_url", cfg.Server.PublicURL)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	if cfg.Server.S3Enabled {
		s3Srv := app.S3Server()
		servers = append(servers, s3Srv)
		go func() {
			logger.Info("S3 服务启动", "addr", cfg.Server.S3Addr, "style", "path")
			if err := s3Srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				errCh <- err
			}
		}()
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	var runErr error
	select {
	case err := <-errCh:
		runErr = err
	case sig := <-stop:
		logger.Info("收到退出信号，正在关闭", "signal", sig.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, running := range servers {
		if err := running.Shutdown(ctx); err != nil && runErr == nil {
			runErr = err
		}
	}
	return runErr
}

// runAdmin 处理 admin 子命令。MVP 只有 reset-password（README §8.8）。
func runAdmin(args []string) error {
	if len(args) < 1 || args[0] != "reset-password" {
		return fmt.Errorf("用法: omnistore admin reset-password --username <name> [--password <new>]")
	}

	fs := flag.NewFlagSet("reset-password", flag.ExitOnError)
	username := fs.String("username", "", "要重置密码的用户名")
	password := fs.String("password", "", "新密码（不指定时自动生成）")
	configFile := fs.String("config", "", "配置文件路径")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *username == "" {
		return fmt.Errorf("必须指定 --username")
	}

	cfg, err := config.Load(*configFile)
	if err != nil {
		return err
	}
	if err := datadir.Prepare(cfg.Data.Dir); err != nil {
		return err
	}
	dbConn, err := db.Open(cfg.DatabasePath())
	if err != nil {
		return err
	}
	defer dbConn.Close()

	userSvc := users.NewService(dbConn)
	u, err := userSvc.GetByUsername(*username)
	if err != nil {
		return fmt.Errorf("用户 %s 不存在", *username)
	}

	newPassword := *password
	generated := false
	if newPassword == "" {
		newPassword = auth.NewRandomToken("", 12)
		generated = true
	}
	if err := userSvc.UpdatePassword(u.ID, newPassword); err != nil {
		return err
	}

	// 审计：actor_type = system, entry_type = cli，不记录明文密码。
	auditLogger := audit.New(dbConn, cfg.Audit.Enabled, cfg.Audit.MaxEntries, newLogger(cfg.Log.Level))
	auditLogger.Log(audit.Entry{
		ActorType: audit.ActorSystem,
		EntryType: audit.EntryCLI,
		Action:    "reset_password",
		Status:    audit.StatusSuccess,
	})

	fmt.Printf("用户 %s 的密码已重置。\n", *username)
	if generated {
		fmt.Printf("新密码（只显示一次，请立即登录后修改）: %s\n", newPassword)
	}
	return nil
}

func newLogger(level string) *slog.Logger {
	var lv slog.Level
	switch level {
	case "debug":
		lv = slog.LevelDebug
	case "warn":
		lv = slog.LevelWarn
	case "error":
		lv = slog.LevelError
	default:
		lv = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: lv}))
}
