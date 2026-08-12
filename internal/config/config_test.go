package config

import (
	"os"
	"path/filepath"
	"testing"
)

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

func TestLoginRateLimitDefaultsAndEnvironmentOverrides(t *testing.T) {
	defaults := Default().Security.LoginRateLimit
	if !defaults.Enabled || defaults.WindowMinutes != 15 || defaults.MaxFailuresPerIP != 50 || defaults.MaxFailuresPerUsername != 10 {
		t.Fatalf("unexpected login rate-limit defaults: %+v", defaults)
	}

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
data:
  dir: ./test-data
security:
  login_rate_limit:
    enabled: false
    window_minutes: 30
    max_failures_per_ip: 80
    max_failures_per_username: 20
`), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OMNISTORE_LOGIN_RATE_LIMIT_ENABLED", "true")
	t.Setenv("OMNISTORE_LOGIN_RATE_LIMIT_WINDOW_MINUTES", "5")
	t.Setenv("OMNISTORE_LOGIN_RATE_LIMIT_MAX_FAILURES_PER_IP", "25")
	t.Setenv("OMNISTORE_LOGIN_RATE_LIMIT_MAX_FAILURES_PER_USERNAME", "6")
	cfg, err := Load(configPath)
	if err != nil {
		t.Fatal(err)
	}
	got := cfg.Security.LoginRateLimit
	if !got.Enabled || got.WindowMinutes != 5 || got.MaxFailuresPerIP != 25 || got.MaxFailuresPerUsername != 6 {
		t.Fatalf("environment did not override login rate limit: %+v", got)
	}
}
