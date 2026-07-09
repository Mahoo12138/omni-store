// Package audit 实现轻量审计日志（README §20）。
package audit

import (
	"database/sql"
	"log/slog"
	"time"
)

// actor_type 取值。
const (
	ActorUser      = "user"
	ActorAnonymous = "anonymous"
	ActorSystem    = "system"
)

// entry_type 取值。
const (
	EntryWeb               = "web"
	EntryWebDAV            = "webdav"
	EntryImageBed          = "image_bed"
	EntryAnonymousImageBed = "anonymous_image_bed"
	EntryAdmin             = "admin"
	EntryCLI               = "cli"
)

// status 取值。
const (
	StatusSuccess = "success"
	StatusFailed  = "failed"
)

// Entry 是一条审计记录。
type Entry struct {
	ActorType          string
	ActorUserID        *int64
	EntryType          string
	Action             string
	SourceID           string
	RelativePath       string
	TargetRelativePath string
	IPAddress          string
	UserAgent          string
	Status             string
	ErrorCode          string
}

// Logger 写审计日志并维护保留上限。
type Logger struct {
	db         *sql.DB
	enabled    bool
	maxEntries int
	slog       *slog.Logger
}

// New 创建审计日志器。maxEntries = 0 表示不限制。
func New(db *sql.DB, enabled bool, maxEntries int, logger *slog.Logger) *Logger {
	return &Logger{db: db, enabled: enabled, maxEntries: maxEntries, slog: logger}
}

// Log 写入一条审计记录。审计失败只记录应用日志，不影响业务。
func (l *Logger) Log(e Entry) {
	if !l.enabled {
		return
	}
	nullable := func(s string) any {
		if s == "" {
			return nil
		}
		return s
	}
	_, err := l.db.Exec(`INSERT INTO audit_logs
  (actor_type, actor_user_id, entry_type, action, source_id, relative_path, target_relative_path,
   ip_address, user_agent, status, error_code, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ActorType, e.ActorUserID, e.EntryType, e.Action,
		nullable(e.SourceID), nullable(e.RelativePath), nullable(e.TargetRelativePath),
		nullable(e.IPAddress), nullable(e.UserAgent), e.Status, nullable(e.ErrorCode),
		time.Now().UTC())
	if err != nil {
		l.slog.Error("写审计日志失败", "err", err, "action", e.Action)
		return
	}
	l.trim()
}

// trim 超过 max_entries 时删除最旧记录。
func (l *Logger) trim() {
	if l.maxEntries <= 0 {
		return
	}
	_, err := l.db.Exec(`DELETE FROM audit_logs WHERE id NOT IN (
    SELECT id FROM audit_logs ORDER BY id DESC LIMIT ?)`, l.maxEntries)
	if err != nil {
		l.slog.Error("清理审计日志失败", "err", err)
	}
}

// LogEntry 是审计查询返回结构。
type LogEntry struct {
	ID                 int64     `json:"id"`
	ActorType          string    `json:"actor_type"`
	ActorUserID        *int64    `json:"actor_user_id"`
	EntryType          string    `json:"entry_type"`
	Action             string    `json:"action"`
	SourceID           *string   `json:"source_id"`
	RelativePath       *string   `json:"relative_path"`
	TargetRelativePath *string   `json:"target_relative_path"`
	IPAddress          *string   `json:"ip_address"`
	UserAgent          *string   `json:"user_agent"`
	Status             string    `json:"status"`
	ErrorCode          *string   `json:"error_code"`
	CreatedAt          time.Time `json:"created_at"`
}

// Recent 返回最近 n 条审计日志（管理后台展示，MVP 固定最近 200 条）。
func (l *Logger) Recent(n int) ([]*LogEntry, error) {
	rows, err := l.db.Query(`SELECT
    id, actor_type, actor_user_id, entry_type, action, source_id, relative_path,
    target_relative_path, ip_address, user_agent, status, error_code, created_at
  FROM audit_logs ORDER BY id DESC LIMIT ?`, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*LogEntry
	for rows.Next() {
		var e LogEntry
		if err := rows.Scan(&e.ID, &e.ActorType, &e.ActorUserID, &e.EntryType, &e.Action,
			&e.SourceID, &e.RelativePath, &e.TargetRelativePath, &e.IPAddress, &e.UserAgent,
			&e.Status, &e.ErrorCode, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}
