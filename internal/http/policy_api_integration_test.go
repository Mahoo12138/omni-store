package httpserver

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestAdminPolicyAPILifecycle(t *testing.T) {
	baseDir := t.TempDir()
	dataDir := filepath.Join(baseDir, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	cfg.Server.PublicURL = "http://example.test"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	httpServer, app := New(cfg, conn, logger)

	admin, err := app.users.Create("policy-admin", "Policy Admin", "admin-password", models.RoleSuperAdmin)
	if err != nil {
		t.Fatal(err)
	}
	member, err := app.users.Create("policy-member", "Policy Member", "member-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(baseDir, "policy-source")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	source, err := app.sources.Create(sources.CreateInput{Name: "Policy Source", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	sessionID, csrf, err := app.sessions.Create(admin.ID, "integration-test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	cookie := &http.Cookie{Name: SessionCookieName(), Value: sessionID}

	createInput := sources.PolicyInput{
		Name:        "Readers",
		Description: "Initial read-only policy",
		UserIDs:     []int64{member.ID},
		Sources: []sources.PolicySourceInput{{
			SourceKey:  source.Key,
			Permission: models.PermissionReadOnly,
			PathRules:  []sources.PolicyPathRuleInput{{PathPrefix: "/editable", Permission: models.PermissionReadWrite}},
		}},
	}
	createBody := marshalTestJSON(t, createInput)
	missingCSRF := serveTestRequest(t, httpServer.Handler, http.MethodPost, "/api/v1/admin/policies", createBody, cookie, "")
	assertErrorResponse(t, missingCSRF, http.StatusForbidden, CodeForbidden)
	created := serveTestRequest(t, httpServer.Handler, http.MethodPost, "/api/v1/admin/policies", createBody, cookie, csrf)
	if created.Code != http.StatusOK {
		t.Fatalf("create policy status=%d body=%s", created.Code, created.Body.String())
	}
	var createdEnvelope struct {
		Data models.AccessPolicy `json:"data"`
	}
	decodeTestJSON(t, created, &createdEnvelope)
	policy := createdEnvelope.Data
	if policy.Key == "" || policy.Name != "Readers" || len(policy.Sources) != 1 || len(policy.Users) != 1 || len(policy.Sources[0].PathRules) != 1 {
		t.Fatalf("unexpected created policy: %+v", policy)
	}

	list := serveTestRequest(t, httpServer.Handler, http.MethodGet, "/api/v1/admin/policies", "", cookie, "")
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), policy.Key) || !strings.Contains(list.Body.String(), `"total":1`) {
		t.Fatalf("list policies status=%d body=%s", list.Code, list.Body.String())
	}
	get := serveTestRequest(t, httpServer.Handler, http.MethodGet, "/api/v1/admin/policies/"+policy.Key, "", cookie, "")
	if get.Code != http.StatusOK || !strings.Contains(get.Body.String(), `"name":"Readers"`) {
		t.Fatalf("get policy status=%d body=%s", get.Code, get.Body.String())
	}

	updateInput := sources.PolicyInput{
		Name:        "Editors",
		Description: "Replaced with write access",
		UserIDs:     []int64{member.ID},
		Sources: []sources.PolicySourceInput{{
			SourceKey:  source.Key,
			Permission: models.PermissionReadWrite,
		}},
	}
	updated := serveTestRequest(t, httpServer.Handler, http.MethodPut, "/api/v1/admin/policies/"+policy.Key, marshalTestJSON(t, updateInput), cookie, csrf)
	if updated.Code != http.StatusOK || !strings.Contains(updated.Body.String(), `"name":"Editors"`) || !strings.Contains(updated.Body.String(), `"permission":"read_write"`) || strings.Contains(updated.Body.String(), "editable") {
		t.Fatalf("update policy status=%d body=%s", updated.Code, updated.Body.String())
	}

	invalidInput := sources.PolicyInput{
		Name:    "Broken",
		UserIDs: []int64{member.ID},
		Sources: []sources.PolicySourceInput{{SourceKey: "src-does-not-exist", Permission: models.PermissionReadOnly}},
	}
	invalidSource := serveTestRequest(t, httpServer.Handler, http.MethodPost, "/api/v1/admin/policies", marshalTestJSON(t, invalidInput), cookie, csrf)
	assertErrorResponse(t, invalidSource, http.StatusNotFound, CodeSourceNotFound)
	emptyName := serveTestRequest(t, httpServer.Handler, http.MethodPost, "/api/v1/admin/policies", `{"name":" "}`, cookie, csrf)
	assertErrorResponse(t, emptyName, http.StatusBadRequest, CodeValidationError)

	deleted := serveTestRequest(t, httpServer.Handler, http.MethodDelete, "/api/v1/admin/policies/"+policy.Key, "", cookie, csrf)
	if deleted.Code != http.StatusOK || !strings.Contains(deleted.Body.String(), `"ok":true`) {
		t.Fatalf("delete policy status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	afterDelete := serveTestRequest(t, httpServer.Handler, http.MethodGet, "/api/v1/admin/policies/"+policy.Key, "", cookie, "")
	assertErrorResponse(t, afterDelete, http.StatusNotFound, CodePolicyNotFound)
	deleteMissing := serveTestRequest(t, httpServer.Handler, http.MethodDelete, "/api/v1/admin/policies/"+policy.Key, "", cookie, csrf)
	assertErrorResponse(t, deleteMissing, http.StatusNotFound, CodePolicyNotFound)
}

func marshalTestJSON(t *testing.T, value any) string {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}
