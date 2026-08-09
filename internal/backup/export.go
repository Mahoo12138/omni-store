// Package backup creates administrator-triggered system configuration packages.
package backup

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/config"
	"gopkg.in/yaml.v3"
	_ "modernc.org/sqlite"
)

// Package is a completed temporary export. Call Cleanup after sending it.
type Package struct {
	Path     string
	Filename string
	Size     int64
}

// Cleanup removes the temporary export file.
func (p *Package) Cleanup() {
	if p != nil && p.Path != "" {
		_ = os.Remove(p.Path)
	}
}

type manifest struct {
	FormatVersion int       `json:"format_version"`
	AppVersion    string    `json:"app_version"`
	ExportedAt    time.Time `json:"exported_at"`
	Sensitive     bool      `json:"sensitive"`
	Contents      []string  `json:"contents"`
	Excluded      []string  `json:"excluded"`
	ResetState    []string  `json:"reset_state"`
}

// CreatePackage writes a consistent SQLite snapshot plus the effective config and key files.
// Real storage source files, cache and temporary uploads are intentionally excluded.
func CreatePackage(ctx context.Context, cfg *config.Config, db *sql.DB, appVersion string, now time.Time) (*Package, error) {
	if cfg == nil || db == nil {
		return nil, fmt.Errorf("导出依赖未初始化")
	}
	now = now.UTC()
	tmpRoot := filepath.Join(cfg.Data.Dir, "tmp")
	if err := os.MkdirAll(tmpRoot, 0o700); err != nil {
		return nil, fmt.Errorf("创建导出临时目录失败: %w", err)
	}
	workDir, err := os.MkdirTemp(tmpRoot, "config-export-")
	if err != nil {
		return nil, fmt.Errorf("创建导出工作目录失败: %w", err)
	}
	defer os.RemoveAll(workDir)

	dbSnapshot := filepath.Join(workDir, "omnistore.db")
	if err := snapshotDatabase(ctx, db, dbSnapshot); err != nil {
		return nil, err
	}

	keyFiles, err := collectKeyFiles(filepath.Join(cfg.Data.Dir, "keys"))
	if err != nil {
		return nil, err
	}
	contents := []string{"manifest.json", "RESTORE.md", "config/effective-config.yaml", "database/omnistore.db"}
	for _, keyFile := range keyFiles {
		contents = append(contents, path.Join("keys", filepath.ToSlash(keyFile.rel)))
	}

	output, err := os.CreateTemp(tmpRoot, "omnistore-config-*.zip")
	if err != nil {
		return nil, fmt.Errorf("创建导出文件失败: %w", err)
	}
	outputPath := output.Name()
	cleanupOutput := true
	defer func() {
		_ = output.Close()
		if cleanupOutput {
			_ = os.Remove(outputPath)
		}
	}()
	if err := output.Chmod(0o600); err != nil {
		return nil, err
	}

	zw := zip.NewWriter(output)
	closeWithError := func(cause error) (*Package, error) {
		_ = zw.Close()
		return nil, cause
	}
	manifestBytes, err := json.MarshalIndent(manifest{
		FormatVersion: 2,
		AppVersion:    appVersion,
		ExportedAt:    now,
		Sensitive:     true,
		Contents:      contents,
		Excluded:      []string{"storage source files", "trash payloads", "cache", "temporary uploads", "logs"},
		ResetState: []string{
			"web_sessions",
			"share_access_sessions",
			"webdav_locks",
			"s3_multipart_uploads",
			"trash_metadata",
		},
	}, "", "  ")
	if err != nil {
		return closeWithError(err)
	}
	manifestBytes = append(manifestBytes, '\n')
	if err := addBytes(zw, "manifest.json", manifestBytes, now); err != nil {
		return closeWithError(err)
	}
	if err := addBytes(zw, "RESTORE.md", []byte(restoreGuide), now); err != nil {
		return closeWithError(err)
	}
	configBytes, err := yaml.Marshal(cfg)
	if err != nil {
		return closeWithError(fmt.Errorf("序列化生效配置失败: %w", err))
	}
	if err := addBytes(zw, "config/effective-config.yaml", configBytes, now); err != nil {
		return closeWithError(err)
	}
	if err := addDiskFile(zw, "database/omnistore.db", dbSnapshot); err != nil {
		return closeWithError(err)
	}
	for _, keyFile := range keyFiles {
		if err := addDiskFile(zw, path.Join("keys", filepath.ToSlash(keyFile.rel)), keyFile.abs); err != nil {
			return closeWithError(err)
		}
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("完成配置包失败: %w", err)
	}
	if err := output.Close(); err != nil {
		return nil, fmt.Errorf("写入配置包失败: %w", err)
	}
	info, err := os.Stat(outputPath)
	if err != nil {
		return nil, err
	}

	cleanupOutput = false
	return &Package{
		Path:     outputPath,
		Filename: "omnistore-system-config-" + now.Format("20060102T150405Z") + ".zip",
		Size:     info.Size(),
	}, nil
}

func snapshotDatabase(ctx context.Context, db *sql.DB, target string) error {
	// SQLite VACUUM INTO produces a transactionally consistent standalone copy.
	quoted := "'" + strings.ReplaceAll(filepath.ToSlash(target), "'", "''") + "'"
	if _, err := db.ExecContext(ctx, "VACUUM INTO "+quoted); err != nil {
		return fmt.Errorf("创建数据库一致性快照失败: %w", err)
	}
	if err := sanitizeSnapshotDatabase(ctx, target); err != nil {
		return fmt.Errorf("清理数据库快照临时状态失败: %w", err)
	}
	return nil
}

func sanitizeSnapshotDatabase(ctx context.Context, target string) error {
	dsn := fmt.Sprintf(
		"file:%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)",
		filepath.ToSlash(target),
	)
	snapshot, err := sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	defer snapshot.Close()
	connection, err := snapshot.Conn(ctx)
	if err != nil {
		return err
	}
	defer connection.Close()
	if _, err := connection.ExecContext(ctx, `PRAGMA secure_delete = ON`); err != nil {
		return err
	}

	tx, err := connection.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	for _, statement := range []string{
		`DELETE FROM sessions`,
		`DELETE FROM share_access_sessions`,
		`DELETE FROM webdav_locks`,
		`DELETE FROM s3_multipart_parts`,
		`DELETE FROM s3_multipart_uploads`,
		`DELETE FROM trash_entries`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	// Compact after deletion so session bearer material is not retained in free pages.
	if _, err := connection.ExecContext(ctx, `VACUUM`); err != nil {
		return err
	}
	rows, err := connection.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		var table, parent string
		var rowID sql.NullInt64
		var foreignKeyID int
		if err := rows.Scan(&table, &rowID, &parent, &foreignKeyID); err != nil {
			return err
		}
		return fmt.Errorf("外键检查失败: table=%s rowid=%v parent=%s foreign_key=%d", table, rowID, parent, foreignKeyID)
	}
	return rows.Err()
}

type keyFile struct {
	rel string
	abs string
}

func collectKeyFiles(root string) ([]keyFile, error) {
	info, err := os.Stat(root)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("读取密钥目录失败: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("密钥路径不是目录")
	}
	files := []keyFile{}
	err = filepath.WalkDir(root, func(filePath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if filePath == root {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		rel, err := filepath.Rel(root, filePath)
		if err != nil {
			return err
		}
		files = append(files, keyFile{rel: rel, abs: filePath})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("收集密钥文件失败: %w", err)
	}
	return files, nil
}

func addBytes(zw *zip.Writer, name string, data []byte, modified time.Time) error {
	header := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: modified}
	header.SetMode(0o600)
	w, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

func addDiskFile(zw *zip.Writer, name, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = name
	header.Method = zip.Deflate
	header.SetMode(0o600)
	w, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, file)
	return err
}

const restoreGuide = `# OmniStore system configuration package

This archive is sensitive. It contains the system database and may contain key material.
It is a restore-safe system configuration snapshot, not a complete file backup.

Contents:
- config/effective-config.yaml: effective infrastructure configuration at export time
- database/omnistore.db: consistent, sanitized SQLite snapshot
- keys/: key material present under the system data directory

Not included:
- files stored in configured storage sources
- trash payloads, cache, temporary uploads and logs

State reset in the snapshot:
- web login sessions and password-protected share access sessions
- WebDAV locks
- incomplete S3 multipart uploads and their part metadata
- trash metadata, because trash payloads are not included

After restoring, users must sign in again and unlock password-protected shares again.
Long-lived WebDAV, image-bed and S3 credentials remain active and must be protected.

Before restoring, stop OmniStore, back up the current installation, review paths in the
effective configuration, and restore the database and keys with owner-only permissions.
Storage source files must be backed up and restored separately.
`
