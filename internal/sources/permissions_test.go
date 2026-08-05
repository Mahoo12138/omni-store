package sources

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/users"
)

func TestAccessPoliciesMergePermissionsAndDriveSourceList(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	user, err := users.NewService(conn).Create("policy-user", "Policy User", "test-password", models.RoleUser)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	service := NewService(conn, dataDir)
	first := createPolicyTestSource(t, service, base, "first")
	second := createPolicyTestSource(t, service, base, "second")

	if allowed, err := service.CanReadSource(user, first.Key); err != nil || allowed {
		t.Fatalf("unexpected access without policy: allowed=%v err=%v", allowed, err)
	}

	readPolicy, err := service.CreatePolicy(PolicyInput{
		Name:    "Readers",
		UserIDs: []int64{user.ID},
		Sources: []PolicySourceInput{{SourceKey: first.Key, Permission: models.PermissionReadOnly}},
	})
	if err != nil {
		t.Fatalf("create read policy: %v", err)
	}
	if allowed, err := service.CanReadSource(user, first.Key); err != nil || !allowed {
		t.Fatalf("read policy did not grant access: allowed=%v err=%v", allowed, err)
	}
	if allowed, err := service.CanWriteSource(user, first.Key); err != nil || allowed {
		t.Fatalf("read policy unexpectedly granted write: allowed=%v err=%v", allowed, err)
	}

	writePolicy, err := service.CreatePolicy(PolicyInput{
		Name:    "Editors",
		UserIDs: []int64{user.ID},
		Sources: []PolicySourceInput{
			{SourceKey: first.Key, Permission: models.PermissionReadWrite},
			{SourceKey: second.Key, Permission: models.PermissionReadOnly},
		},
	})
	if err != nil {
		t.Fatalf("create write policy: %v", err)
	}
	views, err := service.ListForUser(user)
	if err != nil {
		t.Fatalf("list sources: %v", err)
	}
	if len(views) != 2 || views[0].Key != first.Key || views[0].Permission != models.PermissionReadWrite ||
		views[1].Key != second.Key || views[1].Permission != models.PermissionReadOnly {
		t.Fatalf("unexpected merged views: %+v", views)
	}

	if _, err := service.UpdatePolicy(readPolicy.Key, PolicyInput{Name: "Readers", Sources: nil, UserIDs: nil}); err != nil {
		t.Fatalf("remove bindings from read policy: %v", err)
	}
	if err := service.DeletePolicy(writePolicy.Key); err != nil {
		t.Fatalf("delete write policy: %v", err)
	}
	if allowed, err := service.CanReadSource(user, first.Key); err != nil || allowed {
		t.Fatalf("deleted policies still grant access: allowed=%v err=%v", allowed, err)
	}
}

func TestAccessPolicyRejectsInvalidOrDuplicateRules(t *testing.T) {
	service, base := newPreflightService(t)
	source := createPolicyTestSource(t, service, base, "source")

	if _, err := service.CreatePolicy(PolicyInput{}); err == nil {
		t.Fatal("expected empty policy name to fail")
	}
	if _, err := service.CreatePolicy(PolicyInput{
		Name: "Duplicate",
		Sources: []PolicySourceInput{
			{SourceKey: source.Key, Permission: models.PermissionReadOnly},
			{SourceKey: source.Key, Permission: models.PermissionReadWrite},
		},
	}); err == nil {
		t.Fatal("expected duplicate source rule to fail")
	}
	if policies, err := service.ListPolicies(); err != nil || len(policies) != 0 {
		t.Fatalf("failed policy transaction left data: policies=%+v err=%v", policies, err)
	}
}

func createPolicyTestSource(t *testing.T, service *Service, base, name string) *models.StorageSource {
	t.Helper()
	root := filepath.Join(base, name)
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	source, err := service.Create(CreateInput{Name: name, RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	return source
}
