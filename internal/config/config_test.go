package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestUploadCleanupDefaults(t *testing.T) {
	cfg := Default()
	if !cfg.Upload.CleanupStaleFiles || cfg.Upload.TempFileMaxAgeHours != 24 {
		t.Fatalf("unexpected cleanup defaults: %+v", cfg.Upload)
	}
}

func TestUploadCleanupEnvironmentOverridesYAML(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
data:
  dir: ./test-data
upload:
  cleanup_stale_files: false
  temp_file_max_age_hours: 72
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("OMNISTORE_UPLOAD_CLEANUP_STALE_FILES", "true")
	t.Setenv("OMNISTORE_UPLOAD_TEMP_FILE_MAX_AGE_HOURS", "36")

	cfg, err := Load(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if !cfg.Upload.CleanupStaleFiles || cfg.Upload.TempFileMaxAgeHours != 36 {
		t.Fatalf("environment did not override YAML: %+v", cfg.Upload)
	}
}

func TestS3EnvironmentOverrides(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
data:
  dir: ./test-data
server:
  s3_addr: 127.0.0.1:9000
  s3_enabled: false
security:
  master_key: must-not-load-from-yaml
`), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OMNISTORE_S3_ADDR", "127.0.0.1:19001")
	t.Setenv("OMNISTORE_S3_ENABLED", "true")
	t.Setenv("OMNISTORE_MASTER_KEY", "01234567890123456789012345678901")
	t.Setenv("OMNISTORE_BOOTSTRAP_TOKEN", "one-time-bootstrap-token")
	cfg, err := Load(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Server.S3Enabled || cfg.Server.S3Addr != "127.0.0.1:19001" {
		t.Fatalf("unexpected S3 config: %+v", cfg.Server)
	}
	if cfg.Security.MasterKey != "01234567890123456789012345678901" {
		t.Fatal("master key environment override missing")
	}
	if cfg.Security.BootstrapToken != "one-time-bootstrap-token" {
		t.Fatal("bootstrap token environment override missing")
	}
}
