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

var migrationFilenamePattern = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.sql$`)

type semanticVersion struct {
	major int
	minor int
	patch int
}

type migrationFile struct {
	name    string
	version semanticVersion
}

// Migrate applies each SemVer migration exactly once and records the version in
// schema_migrations. Applied files are immutable: schema changes must be added
// as a new vMAJOR.MINOR.PATCH.sql file instead of editing or replaying history.
func Migrate(conn *sql.DB) error {
	if _, err := conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL
)`); err != nil {
		return fmt.Errorf("创建 schema_migrations 失败: %w", err)
	}

	applied := map[string]bool{}
	rows, err := conn.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("读取迁移版本失败: %w", err)
	}
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			rows.Close()
			return err
		}
		applied[version] = true
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	files, err := migrationFiles()
	if err != nil {
		return err
	}
	for _, file := range files {
		version := strings.TrimSuffix(file.name, ".sql")
		if applied[version] {
			continue
		}

		sqlBytes, err := migrations.FS.ReadFile(file.name)
		if err != nil {
			return fmt.Errorf("读取迁移 %s 失败: %w", file.name, err)
		}
		tx, err := conn.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("执行迁移 %s 失败: %w", file.name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
			version, time.Now().UTC()); err != nil {
			tx.Rollback()
			return fmt.Errorf("记录迁移版本 %s 失败: %w", version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("提交迁移 %s 失败: %w", file.name, err)
		}
	}
	return nil
}

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
