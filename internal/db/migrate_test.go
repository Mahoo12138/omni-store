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
