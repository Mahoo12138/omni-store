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
		if applied[version] {
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
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
			version, time.Now().UTC()); err != nil {
			tx.Rollback()
			return fmt.Errorf("记录迁移版本 %s 失败: %w", version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("提交迁移 %s 失败: %w", name, err)
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
