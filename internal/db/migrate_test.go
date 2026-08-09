package db

import (
	"path/filepath"
	"reflect"
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

func TestOpenAppliesFrozenInitialMigration(t *testing.T) {
	conn, err := Open(filepath.Join(t.TempDir(), "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer conn.Close()

	var version string
	var appliedAt string
	if err := conn.QueryRow(`SELECT version, applied_at FROM schema_migrations`).Scan(&version, &appliedAt); err != nil {
		t.Fatalf("query migration version: %v", err)
	}
	if version != "v1.0.0" || appliedAt == "" {
		t.Fatalf("unexpected migration record: version=%q applied_at=%q", version, appliedAt)
	}
	for _, table := range []string{"users", "storage_sources", "file_records", "images", "audit_logs", "webdav_locks"} {
		var count int
		if err := conn.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&count); err != nil || count != 1 {
			t.Fatalf("table %s count=%d err=%v", table, count, err)
		}
	}
}

func TestMigrateNeverReplaysAppliedVersion(t *testing.T) {
	conn, err := Open(filepath.Join(t.TempDir(), "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer conn.Close()

	var appliedAtBefore string
	if err := conn.QueryRow(`SELECT applied_at FROM schema_migrations WHERE version = 'v1.0.0'`).Scan(&appliedAtBefore); err != nil {
		t.Fatalf("query applied_at: %v", err)
	}
	if _, err := conn.Exec(`DROP TABLE webdav_locks`); err != nil {
		t.Fatalf("drop table to detect replay: %v", err)
	}
	if err := Migrate(conn); err != nil {
		t.Fatalf("repeat Migrate(): %v", err)
	}

	var tableCount int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'webdav_locks'`).Scan(&tableCount); err != nil {
		t.Fatalf("query dropped table: %v", err)
	}
	if tableCount != 0 {
		t.Fatal("applied v1.0.0 migration was replayed")
	}
	var appliedAtAfter string
	if err := conn.QueryRow(`SELECT applied_at FROM schema_migrations WHERE version = 'v1.0.0'`).Scan(&appliedAtAfter); err != nil {
		t.Fatalf("query repeated applied_at: %v", err)
	}
	if appliedAtAfter != appliedAtBefore {
		t.Fatalf("applied_at changed: before=%q after=%q", appliedAtBefore, appliedAtAfter)
	}
}
