// OmniStore 入口。
//
// 用法:
//
//	omnistore server [--config path]                                启动 HTTP 服务
//	omnistore admin reset-password --username <name> [--config path]  紧急重置密码
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
	"path/filepath"
	"syscall"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/config"
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
      不指定 --password 时自动生成随机密码并打印一次`)
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

	// 初始化系统数据目录结构（README §5.1）。
	for _, sub := range []string{"", "keys", "cache", "tmp"} {
		if err := os.MkdirAll(filepath.Join(cfg.Data.Dir, sub), 0o755); err != nil {
			return fmt.Errorf("创建数据目录失败: %w", err)
		}
	}

	dbConn, err := db.Open(cfg.DatabasePath())
	if err != nil {
		return err
	}
	defer dbConn.Close()
	logger.Info("数据库就绪", "path", cfg.DatabasePath())

	srv, app := httpserver.New(cfg, dbConn, logger)

	stopCleanup := make(chan struct{})
	httpserver.StartSessionCleanup(app.Sessions(), logger, stopCleanup)
	defer close(stopCleanup)

	errCh := make(chan error, 1)
	go func() {
		logger.Info("HTTP 服务启动", "addr", cfg.Server.HTTPAddr, "public_url", cfg.Server.PublicURL)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-errCh:
		return err
	case sig := <-stop:
		logger.Info("收到退出信号，正在关闭", "signal", sig.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
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
	// 强制下线该用户所有会话。
	sessions := auth.NewSessions(dbConn, time.Duration(cfg.Security.SessionTTLHours)*time.Hour)
	_ = sessions.DeleteByUser(u.ID)

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
