package staticassets

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestIndependentSourceProtocolsAndLifecycle(t *testing.T) {
	service, sourceService, fileService, first, firstRoot := newStaticTestService(t)
	secondRoot := filepath.Join(filepath.Dir(firstRoot), "second")
	if err := os.MkdirAll(filepath.Join(secondRoot, "blog-assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	second, err := sourceService.Create(sources.CreateInput{Name: "Second", RootPath: secondRoot, ImportExisting: true})
	if err != nil {
		t.Fatal(err)
	}
	one := configureDefault(t, service, first.Key)
	two, err := service.Configure(ConfigureInput{SourceKey: second.Key, PublishRoot: "blog-assets", CacheMode: CacheNoCache,
		CorsMode: CorsAllowlist, AllowedOrigins: []string{"https://second.example.test"}}, nil, nil)
	if err != nil {
		t.Fatalf("second source must publish independently: %v", err)
	}
	if one.PublicAssetID == two.PublicAssetID {
		t.Fatal("source identities must differ")
	}
	writeTestFile(t, firstRoot, "blog-assets/a.png", string(pngBytes())+"first")
	writeTestFile(t, secondRoot, "blog-assets/a.png", string(pngBytes())+"second")
	for _, tc := range []struct{ id, suffix, cache, cors string }{
		{one.PublicAssetID, "first", "public, max-age=300", CorsPublic},
		{two.PublicAssetID, "second", "no-cache", CorsAllowlist},
	} {
		r, err := service.Open(tc.id, "a.png")
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(r.File)
		r.File.Close()
		r.Unlock()
		if err != nil || string(content) != string(pngBytes())+tc.suffix || r.CacheControl != tc.cache || r.CorsMode != tc.cors {
			t.Fatalf("source isolation: %+v content=%q err=%v", r, content, err)
		}
	}
	// 重启服务使用持久配置，白名单不能来自另一源。
	restarted := NewService(service.db, sourceService, fileService, "https://files.example.test")
	persisted, err := restarted.Config(second.Key)
	if err != nil || len(persisted.AllowedOrigins) != 1 || persisted.AllowedOrigins[0] != "https://second.example.test" {
		t.Fatalf("persisted=%+v err=%v", persisted, err)
	}
	if _, err := service.Rebind(first.Key, RebindInput{SourceKey: second.Key, PublishRoot: "blog-assets", Mode: "reset"}, nil, nil); !errors.Is(err, ErrTargetConfigured) {
		t.Fatalf("configured destination must not be overwritten: %v", err)
	}
	if err := service.Remove(first.Key, one.Revision); !errors.Is(err, ErrDisableRequired) {
		t.Fatalf("active identity removal=%v", err)
	}
	if err := sourceService.Delete(first.Key); err == nil {
		t.Fatal("source deletion must not silently discard its protocol")
	}
	off := false
	updated, err := service.Update(UpdateInput{SourceKey: first.Key, Enabled: &off})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Open(one.PublicAssetID, "a.png"); !errors.Is(err, files.ErrNotFound) {
		t.Fatalf("disabled open=%v", err)
	}

	if err := service.Remove(first.Key, one.Revision); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("stale removal=%v", err)
	}
	if err := service.Remove(first.Key, updated.Revision); err != nil {
		t.Fatal(err)
	}
	remaining, err := service.Open(two.PublicAssetID, "a.png")
	if err != nil {
		t.Fatalf("removing first source affected second: %v", err)
	}
	remaining.File.Close()
	remaining.Unlock()
	if err := sourceService.Delete(first.Key); err != nil {
		t.Fatalf("delete after protocol removal: %v", err)
	}
	if _, err := os.Stat(filepath.Join(firstRoot, "blog-assets/a.png")); err != nil {
		t.Fatalf("real file changed: %v", err)
	}
}

func TestRelocatePreservesSourceProtocolPolicyAndDisabledState(t *testing.T) {
	service, sourceService, _, first, firstRoot := newStaticTestService(t)
	root := filepath.Join(filepath.Dir(firstRoot), "destination")
	if err := os.MkdirAll(filepath.Join(root, "media"), 0o755); err != nil {
		t.Fatal(err)
	}
	second, err := sourceService.Create(sources.CreateInput{Name: "Destination", RootPath: root, ImportExisting: true})
	if err != nil {
		t.Fatal(err)
	}
	before, err := service.Configure(ConfigureInput{SourceKey: first.Key, PublishRoot: "blog-assets", CorsMode: CorsAllowlist, AllowedOrigins: []string{"https://blog.example.test"}}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	off := false
	disabled, err := service.Update(UpdateInput{SourceKey: first.Key, Enabled: &off})
	if err != nil {
		t.Fatal(err)
	}
	after, err := service.Rebind(first.Key, RebindInput{SourceKey: second.Key, PublishRoot: "media", Mode: "relocate", ConfirmRelocate: true, ExpectedRevision: &disabled.Revision}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if after.PublicAssetID != before.PublicAssetID || after.Enabled || after.CorsMode != CorsAllowlist || len(after.AllowedOrigins) != 1 || after.AllowedOrigins[0] != "https://blog.example.test" {
		t.Fatalf("relocated policy=%+v", after)
	}
	old, err := service.Config(first.Key)
	if err != nil || old.Configured() || len(old.AllowedOrigins) != 0 {
		t.Fatalf("old source still has publication=%+v err=%v", old, err)
	}
	writeTestFile(t, root, "media/a.png", string(pngBytes()))
	if _, err := service.Open(after.PublicAssetID, "a.png"); !errors.Is(err, files.ErrNotFound) {
		t.Fatalf("relocate implicitly published a disabled protocol: %v", err)
	}
	on := true
	if _, err := service.Update(UpdateInput{SourceKey: second.Key, Enabled: &on}); err != nil {
		t.Fatal(err)
	}
	r, err := service.Open(before.PublicAssetID, "a.png")
	if err != nil {
		t.Fatal(err)
	}
	r.File.Close()
	r.Unlock()
}

func TestConcurrentSourceConfigurationAndRevision(t *testing.T) {
	service, _, _, source, _ := newStaticTestService(t)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.Configure(ConfigureInput{SourceKey: source.Key, PublishRoot: "blog-assets"}, nil, nil)
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	succeeded, conflicted := 0, 0
	for err := range results {
		if err == nil {
			succeeded++
		} else if errors.Is(err, ErrAlreadyConfigured) {
			conflicted++
		} else {
			t.Fatal(err)
		}
	}
	if succeeded != 1 || conflicted != 1 {
		t.Fatalf("configure results=%d/%d", succeeded, conflicted)
	}
	cfg, err := service.Config(source.Key)
	if err != nil {
		t.Fatal(err)
	}
	results = make(chan error, 2)
	for _, mode := range []string{CacheLong, CacheNoCache} {
		wg.Add(1)
		go func(mode string) {
			defer wg.Done()
			_, err := service.Update(UpdateInput{SourceKey: source.Key, CacheMode: &mode, ExpectedRevision: &cfg.Revision})
			results <- err
		}(mode)
	}
	wg.Wait()
	close(results)
	succeeded, conflicted = 0, 0
	for err := range results {
		if err == nil {
			succeeded++
		} else if errors.Is(err, ErrRevisionConflict) {
			conflicted++
		} else {
			t.Fatal(err)
		}
	}
	if succeeded != 1 || conflicted != 1 {
		t.Fatalf("update results=%d/%d", succeeded, conflicted)
	}
}
