package httpserver

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/operations"
	"github.com/omni-store/omnistore/internal/sources"
)

func TestAdminOverviewIncludesAllSourcesAndIsolatesUnavailableRoots(t *testing.T) {
	f := newStaticHTTPFixture(t)
	if response := f.configure(t, `{"publish_root":"blog-assets"}`); response.Code != http.StatusOK {
		t.Fatal(response.Body.String())
	}
	for i := 0; i < 5; i++ {
		root := filepath.Join(filepath.Dir(f.sourceRoot), fmt.Sprintf("extra-%d", i))
		if err := os.Mkdir(root, 0o755); err != nil {
			t.Fatal(err)
		}
		source, err := f.app.sources.Create(sources.CreateInput{Name: fmt.Sprintf("Extra %d", i), RootPath: root, ImportExisting: true})
		if err != nil {
			t.Fatal(err)
		}
		if i == 3 {
			if err := f.app.sources.SetDisabled(source.Key, true); err != nil {
				t.Fatal(err)
			}
		}
		if i == 4 {
			if err := os.Remove(root); err != nil {
				t.Fatal(err)
			}
		}
	}
	response := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/overview", "", f.cookie, "")
	if response.Code != http.StatusOK {
		t.Fatalf("overview status=%d body=%s", response.Code, response.Body.String())
	}
	var envelope struct {
		Data overviewResponse `json:"data"`
	}
	decodeTestJSON(t, response, &envelope)
	status := envelope.Data.Operations
	if status == nil || len(status.Sources) != 6 || status.Database.TableRows["storage_sources"] != 6 || status.Database.TableRows["users"] != 1 {
		t.Fatalf("incomplete dashboard: %+v", status)
	}
	if status.Database.QuickCheck != "ok" || status.Version == "" || status.DataDir != f.app.cfg.Data.Dir || status.GeneratedAt.IsZero() {
		t.Fatalf("missing runtime/database state: %+v", status)
	}
	byName := map[string]operations.SourceHealth{}
	for _, source := range status.Sources {
		byName[source.Name] = source
	}
	if !byName["Blog"].StaticEnabled || byName["Blog"].RootPath != f.source.RootPath || !byName["Blog"].RootAccessible {
		t.Fatalf("source configuration lost: %+v", byName["Blog"])
	}
	if !byName["Extra 3"].Disabled || !byName["Extra 3"].RootAccessible {
		t.Fatalf("disabled state confused with inaccessible root: %+v", byName["Extra 3"])
	}
	if byName["Extra 4"].RootAccessible || byName["Extra 4"].RootIssue == "" {
		t.Fatalf("missing root hidden: %+v", byName["Extra 4"])
	}
	if envelope.Data.System.HTTPAddr != f.app.cfg.Server.HTTPAddr || envelope.Data.System.S3Enabled != f.app.cfg.Server.S3Enabled {
		t.Fatalf("connection settings lost: %+v", envelope.Data.System)
	}
	// The standalone status API and the dashboard use the same source-health contract.
	legacy := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/operations/status", "", f.cookie, "")
	var legacyEnvelope struct {
		Data operations.Status `json:"data"`
	}
	decodeTestJSON(t, legacy, &legacyEnvelope)
	if len(legacyEnvelope.Data.Sources) != len(status.Sources) || legacyEnvelope.Data.Sources[0].RootPath != status.Sources[0].RootPath {
		t.Fatal("dashboard and operations status diverged")
	}
}

func TestAdminOverviewAuthorizationAndEmptyState(t *testing.T) {
	f := newStaticHTTPFixture(t)
	if response := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/overview", "", nil, ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated overview: %d", response.Code)
	}
	user, err := f.app.users.Create("dashboard-user", "User", "password-for-test", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	session, _, err := f.app.sessions.Create(user.ID, "test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	cookie := &http.Cookie{Name: SessionCookieName(), Value: session}
	if response := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/overview", "", cookie, ""); response.Code != http.StatusForbidden {
		t.Fatalf("non-admin overview: %d", response.Code)
	}
	if err := f.app.sources.Delete(f.source.Key); err != nil {
		t.Fatal(err)
	}
	response := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/overview", "", f.cookie, "")
	var envelope struct {
		Data overviewResponse `json:"data"`
	}
	decodeTestJSON(t, response, &envelope)
	if response.Code != http.StatusOK || envelope.Data.Operations.Sources == nil || len(envelope.Data.Operations.Sources) != 0 || envelope.Data.Operations.Database.TableRows["users"] != 2 {
		t.Fatalf("invalid empty-state response: %s", response.Body.String())
	}
}

func TestAdminOverviewFailsWhenSnapshotCannotBeBuilt(t *testing.T) {
	f := newStaticHTTPFixture(t)
	if err := f.app.db.Close(); err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	f.app.handleAdminOverview(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/admin/overview", nil))
	assertErrorResponse(t, recorder, http.StatusInternalServerError, CodeInternalError)
}
