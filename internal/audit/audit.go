// Package audit 实现轻量审计日志（README §20）。
package audit

import (
	"database/sql"
	"log/slog"
	"strings"
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

// QueryOptions 是管理后台审计日志的筛选与分页参数。
type QueryOptions struct {
	Page       int
	PageSize   int
	ActorType  string
	EntryType  string
	Status     string
	SearchText string
}

// Query 按筛选条件返回审计日志。所有筛选值都通过参数绑定传给 SQLite。
func (l *Logger) Query(opts QueryOptions) ([]*LogEntry, int64, error) {
	if opts.Page < 1 {
		opts.Page = 1
	}
	if opts.PageSize < 1 {
		opts.PageSize = 50
	}
	if opts.PageSize > 200 {
		opts.PageSize = 200
	}

	where := []string{"1 = 1"}
	args := []any{}
	addExact := func(column, value string) {
		if value == "" {
			return
		}
		where = append(where, column+" = ?")
		args = append(args, value)
	}
	addExact("actor_type", opts.ActorType)
	addExact("entry_type", opts.EntryType)
	addExact("status", opts.Status)

	if query := strings.TrimSpace(opts.SearchText); query != "" {
		query = "%" + escapeLike(query) + "%"
		where = append(where, `(action LIKE ? ESCAPE '\' OR source_id LIKE ? ESCAPE '\'
      OR relative_path LIKE ? ESCAPE '\' OR target_relative_path LIKE ? ESCAPE '\'
      OR ip_address LIKE ? ESCAPE '\' OR error_code LIKE ? ESCAPE '\')`)
		for range 6 {
			args = append(args, query)
		}
	}

	whereSQL := strings.Join(where, " AND ")
	var total int64
	if err := l.db.QueryRow(`SELECT COUNT(*) FROM audit_logs WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	queryArgs := append([]any{}, args...)
	queryArgs = append(queryArgs, opts.PageSize, (opts.Page-1)*opts.PageSize)
	rows, err := l.db.Query(`SELECT
    id, actor_type, actor_user_id, entry_type, action, source_id, relative_path,
    target_relative_path, ip_address, user_agent, status, error_code, created_at
  FROM audit_logs WHERE `+whereSQL+` ORDER BY id DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []*LogEntry{}
	for rows.Next() {
		var e LogEntry
		if err := rows.Scan(&e.ID, &e.ActorType, &e.ActorUserID, &e.EntryType, &e.Action,
			&e.SourceID, &e.RelativePath, &e.TargetRelativePath, &e.IPAddress, &e.UserAgent,
			&e.Status, &e.ErrorCode, &e.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, &e)
	}
	return out, total, rows.Err()
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

// Recent 返回最近 n 条审计日志，供管理概览等摘要场景使用。
func (l *Logger) Recent(n int) ([]*LogEntry, error) {
	entries, _, err := l.Query(QueryOptions{Page: 1, PageSize: n})
	return entries, err
}
