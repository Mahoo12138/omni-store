package backup

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	_ "modernc.org/sqlite"
)

func TestCreatePackageIncludesSnapshotConfigAndKeys(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	if _, err := conn.Exec(`INSERT INTO system_settings (key, value, updated_at) VALUES ('demo', 'enabled', CURRENT_TIMESTAMP)`); err != nil {
		t.Fatalf("seed database: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "keys"), 0o700); err != nil {
		t.Fatalf("create key directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "keys", "master.key"), []byte("test-key-material"), 0o600); err != nil {
		t.Fatalf("write key: %v", err)
	}

	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	now := time.Date(2026, 8, 4, 12, 30, 0, 0, time.UTC)
	pkg, err := CreatePackage(context.Background(), cfg, conn, "test-version", now)
	if err != nil {
		t.Fatalf("create package: %v", err)
	}
	t.Cleanup(pkg.Cleanup)
	if pkg.Filename != "omnistore-system-config-20260804T123000Z.zip" || pkg.Size == 0 {
		t.Fatalf("unexpected package: %+v", pkg)
	}

	zr, err := zip.OpenReader(pkg.Path)
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	defer zr.Close()
	entries := map[string]*zip.File{}
	for _, file := range zr.File {
		entries[file.Name] = file
	}
	for _, name := range []string{
		"manifest.json", "RESTORE.md", "config/effective-config.yaml",
		"database/omnistore.db", "keys/master.key",
	} {
		if entries[name] == nil {
			t.Fatalf("missing archive entry %s", name)
		}
	}

	manifestFile, err := entries["manifest.json"].Open()
	if err != nil {
		t.Fatalf("open manifest: %v", err)
	}
	manifestBytes, _ := io.ReadAll(manifestFile)
	_ = manifestFile.Close()
	var m manifest
	if err := json.Unmarshal(manifestBytes, &m); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if m.AppVersion != "test-version" || !m.Sensitive || m.FormatVersion != 1 {
		t.Fatalf("unexpected manifest: %+v", m)
	}

	snapshotPath := filepath.Join(t.TempDir(), "snapshot.db")
	snapshotFile, err := entries["database/omnistore.db"].Open()
	if err != nil {
		t.Fatalf("open snapshot: %v", err)
	}
	out, err := os.Create(snapshotPath)
	if err != nil {
		t.Fatalf("create snapshot target: %v", err)
	}
	if _, err := io.Copy(out, snapshotFile); err != nil {
		t.Fatalf("copy snapshot: %v", err)
	}
	_ = out.Close()
	_ = snapshotFile.Close()
	snapshotDB, err := sql.Open("sqlite", snapshotPath)
	if err != nil {
		t.Fatalf("open snapshot database: %v", err)
	}
	defer snapshotDB.Close()
	var value string
	if err := snapshotDB.QueryRow(`SELECT value FROM system_settings WHERE key = 'demo'`).Scan(&value); err != nil || value != "enabled" {
		t.Fatalf("snapshot missing seeded data: value=%q err=%v", value, err)
	}
}

func TestCreatePackageSkipsSymlinkedKeys(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	if err := os.MkdirAll(filepath.Join(dataDir, "keys"), 0o700); err != nil {
		t.Fatalf("create key directory: %v", err)
	}
	outside := filepath.Join(t.TempDir(), "outside.key")
	if err := os.WriteFile(outside, []byte("must-not-export"), 0o600); err != nil {
		t.Fatalf("write outside key: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(dataDir, "keys", "linked.key")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	pkg, err := CreatePackage(context.Background(), cfg, conn, "test", time.Now())
	if err != nil {
		t.Fatalf("create package: %v", err)
	}
	t.Cleanup(pkg.Cleanup)
	zr, err := zip.OpenReader(pkg.Path)
	if err != nil {
		t.Fatalf("open package: %v", err)
	}
	defer zr.Close()
	for _, file := range zr.File {
		if file.Name == "keys/linked.key" {
			t.Fatal("symlinked key was exported")
		}
	}
}
