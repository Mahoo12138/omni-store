// restore.go 实现备份包恢复：校验 → 预检 → 预备份 → 换库/换密钥 → 恢复报告。
// 恢复必须离线执行（服务已停止）：直接替换数据目录内的数据库与密钥文件。
package backup

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"crypto/sha256"
	"encoding/hex"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/migrations"
	_ "modernc.org/sqlite"
)

// RestoreOptions 是恢复输入。
type RestoreOptions struct {
	// BackupPath 是备份包 zip 路径。
	BackupPath string
	// Cfg 是当前实例的配置（决定数据目录与数据库落点；服务器配置文件本身不被备份包覆盖）。
	Cfg *config.Config
	// Force 为 true 时跳过"目标数据目录看起来已在使用"的交互确认（CLI 已自行确认）。
	Force bool
	// Now 供测试注入。
	Now time.Time
}

// SourceRebind 描述恢复后需要管理员人工核验/重绑的存储源。
type SourceRebind struct {
	Key        string `json:"key"`
	Name       string `json:"name"`
	RootPath   string `json:"root_path"`
	RootExists bool   `json:"root_exists"`
}

// Report 是恢复完成后的报告，同时写入 dataDir/restore-report-<ts>.json。
type Report struct {
	FormatVersion        int            `json:"format_version"`
	AppVersionInBackup   string         `json:"app_version_in_backup"`
	RestoredAt           time.Time      `json:"restored_at"`
	DatabaseRestored     bool           `json:"database_restored"`
	PreRestoreBackupDir  string         `json:"pre_restore_backup_dir"`
	KeysRestored         []string       `json:"keys_restored"`
	ConfigNote           string         `json:"config_note"`
	Sources              []SourceRebind `json:"sources"`
	MaxMigrationRestored string         `json:"max_migration_restored"`
	Warnings             []string       `json:"warnings"`
}

// restoreManifest 是恢复端读取的清单（v2 无 checksums，v3 有）。
type restoreManifest struct {
	FormatVersion        int               `json:"format_version"`
	AppVersion           string            `json:"app_version"`
	Contents             []string          `json:"contents"`
	Checksums            map[string]string `json:"checksums,omitempty"`
	DatabaseMaxMigration string            `json:"database_max_migration,omitempty"`
}

const minSupportedFormatVersion = 2
const maxSupportedFormatVersion = 3

// Restore 执行离线恢复。db 必须已经关闭（CLI 在调用前不打开数据库）。
func Restore(ctx context.Context, opts RestoreOptions) (*Report, error) {
	if opts.Cfg == nil {
		return nil, fmt.Errorf("恢复依赖未初始化")
	}
	if opts.Now.IsZero() {
		opts.Now = time.Now().UTC()
	}
	reader, cleanupReader, err := openBackupReader(opts.BackupPath)
	if err != nil {
		return nil, fmt.Errorf("打开备份包失败: %w", err)
	}
	defer cleanupReader()

	manifestFile := findEntry(reader, "manifest.json")
	if manifestFile == nil {
		return nil, fmt.Errorf("备份包缺少 manifest.json")
	}
	rc, err := manifestFile.Open()
	if err != nil {
		return nil, err
	}
	manifestBytes, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		return nil, err
	}
	var backupManifest restoreManifest
	if err := json.Unmarshal(manifestBytes, &backupManifest); err != nil {
		return nil, fmt.Errorf("解析 manifest 失败: %w", err)
	}
	if backupManifest.FormatVersion < minSupportedFormatVersion || backupManifest.FormatVersion > maxSupportedFormatVersion {
		return nil, fmt.Errorf("备份格式版本 %d 不受支持（支持 %d-%d）",
			backupManifest.FormatVersion, minSupportedFormatVersion, maxSupportedFormatVersion)
	}
	report := &Report{
		FormatVersion:      backupManifest.FormatVersion,
		AppVersionInBackup: backupManifest.AppVersion,
		RestoredAt:         opts.Now,
		KeysRestored:       []string{},
		Sources:            []SourceRebind{},
		Warnings:           []string{},
	}
	if backupManifest.FormatVersion < 3 {
		report.Warnings = append(report.Warnings,
			"备份为 v2 格式，无逐条目校验和；恢复前请自行确认备份包来源可信。")
	}

	// 1. 校验和：v3 逐条目 SHA-256。
	if backupManifest.Checksums != nil {
		if err := verifyChecksums(reader, backupManifest.Checksums); err != nil {
			return nil, fmt.Errorf("校验和校验失败，备份包可能被篡改或损坏: %w", err)
		}
	}
	// 2. 内容完整性：manifest.Contents 中声明的条目必须都在包内。
	for _, name := range backupManifest.Contents {
		if name == "manifest.json" {
			continue
		}
		if findEntry(reader, name) == nil {
			return nil, fmt.Errorf("备份包缺少声明条目 %s", name)
		}
	}

	// 3. 配置文件解析检查（只读比对，不覆盖当前配置）。
	if configFile := findEntry(reader, "config/effective-config.yaml"); configFile != nil {
		rc, err := configFile.Open()
		if err != nil {
			return nil, err
		}
		configBytes, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		if err := parseConfigYAML(configBytes); err != nil {
			return nil, fmt.Errorf("备份内配置文件无效: %w", err)
		}
		report.ConfigNote = "服务器配置文件未自动替换；请人工比对备份内 config/effective-config.yaml 与当前配置（监听地址、数据目录、public_url 等）。"
	}

	// 4. 数据库快照校验：integrity_check + foreign_key_check + 迁移版本不超前。
	dbEntry := findEntry(reader, "database/omnistore.db")
	if dbEntry == nil {
		return nil, fmt.Errorf("备份包缺少数据库快照")
	}
	tmpRoot := filepath.Join(opts.Cfg.Data.Dir, "tmp")
	if err := os.MkdirAll(tmpRoot, 0o700); err != nil {
		return nil, fmt.Errorf("创建恢复临时目录失败: %w", err)
	}
	workDir, err := os.MkdirTemp(tmpRoot, "restore-")
	if err != nil {
		return nil, fmt.Errorf("创建恢复工作目录失败: %w", err)
	}
	defer os.RemoveAll(workDir)
	stagingDB := filepath.Join(workDir, "omnistore.db")
	if err := extractTo(reader, "database/omnistore.db", stagingDB); err != nil {
		return nil, err
	}
	if err := validateSnapshotDB(ctx, stagingDB, backupManifest.DatabaseMaxMigration); err != nil {
		return nil, err
	}
	report.MaxMigrationRestored = backupManifest.DatabaseMaxMigration

	// 5. 预恢复备份当前数据库与密钥（可回退）。
	preRestoreDir := filepath.Join(opts.Cfg.Data.Dir, "pre-restore-"+opts.Now.Format("20060102T150405Z"))
	if err := os.MkdirAll(preRestoreDir, 0o700); err != nil {
		return nil, err
	}
	for _, name := range []string{opts.Cfg.DatabasePath(), opts.Cfg.DatabasePath() + "-wal", opts.Cfg.DatabasePath() + "-shm"} {
		if _, err := os.Stat(name); err == nil {
			if err := copyFile(filepath.Join(preRestoreDir, filepath.Base(name)+".bak"), name); err != nil {
				return nil, fmt.Errorf("备份当前数据库失败: %w", err)
			}
		}
	}
	report.PreRestoreBackupDir = preRestoreDir

	// 6. 换库：移除目标 -wal/-shm，替换主库文件。
	for _, suffix := range []string{"-wal", "-shm"} {
		_ = os.Remove(opts.Cfg.DatabasePath() + suffix)
	}
	if err := copyFile(opts.Cfg.DatabasePath(), stagingDB); err != nil {
		return nil, fmt.Errorf("替换数据库失败: %w", err)
	}
	if err := os.Chmod(opts.Cfg.DatabasePath(), 0o600); err != nil {
		return nil, err
	}
	report.DatabaseRestored = true

	// 7. 密钥：同名覆盖，不删除现有其他密钥。
	keysDir := filepath.Join(opts.Cfg.Data.Dir, "keys")
	for _, entry := range reader.File {
		if !strings.HasPrefix(entry.Name, "keys/") || entry.Name == "keys/" {
			continue
		}
		rel := strings.TrimPrefix(entry.Name, "keys/")
		if strings.HasSuffix(rel, "/") || strings.Contains(rel, "..") {
			continue
		}
		target := filepath.Join(keysDir, filepath.FromSlash(rel))
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(keysDir)) {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return nil, err
		}
		if err := extractTo(reader, entry.Name, target); err != nil {
			return nil, err
		}
		if err := os.Chmod(target, 0o600); err != nil {
			return nil, err
		}
		report.KeysRestored = append(report.KeysRestored, rel)
	}

	// 8. 恢复报告：存储源 rebind 核对（root 在本机是否存在）+ 警告。
	sources, err := readSourceRoots(ctx, opts.Cfg.DatabasePath())
	if err != nil {
		return nil, err
	}
	for _, src := range sources {
		_, err := os.Stat(src.rootPath)
		onDisk := err == nil
		if !onDisk {
			report.Warnings = append(report.Warnings,
				fmt.Sprintf("存储源 %s（%s）的根目录在本机不存在：%s —— 请通过管理界面重新绑定根路径后校准台账", src.name, src.key, src.rootPath))
		}
		report.Sources = append(report.Sources, SourceRebind{
			Key: src.key, Name: src.name, RootPath: src.rootPath, RootExists: onDisk,
		})
	}
	report.Warnings = append(report.Warnings,
		"静态资源/流转等能力绑定随数据库恢复；请核对绑定指向的存储源与发布根是否仍然有效。",
		"启动服务后建议运行存储源台账校准与运维中心完整性检查。")

	reportBytes, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return nil, err
	}
	reportPath := filepath.Join(opts.Cfg.Data.Dir, fmt.Sprintf("restore-report-%s.json", opts.Now.Format("20060102T150405Z")))
	if err := os.WriteFile(reportPath, reportBytes, 0o600); err != nil {
		return nil, err
	}
	return report, nil
}

// openBackupReader 打开备份 zip；返回关闭函数。
func openBackupReader(path string) (*zip.Reader, func(), error) {
	archive, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	info, err := archive.Stat()
	if err != nil {
		archive.Close()
		return nil, nil, err
	}
	reader, err := zip.NewReader(archive, info.Size())
	if err != nil {
		archive.Close()
		return nil, nil, fmt.Errorf("备份包不是有效的 zip: %w", err)
	}
	return reader, func() { _ = archive.Close() }, nil
}

func findEntry(reader *zip.Reader, name string) *zip.File {
	for _, entry := range reader.File {
		if entry.Name == name {
			return entry
		}
	}
	return nil
}

// verifyChecksums 校验包内每个声明条目的 SHA-256。
func verifyChecksums(reader *zip.Reader, checksums map[string]string) error {
	if len(checksums) == 0 {
		return nil
	}
	seen := map[string]bool{}
	for _, entry := range reader.File {
		digest, declared := checksums[entry.Name]
		if !declared {
			continue
		}
		seen[entry.Name] = true
		rc, err := entry.Open()
		if err != nil {
			return err
		}
		hasher := sha256.New()
		if _, err := io.Copy(hasher, rc); err != nil {
			rc.Close()
			return err
		}
		rc.Close()
		if hex.EncodeToString(hasher.Sum(nil)) != digest {
			return fmt.Errorf("条目 %s 校验和不匹配", entry.Name)
		}
	}
	for name := range checksums {
		if !seen[name] {
			return fmt.Errorf("清单声明的条目 %s 不在包内", name)
		}
	}
	return nil
}

func extractTo(reader *zip.Reader, name, target string) error {
	entry := findEntry(reader, name)
	if entry == nil {
		return fmt.Errorf("备份包缺少条目 %s", name)
	}
	rc, err := entry.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, rc)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func copyFile(target, source string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func validateSnapshotDB(ctx context.Context, path, maxMigration string) error {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", filepath.ToSlash(path))
	snapshot, err := sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	defer snapshot.Close()
	var quickCheck string
	if err := snapshot.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&quickCheck); err != nil {
		return err
	}
	if quickCheck != "ok" {
		return fmt.Errorf("快照完整性检查未通过: %s", quickCheck)
	}
	rows, err := snapshot.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return err
	}
	violations := 0
	for rows.Next() {
		violations++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if violations > 0 {
		return fmt.Errorf("快照存在 %d 处外键悬空", violations)
	}
	// 迁移版本不超前：快照里的每个版本都必须被当前二进制认识。
	known, err := knownMigrations()
	if err != nil {
		return err
	}
	rows, err = snapshot.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return err
		}
		if !known[version] {
			return fmt.Errorf("快照包含当前二进制不认识的迁移版本 %s：请先升级 OmniStore 再恢复", version)
		}
	}
	if maxMigration != "" && !known[maxMigration] {
		return fmt.Errorf("快照最高迁移版本 %s 超出当前二进制", maxMigration)
	}
	return rows.Err()
}

type sourceRootRow struct {
	key      string
	name     string
	rootPath string
}

func readSourceRoots(ctx context.Context, dbPath string) ([]sourceRootRow, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", filepath.ToSlash(dbPath))
	snapshot, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	defer snapshot.Close()
	rows, err := snapshot.QueryContext(ctx, `SELECT key, name, root_path FROM storage_sources ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sourceRootRow{}
	for rows.Next() {
		var row sourceRootRow
		if err := rows.Scan(&row.key, &row.name, &row.rootPath); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func parseConfigYAML(data []byte) error {
	_, err := config.ParseYAML(data)
	return err
}

// knownMigrations 列出当前二进制内嵌的全部迁移版本。
func knownMigrations() (map[string]bool, error) {
	entries, err := migrations.FS.ReadDir(".")
	if err != nil {
		return nil, err
	}
	out := map[string]bool{}
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".sql") {
			out[strings.TrimSuffix(entry.Name(), ".sql")] = true
		}
	}
	return out, nil
}
