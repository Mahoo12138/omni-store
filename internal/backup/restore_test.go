package backup

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
)

func newRestoreEnv(t *testing.T) (*config.Config, *sql.DB, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	cfg.Server.PublicURL = "https://restore.test"
	return cfg, conn, base
}

func exportForRestore(t *testing.T, cfg *config.Config, conn *sql.DB) string {
	t.Helper()
	pkg, err := CreatePackage(context.Background(), cfg, conn, "2.0.0-test", testNow())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pkg.Cleanup)
	return pkg.Path
}

func testNow() time.Time { return time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC) }

func TestRestoreRoundTrip(t *testing.T) {
	cfg, conn, base := newRestoreEnv(t)
	// 写入一些状态：源 + 用户，让快照非空。
	if _, err := conn.Exec(`INSERT INTO users (user_public_id, username, display_name, password_hash, role, created_at, updated_at)
  VALUES ('pub-x', 'restore-user', 'Restore User', 'hash', 'user', datetime('now'), datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO storage_sources (key, name, root_path, created_at, updated_at)
  VALUES ('src-restore', 'Restore Source', ?, datetime('now'), datetime('now'))`,
		filepath.Join(base, "source")); err != nil {
		t.Fatal(err)
	}
	backupPath := exportForRestore(t, cfg, conn)
	_ = conn.Close()

	// 恢复到全新的数据目录（模拟迁移到新机器）。
	restoreBase := t.TempDir()
	restoreCfg := config.Default()
	restoreCfg.Data.Dir = filepath.Join(restoreBase, "data")
	restoreCfg.Database.Path = filepath.Join(restoreBase, "data", "omnistore.db")
	if err := os.MkdirAll(restoreCfg.Data.Dir, 0o700); err != nil {
		t.Fatal(err)
	}

	report, err := Restore(context.Background(), RestoreOptions{
		BackupPath: backupPath,
		Cfg:        restoreCfg,
		Now:        testNow(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !report.DatabaseRestored || report.FormatVersion != 3 {
		t.Fatalf("report=%+v", report)
	}
	if report.PreRestoreBackupDir == "" {
		t.Fatal("pre-restore backup dir missing")
	}

	// 恢复后的数据库包含源记录；根路径在新机器上不存在 → 需要 rebind。
	if len(report.Sources) != 1 || report.Sources[0].Key != "src-restore" {
		t.Fatalf("sources=%+v", report.Sources)
	}
	if report.Sources[0].RootExists {
		t.Fatal("root should not exist on a fresh machine")
	}
	foundRebindWarning := false
	for _, warning := range report.Warnings {
		if strings.Contains(warning, "重新绑定") {
			foundRebindWarning = true
		}
	}
	if !foundRebindWarning {
		t.Fatalf("rebind warning missing: %+v", report.Warnings)
	}

	// 恢复后的数据库可打开且用户在。
	restored, err := db.Open(restoreCfg.DatabasePath())
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	var count int
	if err := restored.QueryRow(`SELECT COUNT(*) FROM users WHERE username = 'restore-user'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("restored user count=%d err=%v", count, err)
	}
}

// repackZip 重写备份包；mutate 返回替换数据与是否保留条目。
func repackZip(t *testing.T, source string, mutate func(name string, data []byte) ([]byte, bool)) string {
	t.Helper()
	raw := mustRead(t, source)
	reader, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "repacked.zip")
	handle, err := os.Create(out)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(handle)
	for _, entry := range reader.File {
		inner, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(inner)
		inner.Close()
		if err != nil {
			t.Fatal(err)
		}
		data, keep := mutate(entry.Name, data)
		if !keep {
			continue
		}
		header := entry.FileHeader
		w, err := writer.CreateHeader(&header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := handle.Close(); err != nil {
		t.Fatal(err)
	}
	return out
}

func manifestOf(t *testing.T, backupPath string) map[string]any {
	t.Helper()
	raw := mustRead(t, backupPath)
	reader, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	manifestFile := findEntry(reader, "manifest.json")
	if manifestFile == nil {
		t.Fatal("manifest missing")
	}
	rc, err := manifestFile.Open()
	if err != nil {
		t.Fatal(err)
	}
	defer rc.Close()
	var manifest map[string]any
	if err := json.Unmarshal(mustReadFrom(rc), &manifest); err != nil {
		t.Fatal(err)
	}
	return manifest
}

func mustReadFrom(rc io.Reader) []byte {
	data, err := io.ReadAll(rc)
	if err != nil {
		panic(err)
	}
	return data
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestRestoreRejectsTamperedBackup(t *testing.T) {
	cfg, conn, _ := newRestoreEnv(t)
	backupPath := exportForRestore(t, cfg, conn)
	_ = conn.Close()

	tampered := repackZip(t, backupPath, func(name string, data []byte) ([]byte, bool) {
		if name == "database/omnistore.db" {
			data[len(data)/2] ^= 0xFF
		}
		return data, true
	})

	_, err := Restore(context.Background(), RestoreOptions{BackupPath: tampered, Cfg: cfg})
	if err == nil || !strings.Contains(err.Error(), "校验和") {
		t.Fatalf("tampered restore error=%v, want checksum failure", err)
	}
}

func TestRestoreAcceptsV2ManifestWithoutChecksums(t *testing.T) {
	cfg, conn, _ := newRestoreEnv(t)
	backupPath := exportForRestore(t, cfg, conn)
	_ = conn.Close()

	v2 := repackZip(t, backupPath, func(name string, data []byte) ([]byte, bool) {
		if name != "manifest.json" {
			return data, true
		}
		var manifest map[string]any
		if err := json.Unmarshal(data, &manifest); err != nil {
			t.Fatal(err)
		}
		manifest["format_version"] = 2
		delete(manifest, "checksums")
		delete(manifest, "database_max_migration")
		out, err := json.MarshalIndent(manifest, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		return out, true
	})

	restoreBase := t.TempDir()
	restoreCfg := config.Default()
	restoreCfg.Data.Dir = filepath.Join(restoreBase, "data")
	restoreCfg.Database.Path = filepath.Join(restoreBase, "data", "omnistore.db")
	if err := os.MkdirAll(restoreCfg.Data.Dir, 0o700); err != nil {
		t.Fatal(err)
	}
	report, err := Restore(context.Background(), RestoreOptions{BackupPath: v2, Cfg: restoreCfg, Now: testNow()})
	if err != nil {
		t.Fatal(err)
	}
	if report.FormatVersion != 2 {
		t.Fatalf("format=%d", report.FormatVersion)
	}
	foundWarning := false
	for _, warning := range report.Warnings {
		if strings.Contains(warning, "v2") {
			foundWarning = true
		}
	}
	if !foundWarning {
		t.Fatalf("v2 warning missing: %+v", report.Warnings)
	}
}

func TestRestoreRejectsNewerMigrationThanBinary(t *testing.T) {
	cfg, conn, _ := newRestoreEnv(t)
	backupPath := exportForRestore(t, cfg, conn)
	_ = conn.Close()

	// 提取快照塞入未来版本号，再降级 manifest 为 v2（绕过校验和）后重打包。
	workDir := t.TempDir()
	repacked := repackZip(t, backupPath, func(name string, data []byte) ([]byte, bool) {
		if name == "database/omnistore.db" {
			return data, true
		}
		return data, true
	})
	raw := mustRead(t, repacked)
	reader, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	staging := filepath.Join(workDir, "snapshot.db")
	if err := extractTo(reader, "database/omnistore.db", staging); err != nil {
		t.Fatal(err)
	}
	snapshot, err := sql.Open("sqlite", "file:"+filepath.ToSlash(staging)+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := snapshot.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES ('v99.99.99', datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	snapshot.Close()

	future := repackZip(t, repacked, func(name string, data []byte) ([]byte, bool) {
		if name == "database/omnistore.db" {
			return mustRead(t, staging), true
		}
		if name == "manifest.json" {
			var manifest map[string]any
			if err := json.Unmarshal(data, &manifest); err != nil {
				t.Fatal(err)
			}
			manifest["format_version"] = 2
			delete(manifest, "checksums")
			out, err := json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			return out, true
		}
		return data, true
	})

	_, err = Restore(context.Background(), RestoreOptions{BackupPath: future, Cfg: cfg})
	if err == nil || !strings.Contains(err.Error(), "v99.99.99") {
		t.Fatalf("future migration error=%v", err)
	}
}
