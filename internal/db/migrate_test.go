package db

import (
	"database/sql"
	"path/filepath"
	"reflect"
	"regexp"
	"testing"
)

func TestParseAndSortMigrationFilenamesBySemanticVersion(t *testing.T) {
	names := []string{"v2.0.0.sql", "v1.10.0.sql", "v1.2.1.sql", "v1.2.0.sql"}
	files := make([]migrationFile, 0, len(names))
	for _, name := range names {
		version, err := parseMigrationFilename(name)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}
		files = append(files, migrationFile{name: name, version: version})
	}
	sortMigrationFiles(files)
	got := make([]string, 0, len(files))
	for _, file := range files {
		got = append(got, file.name)
	}
	want := []string{"v1.2.0.sql", "v1.2.1.sql", "v1.10.0.sql", "v2.0.0.sql"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected migration order: got=%v want=%v", got, want)
	}
	for _, invalid := range []string{"0001_init.sql", "v1.0.sql", "v1.01.0.sql", "v1.0.0-dev.sql"} {
		if _, err := parseMigrationFilename(invalid); err == nil {
			t.Fatalf("expected invalid migration filename %s", invalid)
		}
	}
}

func TestOpenAppliesSquashedInitialMigration(t *testing.T) {
	conn, err := Open(filepath.Join(t.TempDir(), "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer conn.Close()
	if err := Migrate(conn); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}

	var versions []string
	rows, err := conn.Query(`SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		t.Fatalf("query migration versions: %v", err)
	}
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			t.Fatalf("scan migration version: %v", err)
		}
		versions = append(versions, version)
	}
	if err := rows.Close(); err != nil {
		t.Fatalf("close migration rows: %v", err)
	}
	if !reflect.DeepEqual(versions, []string{initialMigrationVersion}) {
		t.Fatalf("unexpected applied migrations: %v", versions)
	}

	var tableName string
	if err := conn.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'public_mount_redirects'`).Scan(&tableName); err != nil {
		t.Fatalf("initial migration missing redirects table: %v", err)
	}
	if _, err := conn.Exec(`DROP TABLE webdav_locks`); err != nil {
		t.Fatalf("drop development table: %v", err)
	}
	if err := Migrate(conn); err != nil {
		t.Fatalf("replay unreleased baseline: %v", err)
	}
	if err := conn.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'webdav_locks'`).Scan(&tableName); err != nil {
		t.Fatalf("replayed baseline missing WebDAV locks table: %v", err)
	}
	if _, err := conn.Exec(`ALTER TABLE storage_sources DROP COLUMN quota_bytes`); err != nil {
		t.Fatalf("simulate pre-quota development schema: %v", err)
	}
	if _, err := conn.Exec(`ALTER TABLE users DROP COLUMN quota_bytes`); err != nil {
		t.Fatalf("simulate pre-user-quota development schema: %v", err)
	}
	if err := Migrate(conn); err != nil {
		t.Fatalf("add unreleased quota column: %v", err)
	}
	if hasQuota, err := tableHasColumn(conn, "storage_sources", "quota_bytes"); err != nil || !hasQuota {
		t.Fatalf("replayed baseline missing quota column: present=%v err=%v", hasQuota, err)
	}
	if hasQuota, err := tableHasColumn(conn, "users", "quota_bytes"); err != nil || !hasQuota {
		t.Fatalf("replayed baseline missing user quota column: present=%v err=%v", hasQuota, err)
	}
	if err := conn.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'file_records'`).Scan(&tableName); err != nil {
		t.Fatalf("replayed baseline missing file_records: %v", err)
	}
}

func TestMigrateReconcilesLegacyPreReleaseVersions(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	conn, err := Open(dbPath)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer conn.Close()
	if _, err := conn.Exec(`DELETE FROM schema_migrations`); err != nil {
		t.Fatalf("clear migration version: %v", err)
	}
	for _, version := range legacyPreReleaseVersions {
		if _, err := conn.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, CURRENT_TIMESTAMP)`, version); err != nil {
			t.Fatalf("insert legacy migration %s: %v", version, err)
		}
	}

	if err := Migrate(conn); err != nil {
		t.Fatalf("reconcile legacy migrations: %v", err)
	}
	var version string
	if err := conn.QueryRow(`SELECT version FROM schema_migrations`).Scan(&version); err != nil {
		t.Fatalf("query reconciled migration: %v", err)
	}
	if version != initialMigrationVersion {
		t.Fatalf("unexpected reconciled migration: %s", version)
	}
	var count int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count reconciled migrations: %v", err)
	}
	if count != 1 {
		t.Fatalf("unexpected migration count: %d", count)
	}
}

func TestMigrateUpgradesLegacySourceIdentifiersWithoutLosingRelations(t *testing.T) {
	conn, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "legacy-source.db"))+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}
	conn.SetMaxOpenConns(1)
	defer conn.Close()
	if _, err := conn.Exec(legacySourceSchemaFixture); err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}
	if _, err := conn.Exec(legacySourceDataFixture); err != nil {
		t.Fatalf("seed legacy schema: %v", err)
	}

	if err := Migrate(conn); err != nil {
		t.Fatalf("upgrade legacy schema: %v", err)
	}

	var key, name string
	if err := conn.QueryRow(`SELECT key, name FROM storage_sources WHERE id = 7`).Scan(&key, &name); err != nil {
		t.Fatalf("query upgraded source: %v", err)
	}
	if !regexp.MustCompile(`^src-[0-9a-f]{16}$`).MatchString(key) || name != "Legacy Photos" {
		t.Fatalf("unexpected upgraded source: key=%q name=%q", key, name)
	}
	var quotaBytes int64
	if err := conn.QueryRow(`SELECT quota_bytes FROM storage_sources WHERE id = 7`).Scan(&quotaBytes); err != nil || quotaBytes != 0 {
		t.Fatalf("legacy source quota default: quota=%d err=%v", quotaBytes, err)
	}
	legacyColumn, err := tableHasColumn(conn, "storage_sources", "source_id")
	if err != nil || legacyColumn {
		t.Fatalf("legacy source column remained: present=%v err=%v", legacyColumn, err)
	}

	for _, table := range []string{
		"storage_source_exclude_patterns", "images", "audit_logs",
		"public_mount_redirects", "webdav_locks", "s3_multipart_uploads", "s3_object_etags",
	} {
		var storageSourceID int64
		if err := conn.QueryRow(`SELECT storage_source_id FROM ` + table + ` LIMIT 1`).Scan(&storageSourceID); err != nil {
			t.Fatalf("query upgraded relation %s: %v", table, err)
		}
		if storageSourceID != 7 {
			t.Fatalf("relation %s mapped to %d", table, storageSourceID)
		}
	}
	var legacyPermissionTable int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM sqlite_master
  WHERE type = 'table' AND name = 'user_source_permissions'`).Scan(&legacyPermissionTable); err != nil || legacyPermissionTable != 0 {
		t.Fatalf("legacy direct permission table remained: count=%d err=%v", legacyPermissionTable, err)
	}
	var defaultID int64
	if err := conn.QueryRow(`SELECT default_image_bed_storage_source_id FROM user_preferences WHERE user_id = 1`).Scan(&defaultID); err != nil || defaultID != 7 {
		t.Fatalf("default target mapping: id=%d err=%v", defaultID, err)
	}
	var anonymousID string
	if err := conn.QueryRow(`SELECT value FROM system_settings WHERE key = 'anonymous_image_bed_storage_source_id'`).Scan(&anonymousID); err != nil || anonymousID != "7" {
		t.Fatalf("anonymous target mapping: id=%q err=%v", anonymousID, err)
	}
	var violations int
	rows, err := conn.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatalf("foreign key check: %v", err)
	}
	for rows.Next() {
		violations++
	}
	rows.Close()
	if violations != 0 {
		t.Fatalf("foreign key violations after upgrade: %d", violations)
	}
}

func TestMigrateUpgradesEarlyLegacyDatabaseWithMissingFeatureTables(t *testing.T) {
	conn, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "early-legacy.db")))
	if err != nil {
		t.Fatalf("open early legacy database: %v", err)
	}
	conn.SetMaxOpenConns(1)
	defer conn.Close()
	if _, err := conn.Exec(`
CREATE TABLE users (id INTEGER PRIMARY KEY);
CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME NOT NULL);
CREATE TABLE storage_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT, root_path TEXT NOT NULL, is_disabled BOOLEAN NOT NULL DEFAULT 0,
  public_read_enabled BOOLEAN NOT NULL DEFAULT 0, public_mount_path TEXT UNIQUE,
  webdav_enabled BOOLEAN NOT NULL DEFAULT 1, image_bed_enabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);
INSERT INTO storage_sources VALUES (1, 'early', 'Early Source', '', '/tmp/early', 0, 0, NULL, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`); err != nil {
		t.Fatalf("create early legacy schema: %v", err)
	}
	if err := Migrate(conn); err != nil {
		t.Fatalf("upgrade early legacy schema: %v", err)
	}
	var key string
	if err := conn.QueryRow(`SELECT key FROM storage_sources WHERE id = 1`).Scan(&key); err != nil {
		t.Fatalf("query upgraded source: %v", err)
	}
	if !regexp.MustCompile(`^src-[0-9a-f]{16}$`).MatchString(key) {
		t.Fatalf("unexpected key: %s", key)
	}
}

const legacySourceSchemaFixture = `
CREATE TABLE users (id INTEGER PRIMARY KEY);
CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME NOT NULL);
CREATE TABLE storage_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT, root_path TEXT NOT NULL, is_disabled BOOLEAN NOT NULL DEFAULT 0,
  public_read_enabled BOOLEAN NOT NULL DEFAULT 0, public_mount_path TEXT UNIQUE,
  webdav_enabled BOOLEAN NOT NULL DEFAULT 1, image_bed_enabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);
CREATE TABLE storage_source_exclude_patterns (id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, pattern TEXT NOT NULL, created_at DATETIME NOT NULL);
CREATE TABLE user_source_permissions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, source_id TEXT NOT NULL, permission TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);
CREATE TABLE user_preferences (user_id INTEGER PRIMARY KEY, default_image_bed_source_id TEXT, updated_at DATETIME NOT NULL);
CREATE TABLE images (
  id INTEGER PRIMARY KEY, image_id TEXT NOT NULL UNIQUE, owner_type TEXT NOT NULL, owner_user_id INTEGER,
  source_id TEXT NOT NULL, relative_path TEXT NOT NULL, original_filename TEXT, public_url TEXT NOT NULL,
  size INTEGER NOT NULL, mime_type TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
  ext TEXT NOT NULL, created_at DATETIME NOT NULL
);
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY, actor_type TEXT NOT NULL, actor_user_id INTEGER, entry_type TEXT NOT NULL,
  action TEXT NOT NULL, source_id TEXT, relative_path TEXT, target_relative_path TEXT, ip_address TEXT,
  user_agent TEXT, status TEXT NOT NULL, error_code TEXT, created_at DATETIME NOT NULL
);
CREATE TABLE public_mount_redirects (id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, mount_path TEXT NOT NULL UNIQUE, created_at DATETIME NOT NULL);
CREATE TABLE webdav_locks (
  token TEXT PRIMARY KEY, source_id TEXT NOT NULL, relative_path TEXT NOT NULL, depth TEXT NOT NULL,
  owner_xml TEXT NOT NULL DEFAULT '', owner_user_id INTEGER NOT NULL, created_at DATETIME NOT NULL,
  refreshed_at DATETIME NOT NULL, expires_at DATETIME NOT NULL
);
CREATE TABLE s3_multipart_uploads (
  upload_id TEXT PRIMARY KEY, owner_user_id INTEGER NOT NULL, source_id TEXT NOT NULL,
  object_key TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
);
CREATE TABLE s3_multipart_parts (
  upload_id TEXT NOT NULL, part_number INTEGER NOT NULL, etag TEXT NOT NULL, size INTEGER NOT NULL,
  created_at DATETIME NOT NULL, PRIMARY KEY(upload_id, part_number)
);
CREATE TABLE s3_object_etags (
  source_id TEXT NOT NULL, object_key TEXT NOT NULL, etag TEXT NOT NULL, size INTEGER NOT NULL,
  mtime_unix_nano INTEGER NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(source_id, object_key)
);`

const legacySourceDataFixture = `
INSERT INTO users (id) VALUES (1);
INSERT INTO storage_sources VALUES (7, 'photos', 'Legacy Photos', '', '/tmp/photos', 0, 1, '/photos', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO storage_source_exclude_patterns VALUES (1, 'photos', '**/.git/**', CURRENT_TIMESTAMP);
INSERT INTO user_source_permissions VALUES (1, 1, 'photos', 'read_write', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO user_preferences VALUES (1, 'photos', CURRENT_TIMESTAMP);
INSERT INTO images VALUES (1, 'img_legacy', 'user', 1, 'photos', 'legacy.jpg', 'legacy.jpg', '/i/img_legacy.jpg', 1, 'image/jpeg', 1, 1, 'jpg', CURRENT_TIMESTAMP);
INSERT INTO audit_logs VALUES (1, 'user', 1, 'web', 'upload', 'photos', 'legacy.jpg', NULL, NULL, NULL, 'success', NULL, CURRENT_TIMESTAMP);
INSERT INTO public_mount_redirects VALUES (1, 'photos', '/old-photos', CURRENT_TIMESTAMP);
INSERT INTO webdav_locks VALUES ('urn:uuid:legacy', 'photos', 'legacy.jpg', '0', '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, datetime('now', '+1 hour'));
INSERT INTO s3_multipart_uploads VALUES ('upload-legacy', 1, 'photos', 'legacy.bin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO s3_multipart_parts VALUES ('upload-legacy', 1, 'etag', 1, CURRENT_TIMESTAMP);
INSERT INTO s3_object_etags VALUES ('photos', 'legacy.bin', 'etag', 1, 1, CURRENT_TIMESTAMP);
INSERT INTO system_settings VALUES ('anonymous_image_bed_source_id', 'photos', CURRENT_TIMESTAMP);`
