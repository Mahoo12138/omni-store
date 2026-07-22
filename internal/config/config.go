// Package config 实现 OmniStore 配置加载。
// 优先级从低到高：程序默认值 < YAML 配置文件 < 环境变量。
// 不支持热加载，修改后需重启服务。
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config 是 OmniStore 的基础设施配置。
// YAML / 环境变量只管基础设施；产品运行状态存 SQLite。
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Data     DataConfig     `yaml:"data"`
	Database DatabaseConfig `yaml:"database"`
	Security SecurityConfig `yaml:"security"`
	Upload   UploadConfig   `yaml:"upload"`
	ImageBed ImageBedConfig `yaml:"image_bed"`
	Audit    AuditConfig    `yaml:"audit"`
	Log      LogConfig      `yaml:"log"`
}

type ServerConfig struct {
	HTTPAddr       string   `yaml:"http_addr"`
	PublicURL      string   `yaml:"public_url"`
	TrustedProxies []string `yaml:"trusted_proxies"`
	S3Addr         string   `yaml:"s3_addr"`
	S3Enabled      bool     `yaml:"s3_enabled"`
}

type DataConfig struct {
	Dir string `yaml:"dir"`
}

type DatabaseConfig struct {
	// Path 为空时使用 data.dir/omnistore.db
	Path string `yaml:"path"`
}

type SecurityConfig struct {
	CookieSecure    bool `yaml:"cookie_secure"`
	SessionTTLHours int  `yaml:"session_ttl_hours"`
}

type UploadConfig struct {
	MaxFileSizeMB       int64 `yaml:"max_file_size_mb"`
	CleanupStaleFiles   bool  `yaml:"cleanup_stale_files"`
	TempFileMaxAgeHours int   `yaml:"temp_file_max_age_hours"`
}

type ImageBedConfig struct {
	RootPath               string             `yaml:"root_path"`
	UserMaxFileSizeMB      int64              `yaml:"user_max_file_size_mb"`
	AnonymousMaxFileSizeMB int64              `yaml:"anonymous_max_file_size_mb"`
	AnonymousRateLimit     AnonymousRateLimit `yaml:"anonymous_rate_limit"`
}

type AnonymousRateLimit struct {
	Enabled      bool `yaml:"enabled"`
	PerIPPerHour int  `yaml:"per_ip_per_hour"`
}

type AuditConfig struct {
	Enabled bool `yaml:"enabled"`
	// MaxEntries = 0 表示不限制
	MaxEntries int `yaml:"max_entries"`
}

type LogConfig struct {
	Level string `yaml:"level"`
}

// Default 返回程序内置默认值。
func Default() *Config {
	return &Config{
		Server: ServerConfig{
			HTTPAddr:       "0.0.0.0:8080",
			PublicURL:      "http://localhost:8080",
			TrustedProxies: []string{"127.0.0.1"},
			S3Addr:         "0.0.0.0:8081",
			S3Enabled:      false,
		},
		Data: DataConfig{
			Dir: "./data",
		},
		Security: SecurityConfig{
			CookieSecure:    false,
			SessionTTLHours: 168,
		},
		Upload: UploadConfig{
			MaxFileSizeMB:       1024,
			CleanupStaleFiles:   true,
			TempFileMaxAgeHours: 24,
		},
		ImageBed: ImageBedConfig{
			RootPath:               "/images",
			UserMaxFileSizeMB:      20,
			AnonymousMaxFileSizeMB: 10,
			AnonymousRateLimit: AnonymousRateLimit{
				Enabled:      true,
				PerIPPerHour: 60,
			},
		},
		Audit: AuditConfig{
			Enabled:    true,
			MaxEntries: 10000,
		},
		Log: LogConfig{
			Level: "info",
		},
	}
}

// Load 按优先级加载配置：默认值 -> YAML -> 环境变量。
// configFile 为空时按 OMNISTORE_CONFIG_FILE 环境变量，再回退 ./config.yaml。
func Load(configFile string) (*Config, error) {
	cfg := Default()

	if configFile == "" {
		configFile = os.Getenv("OMNISTORE_CONFIG_FILE")
	}
	explicit := configFile != ""
	if configFile == "" {
		configFile = "./config.yaml"
	}

	data, err := os.ReadFile(configFile)
	switch {
	case err == nil:
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("解析配置文件 %s 失败: %w", configFile, err)
		}
	case os.IsNotExist(err) && !explicit:
		// 默认路径不存在时静默使用默认值
	default:
		return nil, fmt.Errorf("读取配置文件 %s 失败: %w", configFile, err)
	}

	applyEnvOverrides(cfg)

	if err := cfg.normalize(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	setStr := func(key string, dst *string) {
		if v, ok := os.LookupEnv(key); ok {
			*dst = v
		}
	}
	setBool := func(key string, dst *bool) {
		if v, ok := os.LookupEnv(key); ok {
			if b, err := strconv.ParseBool(v); err == nil {
				*dst = b
			}
		}
	}
	setInt := func(key string, dst *int) {
		if v, ok := os.LookupEnv(key); ok {
			if n, err := strconv.Atoi(v); err == nil {
				*dst = n
			}
		}
	}
	setInt64 := func(key string, dst *int64) {
		if v, ok := os.LookupEnv(key); ok {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil {
				*dst = n
			}
		}
	}

	setStr("OMNISTORE_DATA_DIR", &cfg.Data.Dir)
	setStr("OMNISTORE_HTTP_ADDR", &cfg.Server.HTTPAddr)
	setStr("OMNISTORE_PUBLIC_URL", &cfg.Server.PublicURL)
	setStr("OMNISTORE_DATABASE_PATH", &cfg.Database.Path)
	setBool("OMNISTORE_COOKIE_SECURE", &cfg.Security.CookieSecure)
	setInt("OMNISTORE_SESSION_TTL_HOURS", &cfg.Security.SessionTTLHours)
	setInt64("OMNISTORE_UPLOAD_MAX_FILE_SIZE_MB", &cfg.Upload.MaxFileSizeMB)
	setBool("OMNISTORE_UPLOAD_CLEANUP_STALE_FILES", &cfg.Upload.CleanupStaleFiles)
	setInt("OMNISTORE_UPLOAD_TEMP_FILE_MAX_AGE_HOURS", &cfg.Upload.TempFileMaxAgeHours)
	setStr("OMNISTORE_IMAGE_BED_ROOT_PATH", &cfg.ImageBed.RootPath)
	setInt64("OMNISTORE_IMAGE_BED_USER_MAX_FILE_SIZE_MB", &cfg.ImageBed.UserMaxFileSizeMB)
	setInt64("OMNISTORE_IMAGE_BED_ANONYMOUS_MAX_FILE_SIZE_MB", &cfg.ImageBed.AnonymousMaxFileSizeMB)
	setStr("OMNISTORE_LOG_LEVEL", &cfg.Log.Level)

	if v, ok := os.LookupEnv("OMNISTORE_TRUSTED_PROXIES"); ok {
		parts := strings.Split(v, ",")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if p = strings.TrimSpace(p); p != "" {
				out = append(out, p)
			}
		}
		cfg.Server.TrustedProxies = out
	}
}

func (c *Config) normalize() error {
	if c.Data.Dir == "" {
		return fmt.Errorf("data.dir 不能为空")
	}
	abs, err := filepath.Abs(c.Data.Dir)
	if err != nil {
		return fmt.Errorf("解析 data.dir 失败: %w", err)
	}
	c.Data.Dir = abs

	if c.Database.Path == "" {
		c.Database.Path = filepath.Join(c.Data.Dir, "omnistore.db")
	}
	if c.Security.SessionTTLHours <= 0 {
		c.Security.SessionTTLHours = 168
	}
	if c.Upload.MaxFileSizeMB <= 0 {
		c.Upload.MaxFileSizeMB = 1024
	}
	if c.Upload.TempFileMaxAgeHours <= 0 {
		c.Upload.TempFileMaxAgeHours = 24
	}
	c.Server.PublicURL = strings.TrimRight(c.Server.PublicURL, "/")
	return nil
}

// DatabasePath 返回 SQLite 数据库文件路径。
func (c *Config) DatabasePath() string {
	return c.Database.Path
}
