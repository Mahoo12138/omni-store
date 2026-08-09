package sources

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
)

func TestCreateGeneratesOpaqueUniqueKeysAndRequiresName(t *testing.T) {
	service, base := newPreflightService(t)
	firstRoot := filepath.Join(base, "first")
	secondRoot := filepath.Join(base, "second")
	for _, root := range []string{firstRoot, secondRoot} {
		if err := os.Mkdir(root, 0o755); err != nil {
			t.Fatalf("create root: %v", err)
		}
	}

	if _, err := service.Create(CreateInput{RootPath: firstRoot}); !errors.Is(err, ErrNameRequired) {
		t.Fatalf("missing name error = %v", err)
	}
	first, err := service.Create(CreateInput{Name: "团队文件", RootPath: firstRoot})
	if err != nil {
		t.Fatalf("create first source: %v", err)
	}
	second, err := service.Create(CreateInput{Name: "演示资料", RootPath: secondRoot})
	if err != nil {
		t.Fatalf("create second source: %v", err)
	}
	keyPattern := regexp.MustCompile(`^src-[0-9a-f]{16}$`)
	if !keyPattern.MatchString(first.Key) || !keyPattern.MatchString(second.Key) {
		t.Fatalf("unexpected generated keys: %q %q", first.Key, second.Key)
	}
	if first.Key == second.Key || first.Key == first.Name {
		t.Fatalf("keys are not opaque and unique: first=%+v second=%+v", first, second)
	}
}

func TestCreateRechecksNonEmptyDirectoryAndRequiresExplicitImport(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "changed-after-preflight")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	preview, err := service.Preflight(PreflightInput{RootPath: root})
	if err != nil || !preview.IsEmpty {
		t.Fatalf("empty preflight=%+v err=%v", preview, err)
	}
	if err := os.WriteFile(filepath.Join(root, "arrived.txt"), []byte("external"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create(CreateInput{Name: "changed", RootPath: root}); !errors.Is(err, ErrExistingConfirmationRequired) {
		t.Fatalf("unconfirmed non-empty create error=%v", err)
	}
	list, err := service.List()
	if err != nil || len(list) != 0 {
		t.Fatalf("rejected create left sources=%d err=%v", len(list), err)
	}
	source, err := service.Create(CreateInput{
		Name: "changed", RootPath: root, ImportExisting: true,
	})
	if err != nil {
		t.Fatalf("confirmed import: %v", err)
	}
	if source.IsDisabled {
		t.Fatal("confirmed source should be enabled after atomic creation")
	}
}

func TestConcurrentCreateSameRootAllowsOnlyOneSource(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "shared-root")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}

	const attempts = 20
	start := make(chan struct{})
	results := make(chan error, attempts)
	for i := range attempts {
		go func(index int) {
			<-start
			_, err := service.Create(CreateInput{
				Name:     fmt.Sprintf("concurrent-%02d", index),
				RootPath: root,
			})
			results <- err
		}(i)
	}
	close(start)

	succeeded := 0
	rejected := 0
	for range attempts {
		err := <-results
		switch {
		case err == nil:
			succeeded++
		case strings.Contains(err.Error(), "路径重叠"):
			rejected++
		default:
			t.Fatalf("unexpected create error: %v", err)
		}
	}
	if succeeded != 1 || rejected != attempts-1 {
		t.Fatalf("succeeded=%d rejected=%d", succeeded, rejected)
	}
	sources, err := service.List()
	if err != nil || len(sources) != 1 {
		t.Fatalf("List() count=%d err=%v", len(sources), err)
	}
}

func TestConcurrentCreateParentAndChildAcrossServicesAllowsOnlyOneSource(t *testing.T) {
	service, base := newPreflightService(t)
	secondService := NewService(service.db, service.dataDir)
	parent := filepath.Join(base, "parent-root")
	child := filepath.Join(parent, "child-root")
	if err := os.MkdirAll(child, 0o755); err != nil {
		t.Fatalf("create roots: %v", err)
	}

	start := make(chan struct{})
	results := make(chan error, 2)
	for _, candidate := range []struct {
		service *Service
		name    string
		root    string
	}{
		{service: service, name: "parent", root: parent},
		{service: secondService, name: "child", root: child},
	} {
		candidate := candidate
		go func() {
			<-start
			_, err := candidate.service.Create(CreateInput{
				Name: candidate.name, RootPath: candidate.root, ImportExisting: true,
			})
			results <- err
		}()
	}
	close(start)

	succeeded := 0
	rejected := 0
	for range 2 {
		err := <-results
		if err == nil {
			succeeded++
		} else if strings.Contains(err.Error(), "路径重叠") {
			rejected++
		} else {
			t.Fatalf("unexpected create error: %v", err)
		}
	}
	if succeeded != 1 || rejected != 1 {
		t.Fatalf("succeeded=%d rejected=%d", succeeded, rejected)
	}
	sources, err := service.List()
	if err != nil || len(sources) != 1 {
		t.Fatalf("List() count=%d err=%v", len(sources), err)
	}
}

func newPreflightService(t *testing.T) (*Service, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return NewService(conn, dataDir), base
}

func TestPreflightExistingDirectoryUsesDefaultExcludes(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "existing")
	if err := os.MkdirAll(filepath.Join(root, "album"), 0o755); err != nil {
		t.Fatalf("create directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "photo.jpg"), []byte("image"), 0o644); err != nil {
		t.Fatalf("write visible file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("secret"), 0o600); err != nil {
		t.Fatalf("write excluded file: %v", err)
	}

	preview, err := service.Preflight(PreflightInput{RootPath: root})
	if err != nil {
		t.Fatalf("preflight directory: %v", err)
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve root path: %v", err)
	}
	if preview.RootPath != filepath.Clean(realRoot) || preview.IsEmpty {
		t.Fatalf("unexpected root preview: %+v", preview)
	}
	if preview.Summary.TotalEntries != 3 || preview.Summary.VisibleEntries != 2 ||
		preview.Summary.Files != 1 || preview.Summary.Directories != 1 ||
		preview.Summary.ExcludedEntries != 1 {
		t.Fatalf("unexpected summary: %+v", preview.Summary)
	}
	if len(preview.Entries) != 2 || len(preview.Warnings) < 2 {
		t.Fatalf("unexpected entries or warnings: %+v", preview)
	}
	if _, err := os.Stat(filepath.Join(root, ".env")); err != nil {
		t.Fatalf("preflight changed existing file: %v", err)
	}
	matches, err := filepath.Glob(filepath.Join(root, ".omnistore-write-test-*"))
	if err != nil || len(matches) != 0 {
		t.Fatalf("write precheck residue: matches=%v err=%v", matches, err)
	}
}

func TestPreflightHonorsExplicitEmptyExcludePatterns(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "custom-patterns")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("visible"), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}

	preview, err := service.Preflight(PreflightInput{
		RootPath: root, ExcludePatterns: []string{}, HasPatterns: true,
	})
	if err != nil {
		t.Fatalf("preflight directory: %v", err)
	}
	if preview.Summary.Files != 1 || preview.Summary.ExcludedEntries != 0 || len(preview.ExcludePatterns) != 0 {
		t.Fatalf("explicit empty patterns were not honored: %+v", preview)
	}
}

func TestPreflightRejectsPathOverlappingExistingSource(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "registered")
	nested := filepath.Join(root, "nested")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}
	if _, err := service.Create(CreateInput{Name: "registered-source", RootPath: root, ImportExisting: true}); err != nil {
		t.Fatalf("create source: %v", err)
	}

	if _, err := service.Preflight(PreflightInput{RootPath: nested}); err == nil {
		t.Fatal("expected overlapping path to be rejected")
	}
}

func TestPreflightLimitsVisibleEntrySample(t *testing.T) {
	service, base := newPreflightService(t)
	root := filepath.Join(base, "many-files")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create root: %v", err)
	}
	for i := 0; i < preflightEntryLimit+2; i++ {
		name := filepath.Join(root, "item-"+string(rune('a'+i)))
		if err := os.WriteFile(name, []byte("x"), 0o644); err != nil {
			t.Fatalf("write file: %v", err)
		}
	}

	preview, err := service.Preflight(PreflightInput{RootPath: root})
	if err != nil {
		t.Fatalf("preflight directory: %v", err)
	}
	if len(preview.Entries) != preflightEntryLimit || !preview.SampleTruncated ||
		preview.Summary.VisibleEntries != preflightEntryLimit+2 {
		t.Fatalf("unexpected limited preview: %+v", preview)
	}
}
