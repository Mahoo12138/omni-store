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
