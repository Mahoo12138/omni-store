package staticassets

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

func newStaticTestService(t *testing.T) (*Service, *sources.Service, *files.Service, *models.StorageSource, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	sourceService := sources.NewService(conn, dataDir)
	root := filepath.Join(base, "source")
	if err := os.MkdirAll(filepath.Join(root, "blog-assets", "posts"), 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := sourceService.Create(sources.CreateInput{Name: "Blog", RootPath: root, ImportExisting: true})
	if err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	return NewService(conn, sourceService, fileService, "https://files.example.test"), sourceService, fileService, source, root
}

func configureDefault(t *testing.T, service *Service, sourceKey string) *Config {
	t.Helper()
	cfg, err := service.Configure(ConfigureInput{
		SourceKey:   sourceKey,
		PublishRoot: "blog-assets",
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestConfigureLifecycle(t *testing.T) {
	service, _, _, source, _ := newStaticTestService(t)

	// 首次配置：生成 ast- 前缀标识与 baseUrl。
	cfg := configureDefault(t, service, source.Key)
	if !strings.HasPrefix(cfg.PublicAssetID, "ast-") || len(cfg.PublicAssetID) != len("ast-")+32 {
		t.Fatalf("asset id = %q", cfg.PublicAssetID)
	}
	if cfg.BaseURL != "https://files.example.test/assets/"+cfg.PublicAssetID+"/" {
		t.Fatalf("base url = %q", cfg.BaseURL)
	}
	if cfg.CacheMode != CacheShort || cfg.CorsMode != CorsPublic {
		t.Fatalf("defaults: %+v", cfg)
	}

	// 重复 Configure 拒绝；更换发布空间必须走 rebind。
	if _, err := service.Configure(ConfigureInput{SourceKey: source.Key, PublishRoot: "other"}, nil, nil); !errors.Is(err, ErrAlreadyConfigured) {
		t.Fatalf("re-configure error=%v", err)
	}
	if _, err := service.Update(UpdateInput{CacheMode: &[]string{CacheLong}[0]}); err != nil {
		t.Fatalf("plain update: %v", err)
	}
	updated, err := service.Config()
	if err != nil || updated.CacheMode != CacheLong {
		t.Fatalf("update result=%+v err=%v", updated, err)
	}
	if updated.PublicAssetID != cfg.PublicAssetID {
		t.Fatal("plain update must keep the asset id")
	}

	// 乐观并发：相同 revision 只有一个成功。
	stale := updated.Revision
	if _, err := service.Update(UpdateInput{CacheMode: &[]string{CacheNoCache}[0]}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Update(UpdateInput{ExpectedRevision: &stale}); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("stale revision error=%v", err)
	}
}

func TestUpdateRejectsSilentSpaceChange(t *testing.T) {
	service, sourceService, _, source, firstRoot := newStaticTestService(t)
	configureDefault(t, service, source.Key)

	otherRoot := filepath.Join(filepath.Dir(firstRoot), "second")
	if err := os.MkdirAll(filepath.Join(otherRoot, "blog-assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	other, err := sourceService.Create(sources.CreateInput{Name: "Second", RootPath: otherRoot, ImportExisting: true})
	if err != nil {
		t.Fatal(err)
	}

	// 普通 PUT 不允许携带 source/publish_root 变更：静态配置 API 根本不接受这些
	// 字段；这里验证 rebind 的模式约束与 reset/relocate 语义。
	if _, err := service.Rebind(RebindInput{
		SourceKey: other.Key, PublishRoot: "blog-assets", Mode: "replace",
	}, nil, nil); !errors.Is(err, ErrRebindModeInvalid) {
		t.Fatalf("invalid mode error=%v", err)
	}
	if _, err := service.Rebind(RebindInput{
		SourceKey: other.Key, PublishRoot: "blog-assets", Mode: "relocate",
	}, nil, nil); !errors.Is(err, ErrRelocateUnconfirmed) {
		t.Fatalf("unconfirmed relocate error=%v", err)
	}

	resetCfg, err := service.Rebind(RebindInput{
		SourceKey: other.Key, PublishRoot: "blog-assets", Mode: "reset",
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if resetCfg.SourceKey != other.Key || strings.HasPrefix(resetCfg.PublicAssetID, "ast-") == false {
		t.Fatalf("reset cfg=%+v", resetCfg)
	}
	if resetCfg.PublicAssetID == "" {
		t.Fatal("reset must generate a fresh id")
	}

	relocated, err := service.Rebind(RebindInput{
		SourceKey: source.Key, PublishRoot: "blog-assets", Mode: "relocate", ConfirmRelocate: true,
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if relocated.SourceKey != source.Key || relocated.PublicAssetID == "" {
		t.Fatalf("relocate cfg=%+v", relocated)
	}
}

func TestPublishRootValidation(t *testing.T) {
	service, _, _, source, _ := newStaticTestService(t)
	for _, bad := range []struct {
		root    string
		confirm bool
		want    error
	}{
		{".omnistore/image-bed", false, ErrPublishRootInvalid},
		{"blog/.omnistore/x", false, ErrPublishRootInvalid},
		{"../escape", false, ErrPublishRootInvalid},
		{"missing-dir", false, ErrPublishRootInvalid},
		{"", false, ErrRootConfirmRequired},
	} {
		_, err := service.Configure(ConfigureInput{
			SourceKey: source.Key, PublishRoot: bad.root, ConfirmPublishRoot: bad.confirm,
		}, nil, nil)
		if !errors.Is(err, bad.want) {
			t.Errorf("Configure(root=%q) error=%v, want %v", bad.root, err, bad.want)
		}
	}
	// 根发布显式确认后成功。
	if _, err := service.Configure(ConfigureInput{
		SourceKey: source.Key, PublishRoot: "", ConfirmPublishRoot: true,
	}, nil, nil); err != nil {
		t.Fatalf("confirmed root publish: %v", err)
	}
}

func writeTestFile(t *testing.T, root, rel, content string) {
	t.Helper()
	abs := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(abs, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func pngBytes() []byte {
	// 1x1 PNG 的最小合法文件头（含签名），内容不必可解码。
	return []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")
}

func jpegBytes() []byte {
	return []byte("\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")
}

func TestOpenEnforcesPathAndTypePolicy(t *testing.T) {
	service, sourceService, _, source, root := newStaticTestService(t)
	exclude := []string{"**/private/**"}
	patterns := &exclude
	if _, err := sourceService.Update(source.Key, sources.UpdateInput{ExcludePatterns: patterns}); err != nil {
		t.Fatal(err)
	}
	cfg := configureDefault(t, service, source.Key)

	writeTestFile(t, root, "blog-assets/posts/cover.png", string(pngBytes()))
	writeTestFile(t, root, "blog-assets/posts/renamed.png", string(jpegBytes())) // 扩展名与签名矛盾
	writeTestFile(t, root, "blog-assets/posts/page.html", "<html></html>")
	writeTestFile(t, root, "blog-assets/posts/not-image.png", "just text")
	writeTestFile(t, root, "blog-assets/private/secret.png", string(pngBytes()))
	writeTestFile(t, root, "private-outside/keep.png", string(pngBytes()))
	writeTestFile(t, root, ".omnistore/image-bed/hidden.png", string(pngBytes()))
	// 正常图片可读且类型由服务端判定。
	resolved, err := service.Open(cfg.PublicAssetID, "posts/cover.png")
	if err != nil {
		t.Fatalf("open cover: %v", err)
	}
	if resolved.MimeType != "image/png" || resolved.CacheControl != "public, max-age=300" {
		t.Fatalf("resolved mime=%q cache=%q", resolved.MimeType, resolved.CacheControl)
	}
	resolved.Unlock()
	resolved.File.Close()

	for name, tc := range map[string]struct {
		path string
	}{
		"asset id mismatch":  {path: "posts/cover.png"},
		"directory":          {path: "posts"},
		"publish root":       {path: ""},
		"type contradiction": {path: "posts/renamed.png"},
		"html not allowed":   {path: "posts/page.html"},
		"signature mismatch": {path: "posts/not-image.png"},
		"escape":             {path: "../../private-outside/keep.png"},
		"managed segment":    {path: "../../.omnistore/image-bed/hidden.png"},
		"missing":            {path: "posts/absent.png"},
	} {
		assetID := cfg.PublicAssetID
		if name == "asset id mismatch" {
			assetID = "ast-00000000000000000000000000000000"
		}
		if _, err := service.Open(assetID, tc.path); !errors.Is(err, files.ErrNotFound) {
			t.Errorf("%s: Open error=%v, want ErrNotFound", name, err)
		}
	}

	// 排除规则同样生效：private/** 不可经 /assets 读取。
	if _, err := service.Open(cfg.PublicAssetID, "private/secret.png"); !errors.Is(err, files.ErrNotFound) {
		t.Errorf("excluded path error=%v, want ErrNotFound", err)
	}
}

func TestOpenDisabledServiceReturnsNotFound(t *testing.T) {
	service, _, _, source, root := newStaticTestService(t)
	cfg := configureDefault(t, service, source.Key)
	writeTestFile(t, root, "blog-assets/a.png", string(pngBytes()))

	disabled := false
	if _, err := service.Update(UpdateInput{Enabled: &disabled}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Open(cfg.PublicAssetID, "a.png"); !errors.Is(err, files.ErrNotFound) {
		t.Fatalf("disabled open error=%v", err)
	}
	enabled := true
	if _, err := service.Update(UpdateInput{Enabled: &enabled}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Open(cfg.PublicAssetID, "a.png"); err != nil {
		t.Fatalf("re-enabled open: %v", err)
	}
}

func TestCacheModes(t *testing.T) {
	service, _, _, source, root := newStaticTestService(t)
	cfg := configureDefault(t, service, source.Key)
	writeTestFile(t, root, "blog-assets/a.png", string(pngBytes()))

	for mode, want := range map[string]string{
		CacheShort:   "public, max-age=300",
		CacheNoCache: "no-cache",
		CacheLong:    "public, max-age=31536000, immutable",
	} {
		mode := mode
		if _, err := service.Update(UpdateInput{CacheMode: &mode}); err != nil {
			t.Fatal(err)
		}
		resolved, err := service.Open(cfg.PublicAssetID, "a.png")
		if err != nil {
			t.Fatal(err)
		}
		resolved.Unlock()
		resolved.File.Close()
		if resolved.CacheControl != want {
			t.Fatalf("mode %s cache=%q, want %q", mode, resolved.CacheControl, want)
		}
	}
}

func TestETagIsWeak(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.png")
	if err := os.WriteFile(path, pngBytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	etag := ResolvedETag(info)
	if !strings.HasPrefix(etag, `W/"`) {
		t.Fatalf("etag=%q must be a weak validator", etag)
	}
}
