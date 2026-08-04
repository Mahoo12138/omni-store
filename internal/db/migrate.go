package db

import (
	"database/sql"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/omni-store/omnistore/migrations"
)

const initialMigrationVersion = "v1.0.0"

var (
	migrationFilenamePattern = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.sql$`)
	legacyPreReleaseVersions = []string{"0001_init", "0002_public_mount_redirects"}
)

type semanticVersion struct {
	major int
	minor int
	patch int
}

type migrationFile struct {
	name    string
	version semanticVersion
}

// Migrate 按 SemVer 顺序应用未执行过的 SQL 迁移。
// 每个迁移在单独事务中执行，版本记录写入 schema_migrations。
func Migrate(conn *sql.DB) error {
	if _, err := conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL
)`); err != nil {
		return fmt.Errorf("创建 schema_migrations 失败: %w", err)
	}
	if err := upgradePreReleaseSourceSchema(conn); err != nil {
		return err
	}
	if err := reconcilePreReleaseMigrations(conn); err != nil {
		return err
	}

	applied := map[string]bool{}
	rows, err := conn.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("读取迁移版本失败: %w", err)
	}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return err
		}
		applied[v] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	files, err := migrationFiles()
	if err != nil {
		return err
	}

	for _, file := range files {
		name := file.name
		version := strings.TrimSuffix(name, ".sql")
		// v1.0.0 尚未发布，基线会持续合并新的幂等建表/索引语句。
		// 已记录该版本的开发数据库仍需安全重放，以获得新加入的结构。
		if applied[version] && version != initialMigrationVersion {
			continue
		}
		sqlBytes, err := migrations.FS.ReadFile(name)
		if err != nil {
			return fmt.Errorf("读取迁移 %s 失败: %w", name, err)
		}

		tx, err := conn.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("执行迁移 %s 失败: %w", name, err)
		}
		if !applied[version] {
			if _, err := tx.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
				version, time.Now().UTC()); err != nil {
				tx.Rollback()
				return fmt.Errorf("记录迁移版本 %s 失败: %w", version, err)
			}
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("提交迁移 %s 失败: %w", name, err)
		}
	}
	return nil
}

// upgradePreReleaseSourceSchema upgrades development databases created before
// storage sources switched from a user-chosen identifier to a generated opaque
// key. v1.0.0 is not released yet, so this compatibility bridge deliberately
// lives in Go instead of becoming a second migration file.
func upgradePreReleaseSourceSchema(conn *sql.DB) (returnErr error) {
	legacy, err := tableHasColumn(conn, "storage_sources", "source_id")
	if err != nil {
		return fmt.Errorf("检查开发期存储源结构失败: %w", err)
	}
	if !legacy {
		return nil
	}

	if _, err := conn.Exec(`PRAGMA foreign_keys = OFF`); err != nil {
		return fmt.Errorf("暂停外键校验失败: %w", err)
	}
	defer func() {
		if _, err := conn.Exec(`PRAGMA foreign_keys = ON`); returnErr == nil && err != nil {
			returnErr = fmt.Errorf("恢复外键校验失败: %w", err)
		}
	}()

	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(preReleaseSourceSchemaCompatibilitySQL); err != nil {
		tx.Rollback()
		return fmt.Errorf("补齐开发期兼容结构失败: %w", err)
	}
	if _, err := tx.Exec(preReleaseSourceSchemaUpgradeSQL); err != nil {
		tx.Rollback()
		return fmt.Errorf("升级开发期存储源结构失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交开发期存储源结构升级失败: %w", err)
	}

	rows, err := conn.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		return fmt.Errorf("校验升级后外键失败: %w", err)
	}
	defer rows.Close()
	if rows.Next() {
		var table string
		var rowID sql.NullInt64
		var parent string
		var fkID int
		if err := rows.Scan(&table, &rowID, &parent, &fkID); err != nil {
			return fmt.Errorf("读取外键校验结果失败: %w", err)
		}
		return fmt.Errorf("升级后外键不一致: table=%s row=%v parent=%s fk=%d", table, rowID, parent, fkID)
	}
	return rows.Err()
}

func tableHasColumn(conn *sql.DB, table, column string) (bool, error) {
	rows, err := conn.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, dataType string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// Very early development databases may predate one or more source-related
// feature tables. Empty legacy-shaped tables let the single rebuild below stay
// deterministic; CREATE TABLE IF NOT EXISTS preserves every table that exists.
const preReleaseSourceSchemaCompatibilitySQL = `
CREATE TABLE IF NOT EXISTS storage_source_exclude_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, pattern TEXT NOT NULL, created_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS user_source_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_id TEXT NOT NULL,
  permission TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY, default_image_bed_source_id TEXT, updated_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT, image_id TEXT NOT NULL UNIQUE, owner_type TEXT NOT NULL,
  owner_user_id INTEGER, source_id TEXT NOT NULL, relative_path TEXT NOT NULL, original_filename TEXT,
  public_url TEXT NOT NULL, size INTEGER NOT NULL, mime_type TEXT NOT NULL, width INTEGER NOT NULL,
  height INTEGER NOT NULL, ext TEXT NOT NULL, created_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_type TEXT NOT NULL, actor_user_id INTEGER,
  entry_type TEXT NOT NULL, action TEXT NOT NULL, source_id TEXT, relative_path TEXT,
  target_relative_path TEXT, ip_address TEXT, user_agent TEXT, status TEXT NOT NULL,
  error_code TEXT, created_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS public_mount_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, mount_path TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS webdav_locks (
  token TEXT PRIMARY KEY, source_id TEXT NOT NULL, relative_path TEXT NOT NULL,
  depth TEXT NOT NULL CHECK(depth IN ('0', 'infinity')), owner_xml TEXT NOT NULL DEFAULT '',
  owner_user_id INTEGER NOT NULL, created_at DATETIME NOT NULL, refreshed_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS s3_multipart_uploads (
  upload_id TEXT PRIMARY KEY, owner_user_id INTEGER NOT NULL, source_id TEXT NOT NULL,
  object_key TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS s3_multipart_parts (
  upload_id TEXT NOT NULL, part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 10000),
  etag TEXT NOT NULL, size INTEGER NOT NULL, created_at DATETIME NOT NULL,
  PRIMARY KEY(upload_id, part_number)
);
CREATE TABLE IF NOT EXISTS s3_object_etags (
  source_id TEXT NOT NULL, object_key TEXT NOT NULL, etag TEXT NOT NULL, size INTEGER NOT NULL,
  mtime_unix_nano INTEGER NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(source_id, object_key)
);`

const preReleaseSourceSchemaUpgradeSQL = `
ALTER TABLE s3_multipart_parts RENAME TO s3_multipart_parts_legacy;
ALTER TABLE s3_multipart_uploads RENAME TO s3_multipart_uploads_legacy;
ALTER TABLE s3_object_etags RENAME TO s3_object_etags_legacy;
ALTER TABLE storage_source_exclude_patterns RENAME TO storage_source_exclude_patterns_legacy;
ALTER TABLE user_source_permissions RENAME TO user_source_permissions_legacy;
ALTER TABLE user_preferences RENAME TO user_preferences_legacy;
ALTER TABLE images RENAME TO images_legacy;
ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
ALTER TABLE public_mount_redirects RENAME TO public_mount_redirects_legacy;
ALTER TABLE webdav_locks RENAME TO webdav_locks_legacy;
ALTER TABLE storage_sources RENAME TO storage_sources_legacy;

CREATE TABLE storage_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT 0,
  public_read_enabled BOOLEAN NOT NULL DEFAULT 0,
  public_mount_path TEXT UNIQUE,
  webdav_enabled BOOLEAN NOT NULL DEFAULT 1,
  image_bed_enabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
INSERT INTO storage_sources
  (id, key, name, description, root_path, is_disabled, public_read_enabled,
   public_mount_path, webdav_enabled, image_bed_enabled, created_at, updated_at)
SELECT id, 'src-' || lower(hex(randomblob(8))), name, description, root_path,
       is_disabled, public_read_enabled, public_mount_path, webdav_enabled,
       image_bed_enabled, created_at, updated_at
FROM storage_sources_legacy;

CREATE TABLE storage_source_exclude_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_source_id INTEGER NOT NULL,
  pattern TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
INSERT INTO storage_source_exclude_patterns (id, storage_source_id, pattern, created_at)
SELECT legacy.id, source.id, legacy.pattern, legacy.created_at
FROM storage_source_exclude_patterns_legacy legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

CREATE TABLE user_source_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE,
  UNIQUE(user_id, storage_source_id)
);
INSERT INTO user_source_permissions
  (id, user_id, storage_source_id, permission, created_at, updated_at)
SELECT legacy.id, legacy.user_id, source.id, legacy.permission, legacy.created_at, legacy.updated_at
FROM user_source_permissions_legacy legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

CREATE TABLE user_preferences (
  user_id INTEGER PRIMARY KEY,
  default_image_bed_storage_source_id INTEGER,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(default_image_bed_storage_source_id) REFERENCES storage_sources(id) ON DELETE SET NULL
);
INSERT INTO user_preferences (user_id, default_image_bed_storage_source_id, updated_at)
SELECT legacy.user_id, source.id, legacy.updated_at
FROM user_preferences_legacy legacy
LEFT JOIN storage_sources_legacy source ON source.source_id = legacy.default_image_bed_source_id;

CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL,
  owner_user_id INTEGER,
  storage_source_id INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  original_filename TEXT,
  public_url TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  ext TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id),
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
INSERT INTO images
  (id, image_id, owner_type, owner_user_id, storage_source_id, relative_path,
   original_filename, public_url, size, mime_type, width, height, ext, created_at)
SELECT legacy.id, legacy.image_id, legacy.owner_type, legacy.owner_user_id, source.id,
       legacy.relative_path, legacy.original_filename, legacy.public_url, legacy.size,
       legacy.mime_type, legacy.width, legacy.height, legacy.ext, legacy.created_at
FROM images_legacy legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_user_id INTEGER,
  entry_type TEXT NOT NULL,
  action TEXT NOT NULL,
  storage_source_id INTEGER,
  relative_path TEXT,
  target_relative_path TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id)
);
INSERT INTO audit_logs
  (id, actor_type, actor_user_id, entry_type, action, storage_source_id,
   relative_path, target_relative_path, ip_address, user_agent, status, error_code, created_at)
SELECT legacy.id, legacy.actor_type, legacy.actor_user_id, legacy.entry_type, legacy.action,
       source.id, legacy.relative_path, legacy.target_relative_path, legacy.ip_address,
       legacy.user_agent, legacy.status, legacy.error_code, legacy.created_at
FROM audit_logs_legacy legacy
LEFT JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

CREATE TABLE public_mount_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_source_id INTEGER NOT NULL,
  mount_path TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
INSERT INTO public_mount_redirects (id, storage_source_id, mount_path, created_at)
SELECT legacy.id, source.id, legacy.mount_path, legacy.created_at
FROM public_mount_redirects_legacy legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

CREATE TABLE webdav_locks (
  token TEXT PRIMARY KEY,
  storage_source_id INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  depth TEXT NOT NULL CHECK(depth IN ('0', 'infinity')),
  owner_xml TEXT NOT NULL DEFAULT '',
  owner_user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  refreshed_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO webdav_locks
  (token, storage_source_id, relative_path, depth, owner_xml, owner_user_id,
   created_at, refreshed_at, expires_at)
SELECT legacy.token, source.id, legacy.relative_path, legacy.depth, legacy.owner_xml,
       legacy.owner_user_id, legacy.created_at, legacy.refreshed_at, legacy.expires_at
FROM webdav_locks_legacy legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

CREATE TABLE s3_multipart_uploads (
  upload_id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
INSERT INTO s3_multipart_uploads
  (upload_id, owner_user_id, storage_source_id, object_key, created_at, updated_at)
SELECT legacy.upload_id, legacy.owner_user_id, source.id, legacy.object_key,
       legacy.created_at, legacy.updated_at
FROM s3_multipart_uploads_legacy legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

CREATE TABLE s3_multipart_parts (
  upload_id TEXT NOT NULL,
  part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 10000),
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(upload_id, part_number),
  FOREIGN KEY(upload_id) REFERENCES s3_multipart_uploads(upload_id) ON DELETE CASCADE
);
INSERT INTO s3_multipart_parts (upload_id, part_number, etag, size, created_at)
SELECT upload_id, part_number, etag, size, created_at FROM s3_multipart_parts_legacy;

CREATE TABLE s3_object_etags (
  storage_source_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_unix_nano INTEGER NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(storage_source_id, object_key),
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
INSERT INTO s3_object_etags
  (storage_source_id, object_key, etag, size, mtime_unix_nano, updated_at)
SELECT source.id, legacy.object_key, legacy.etag, legacy.size,
       legacy.mtime_unix_nano, legacy.updated_at
FROM s3_object_etags_legacy legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.source_id;

INSERT INTO system_settings (key, value, updated_at)
SELECT 'anonymous_image_bed_storage_source_id', CAST(source.id AS TEXT), legacy.updated_at
FROM system_settings legacy
JOIN storage_sources_legacy source ON source.source_id = legacy.value
WHERE legacy.key = 'anonymous_image_bed_source_id'
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
DELETE FROM system_settings WHERE key = 'anonymous_image_bed_source_id';

DROP TABLE s3_multipart_parts_legacy;
DROP TABLE s3_multipart_uploads_legacy;
DROP TABLE s3_object_etags_legacy;
DROP TABLE storage_source_exclude_patterns_legacy;
DROP TABLE user_source_permissions_legacy;
DROP TABLE user_preferences_legacy;
DROP TABLE images_legacy;
DROP TABLE audit_logs_legacy;
DROP TABLE public_mount_redirects_legacy;
DROP TABLE webdav_locks_legacy;
DROP TABLE storage_sources_legacy;
`

func migrationFiles() ([]migrationFile, error) {
	entries, err := migrations.FS.ReadDir(".")
	if err != nil {
		return nil, fmt.Errorf("读取迁移文件失败: %w", err)
	}
	files := make([]migrationFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		version, err := parseMigrationFilename(entry.Name())
		if err != nil {
			return nil, err
		}
		files = append(files, migrationFile{name: entry.Name(), version: version})
	}
	sortMigrationFiles(files)
	return files, nil
}

func sortMigrationFiles(files []migrationFile) {
	sort.Slice(files, func(i, j int) bool {
		left, right := files[i].version, files[j].version
		if left.major != right.major {
			return left.major < right.major
		}
		if left.minor != right.minor {
			return left.minor < right.minor
		}
		return left.patch < right.patch
	})
}

func parseMigrationFilename(name string) (semanticVersion, error) {
	matches := migrationFilenamePattern.FindStringSubmatch(name)
	if matches == nil {
		return semanticVersion{}, fmt.Errorf("迁移文件名 %s 不符合 vMAJOR.MINOR.PATCH.sql 规则", name)
	}
	parts := [3]int{}
	for i := range parts {
		value, err := strconv.Atoi(matches[i+1])
		if err != nil {
			return semanticVersion{}, fmt.Errorf("解析迁移文件版本 %s 失败: %w", name, err)
		}
		parts[i] = value
	}
	return semanticVersion{major: parts[0], minor: parts[1], patch: parts[2]}, nil
}

// reconcilePreReleaseMigrations preserves local development databases created
// before the unreleased v1.0.0 migrations were squashed into one version file.
func reconcilePreReleaseMigrations(conn *sql.DB) error {
	var targetApplied int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, initialMigrationVersion).Scan(&targetApplied); err != nil {
		return fmt.Errorf("检查初始迁移版本失败: %w", err)
	}
	var legacyApplied int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version IN (?, ?)`,
		legacyPreReleaseVersions[0], legacyPreReleaseVersions[1]).Scan(&legacyApplied); err != nil {
		return fmt.Errorf("检查开发期迁移版本失败: %w", err)
	}
	if targetApplied == 0 && legacyApplied != len(legacyPreReleaseVersions) {
		return nil
	}

	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM schema_migrations WHERE version IN (?, ?)`,
		legacyPreReleaseVersions[0], legacyPreReleaseVersions[1]); err != nil {
		tx.Rollback()
		return fmt.Errorf("清理开发期迁移版本失败: %w", err)
	}
	if targetApplied == 0 {
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
			initialMigrationVersion, time.Now().UTC()); err != nil {
			tx.Rollback()
			return fmt.Errorf("合并开发期迁移版本失败: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交开发期迁移版本合并失败: %w", err)
	}
	return nil
}
