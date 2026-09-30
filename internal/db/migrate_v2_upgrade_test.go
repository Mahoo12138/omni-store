package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/omni-store/omnistore/migrations"
)

// newLegacyDB 构造一个只应用 1.x 迁移的数据库，模拟 1.1.x 存量实例。
func newLegacyDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "legacy.db"))+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	conn.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = conn.Close() })
	ctx := context.Background()
	if _, err := conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL
)`); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"v1.0.0.sql", "v1.1.0.sql", "v1.1.1.sql"} {
		content, err := migrations.FS.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := conn.ExecContext(ctx, string(content)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
		if _, err := conn.ExecContext(ctx,
			`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
			name[:len(name)-4], time.Now().UTC()); err != nil {
			t.Fatal(err)
		}
	}
	return conn
}

func TestMigrateFromV1ToV2(t *testing.T) {
	conn := newLegacyDB(t)
	ctx := context.Background()

	// 1.1.x 形态的存量数据：一个公开挂载源、一个图床源、用户偏好、图片与台账。
	seed := []string{
		`INSERT INTO users (id, user_public_id, username, display_name, password_hash, role, is_disabled, created_at, updated_at)
		  VALUES (1, 'pub-admin', 'admin', 'Admin', 'x', 'super_admin', 0, datetime('now'), datetime('now'))`,
		`INSERT INTO storage_sources (key, name, root_path, public_read_enabled, public_mount_path, image_bed_enabled, created_at, updated_at)
		  VALUES ('src-pub', 'Public', '/tmp/pub', 1, '/share', 0, datetime('now'), datetime('now'))`,
		`INSERT INTO storage_sources (key, name, root_path, image_bed_enabled, created_at, updated_at)
		  VALUES ('src-img', 'Images', '/tmp/img', 1, datetime('now'), datetime('now'))`,
		`INSERT INTO storage_sources (key, name, root_path, created_at, updated_at)
		  VALUES ('src-plain', 'Plain', '/tmp/plain', datetime('now'), datetime('now'))`,
		`INSERT INTO public_mount_redirects (mount_path, storage_source_id, created_at)
		  VALUES ('/old-share', 1, datetime('now'))`,
		`INSERT INTO user_preferences (user_id, default_image_bed_storage_source_id, updated_at)
		  VALUES (1, 2, datetime('now'))`,
		`INSERT INTO images (image_id, owner_type, owner_user_id, storage_source_id, relative_path, public_url, size, mime_type, width, height, ext, created_at)
		  VALUES ('img-legacy', 'user', 1, 2, 'users/pub/2026/09/a.png', '/i/a.png', 3, 'image/png', 1, 1, 'png', datetime('now'))`,
		`INSERT INTO file_records (storage_source_id, relative_path, size, owner_type, mtime_unix_nano, record_status, created_at, updated_at)
		  VALUES (2, 'users/pub/2026/09/a.png', 3, 'user', 0, 'active', datetime('now'), datetime('now'))`,
		`INSERT INTO favorites (user_id, storage_source_id, relative_path, created_at)
		  VALUES (1, 2, 'users/pub/2026/09/a.png', datetime('now'))`,
	}
	for _, stmt := range seed {
		if _, err := conn.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("seed: %v: %v", stmt, err)
		}
	}

	if err := Migrate(conn); err != nil {
		t.Fatalf("upgrade to 2.0.0: %v", err)
	}

	// 外键强制必须已恢复。
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO file_records (storage_source_id, relative_path, size, owner_type, mtime_unix_nano, record_status, created_at, updated_at)
		  VALUES (999, 'x', 1, 'unowned', 0, 'active', datetime('now'), datetime('now'))`); err == nil {
		t.Fatal("foreign key enforcement lost after migration")
	}

	// 旧字段删除、新字段存在。
	columns := map[string]bool{}
	rows, err := conn.QueryContext(ctx, `PRAGMA table_info(storage_sources)`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var cid int
		var name, ctype string
		var notNull, pk int
		var dflt any
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		columns[name] = true
	}
	rows.Close()
	for _, gone := range []string{"public_read_enabled", "public_mount_path", "image_bed_enabled"} {
		if columns[gone] {
			t.Fatalf("storage_sources still has legacy column %s", gone)
		}
	}
	for _, want := range []string{"s3_enabled", "webdav_enabled", "quota_bytes", "root_path"} {
		if !columns[want] {
			t.Fatalf("storage_sources missing column %s", want)
		}
	}

	// 公开盘绑定收敛到唯一公开源。
	var capability string
	var enabled int
	var sourceID sql.NullInt64
	if err := conn.QueryRowContext(ctx,
		`SELECT capability, enabled, storage_source_id FROM site_capability_bindings WHERE capability = 'public_drive'`).
		Scan(&capability, &enabled, &sourceID); err != nil {
		t.Fatal(err)
	}
	if enabled != 1 || !sourceID.Valid || sourceID.Int64 != 1 {
		t.Fatalf("public_drive binding = enabled %d source %v, want enabled 1 source 1", enabled, sourceID)
	}

	// 图床绑定收敛到启用图床的源；用户偏好列已删除。
	if err := conn.QueryRowContext(ctx,
		`SELECT enabled, storage_source_id FROM site_capability_bindings WHERE capability = 'image_bed'`).
		Scan(&enabled, &sourceID); err != nil {
		t.Fatal(err)
	}
	if enabled != 1 || !sourceID.Valid || sourceID.Int64 != 2 {
		t.Fatalf("image_bed binding = enabled %d source %v, want enabled 1 source 2", enabled, sourceID)
	}
	if err := conn.QueryRowContext(ctx,
		`SELECT enabled, storage_source_id FROM site_capability_bindings WHERE capability = 'static_assets'`).
		Scan(&enabled, &sourceID); err != nil {
		t.Fatal(err)
	}
	if enabled != 0 || sourceID.Valid {
		t.Fatalf("static_assets binding must default to disabled/unbound, got %d %v", enabled, sourceID)
	}

	prefColumns := map[string]bool{}
	rows, err = conn.QueryContext(ctx, `PRAGMA table_info(user_preferences)`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var cid int
		var name, ctype string
		var notNull, pk int
		var dflt any
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		prefColumns[name] = true
	}
	rows.Close()
	if prefColumns["default_image_bed_storage_source_id"] {
		t.Fatal("user_preferences still has image bed source preference")
	}

	// 旧表删除、数据保全。
	var count int
	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM images`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("images rows=%d err=%v", count, err)
	}
	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM file_records`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("file_records rows=%d err=%v", count, err)
	}
	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM favorites`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("favorites rows=%d err=%v", count, err)
	}
	if err := conn.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'public_mount_redirects'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("public_mount_redirects must be dropped, count=%d err=%v", count, err)
	}

	// 绑定外键 RESTRICT：删除仍被绑定的源必须失败。
	if _, err := conn.ExecContext(ctx, `DELETE FROM storage_sources WHERE id = 1`); err == nil {
		t.Fatal("deleting a bound source must be rejected")
	}
	// 未绑定的源仍可删除。
	if _, err := conn.ExecContext(ctx, `DELETE FROM storage_sources WHERE id = 3`); err != nil {
		t.Fatalf("deleting an unbound source must succeed: %v", err)
	}

	// AUTOINCREMENT 序列保留。
	if _, err := conn.ExecContext(ctx,
		`INSERT INTO storage_sources (key, name, root_path, created_at, updated_at)
		  VALUES ('src-new', 'New', '/tmp/new', datetime('now'), datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRowContext(ctx, `SELECT id FROM storage_sources WHERE key = 'src-new'`).Scan(&count); err != nil || count != 4 {
		t.Fatalf("autoincrement id=%d err=%v, want 4", count, err)
	}

	// 重复执行不再变更。
	if err := Migrate(conn); err != nil {
		t.Fatalf("idempotent migrate: %v", err)
	}

	// resource_scope 回填：图片台账行标为 image_bed，普通行保持 file。
	var scope string
	if err := conn.QueryRowContext(ctx,
		`SELECT resource_scope FROM file_records WHERE relative_path = 'users/pub/2026/09/a.png'`).Scan(&scope); err != nil {
		t.Fatal(err)
	}
	if scope != "image_bed" {
		t.Fatalf("image ledger scope = %q, want image_bed", scope)
	}

	// FTS 不再索引 image_bed scope 行。
	var ftsCount int
	if err := conn.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM file_search_index WHERE rowid IN (SELECT id FROM file_records WHERE resource_scope = 'image_bed')`).Scan(&ftsCount); err != nil {
		t.Fatal(err)
	}
	if ftsCount != 0 {
		t.Fatalf("image ledger rows must leave FTS, count=%d", ftsCount)
	}

	// images.expires_at 列存在且旧记录为 NULL（不自动过期）。
	var expiresAt any
	if err := conn.QueryRowContext(ctx, `SELECT expires_at FROM images WHERE image_id = 'img-legacy'`).Scan(&expiresAt); err != nil {
		t.Fatal(err)
	}
	if expiresAt != nil {
		t.Fatalf("legacy image expires_at = %v, want NULL", expiresAt)
	}
}
