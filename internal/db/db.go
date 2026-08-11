// Package db 负责 SQLite 初始化、迁移和连接管理。
// 驱动使用 modernc.org/sqlite（pure Go、无 CGO）。
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Open 打开（必要时创建）SQLite 数据库并应用迁移。
func Open(dbPath string) (*sql.DB, error) {
	if err := prepareDatabasePath(dbPath); err != nil {
		return nil, err
	}

	// busy_timeout 缓解单实例内并发写；WAL 提升读写并发。
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)", filepath.ToSlash(dbPath))
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	// SQLite 单写者，限制连接数避免 database is locked。
	conn.SetMaxOpenConns(1)

	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}
	if err := os.Chmod(dbPath, 0o600); err != nil {
		conn.Close()
		return nil, fmt.Errorf("收紧数据库文件权限失败: %w", err)
	}

	if err := Migrate(conn); err != nil {
		conn.Close()
		return nil, err
	}
	return conn, nil
}

func prepareDatabasePath(dbPath string) error {
	dir := filepath.Dir(dbPath)
	dirExisted := true
	if _, err := os.Lstat(dir); os.IsNotExist(err) {
		dirExisted = false
	} else if err != nil {
		return fmt.Errorf("检查数据库目录失败: %w", err)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("创建数据库目录失败: %w", err)
	}
	if !dirExisted {
		if err := os.Chmod(dir, 0o700); err != nil {
			return fmt.Errorf("收紧数据库目录权限失败: %w", err)
		}
	}

	info, err := os.Lstat(dbPath)
	if os.IsNotExist(err) {
		file, createErr := os.OpenFile(dbPath, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o600)
		if createErr != nil {
			return fmt.Errorf("安全创建数据库文件失败: %w", createErr)
		}
		if closeErr := file.Close(); closeErr != nil {
			return fmt.Errorf("关闭新数据库文件失败: %w", closeErr)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("检查数据库文件失败: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("数据库路径必须是普通文件且不能是符号链接")
	}
	if err := os.Chmod(dbPath, 0o600); err != nil {
		return fmt.Errorf("收紧数据库文件权限失败: %w", err)
	}
	return nil
}
