package httpserver

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
)

func TestAuthenticationCSRFAndAdminAuthorizationFlow(t *testing.T) {
	server := newAuthIntegrationServer(t)

	health := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/health", "", nil, "")
	if health.Code != http.StatusOK || !regexp.MustCompile(`^req_[0-9a-f]{16}$`).MatchString(health.Header().Get("X-Request-Id")) {
		t.Fatalf("health status=%d headers=%v body=%s", health.Code, health.Header(), health.Body.String())
	}
	assertResponseRequestID(t, health)

	status := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/setup/status", "", nil, "")
	if status.Code != http.StatusOK || !strings.Contains(status.Body.String(), `"initialized":false`) {
		t.Fatalf("initial setup status=%d body=%s", status.Code, status.Body.String())
	}
	setupBody := `{"username":"admin","display_name":"Release Admin","password":"admin-password"}`
	setup := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/setup/admin", setupBody, nil, "")
	if setup.Code != http.StatusOK {
		t.Fatalf("setup status=%d body=%s", setup.Code, setup.Body.String())
	}
	var setupEnvelope struct {
		Data models.User `json:"data"`
	}
	decodeTestJSON(t, setup, &setupEnvelope)
	adminID := setupEnvelope.Data.ID
	if adminID == 0 || setupEnvelope.Data.Role != models.RoleSuperAdmin {
		t.Fatalf("unexpected setup user: %+v", setupEnvelope.Data)
	}
	secondSetup := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/setup/admin", setupBody, nil, "")
	assertErrorResponse(t, secondSetup, http.StatusForbidden, CodeForbidden)

	wrongLogin := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/auth/login", `{"username":"admin","password":"wrong-password"}`, nil, "")
	assertErrorResponse(t, wrongLogin, http.StatusUnauthorized, CodeUnauthorized)

	adminLogin := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/auth/login", `{"username":"admin","password":"admin-password"}`, nil, "")
	adminCookie, adminCSRF := parseLoginResponse(t, adminLogin)
	if !adminCookie.HttpOnly || adminCookie.SameSite != http.SameSiteLaxMode || adminCookie.Path != "/" {
		t.Fatalf("unexpected session cookie: %+v", adminCookie)
	}
	authStatus := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/auth/status", "", adminCookie, "")
	if authStatus.Code != http.StatusOK || !strings.Contains(authStatus.Body.String(), `"authenticated":true`) {
		t.Fatalf("authenticated status=%d body=%s", authStatus.Code, authStatus.Body.String())
	}

	me := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/auth/me", "", adminCookie, "")
	if me.Code != http.StatusOK {
		t.Fatalf("me status=%d body=%s", me.Code, me.Body.String())
	}
	var meEnvelope struct {
		Data struct {
			User      models.User `json:"user"`
			CSRFToken string      `json:"csrf_token"`
		} `json:"data"`
	}
	decodeTestJSON(t, me, &meEnvelope)
	if meEnvelope.Data.User.ID != adminID || meEnvelope.Data.CSRFToken == "" || meEnvelope.Data.CSRFToken == adminCSRF {
		t.Fatalf("unexpected me response: %+v", meEnvelope.Data)
	}
	adminCSRF = meEnvelope.Data.CSRFToken

	createUserBody := `{"username":"member","display_name":"Test Member","password":"member-password","quota_bytes":4096}`
	missingCSRF := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/admin/users", createUserBody, adminCookie, "")
	assertErrorResponse(t, missingCSRF, http.StatusForbidden, CodeForbidden)
	createdUser := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/admin/users", createUserBody, adminCookie, adminCSRF)
	if createdUser.Code != http.StatusOK {
		t.Fatalf("create user status=%d body=%s", createdUser.Code, createdUser.Body.String())
	}
	var createdEnvelope struct {
		Data models.User `json:"data"`
	}
	decodeTestJSON(t, createdUser, &createdEnvelope)
	memberID := createdEnvelope.Data.ID
	if memberID == 0 || createdEnvelope.Data.QuotaBytes != 4096 || createdEnvelope.Data.Role != models.RoleUser {
		t.Fatalf("unexpected created user: %+v", createdEnvelope.Data)
	}

	memberLogin := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/auth/login", `{"username":"member","password":"member-password"}`, nil, "")
	memberCookie, memberCSRF := parseLoginResponse(t, memberLogin)
	memberAdminList := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/admin/users", "", memberCookie, "")
	assertErrorResponse(t, memberAdminList, http.StatusForbidden, CodeForbidden)
	profileWithoutCSRF := serveTestRequest(t, server.Handler, http.MethodPatch, "/api/v1/me/profile", `{"display_name":"Updated Member"}`, memberCookie, "")
	assertErrorResponse(t, profileWithoutCSRF, http.StatusForbidden, CodeForbidden)
	profile := serveTestRequest(t, server.Handler, http.MethodPatch, "/api/v1/me/profile", `{"display_name":"Updated Member"}`, memberCookie, memberCSRF)
	if profile.Code != http.StatusOK || !strings.Contains(profile.Body.String(), `"display_name":"Updated Member"`) {
		t.Fatalf("profile status=%d body=%s", profile.Code, profile.Body.String())
	}

	selfDisable := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/admin/users/"+itoaTest(adminID)+"/disable", "", adminCookie, adminCSRF)
	assertErrorResponse(t, selfDisable, http.StatusBadRequest, CodeValidationError)
	disableMember := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/admin/users/"+itoaTest(memberID)+"/disable", "", adminCookie, adminCSRF)
	if disableMember.Code != http.StatusOK {
		t.Fatalf("disable member status=%d body=%s", disableMember.Code, disableMember.Body.String())
	}
	memberMe := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/auth/me", "", memberCookie, "")
	assertErrorResponse(t, memberMe, http.StatusUnauthorized, CodeUnauthorized)
	if cookies := memberMe.Result().Cookies(); len(cookies) == 0 || cookies[0].MaxAge >= 0 {
		t.Fatalf("invalid session did not clear cookie: %+v", cookies)
	}

	logout := serveTestRequest(t, server.Handler, http.MethodPost, "/api/v1/auth/logout", "", adminCookie, "")
	if logout.Code != http.StatusOK {
		t.Fatalf("logout status=%d body=%s", logout.Code, logout.Body.String())
	}
	afterLogout := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/auth/status", "", adminCookie, "")
	if afterLogout.Code != http.StatusOK || !strings.Contains(afterLogout.Body.String(), `"authenticated":false`) {
		t.Fatalf("status after logout=%d body=%s", afterLogout.Code, afterLogout.Body.String())
	}
	missingAPI := serveTestRequest(t, server.Handler, http.MethodGet, "/api/v1/does-not-exist", "", nil, "")
	assertErrorResponse(t, missingAPI, http.StatusNotFound, CodeFileNotFound)
}

func newAuthIntegrationServer(t *testing.T) *http.Server {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "data")
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
	server, _ := New(cfg, conn, logger)
	return server
}

func serveTestRequest(t *testing.T, handler http.Handler, method, target, body string, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		request.AddCookie(cookie)
	}
	if csrf != "" {
		request.Header.Set("X-CSRF-Token", csrf)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func parseLoginResponse(t *testing.T, recorder *httptest.ResponseRecorder) (*http.Cookie, string) {
	t.Helper()
	if recorder.Code != http.StatusOK {
		t.Fatalf("login status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var envelope struct {
		Data struct {
			CSRFToken string `json:"csrf_token"`
		} `json:"data"`
	}
	decodeTestJSON(t, recorder, &envelope)
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != SessionCookieName() || envelope.Data.CSRFToken == "" {
		t.Fatalf("unexpected login response: cookies=%+v body=%s", cookies, recorder.Body.String())
	}
	return cookies[0], envelope.Data.CSRFToken
}

func assertErrorResponse(t *testing.T, recorder *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if recorder.Code != status {
		t.Fatalf("status=%d want=%d body=%s", recorder.Code, status, recorder.Body.String())
	}
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decodeTestJSON(t, recorder, &envelope)
	if envelope.Error.Code != code {
		t.Fatalf("error code=%q want=%q body=%s", envelope.Error.Code, code, recorder.Body.String())
	}
}

func assertResponseRequestID(t *testing.T, recorder *httptest.ResponseRecorder) {
	t.Helper()
	var envelope struct {
		RequestID string `json:"request_id"`
	}
	decodeTestJSON(t, recorder, &envelope)
	if envelope.RequestID == "" || envelope.RequestID != recorder.Header().Get("X-Request-Id") {
		t.Fatalf("request id mismatch: body=%q header=%q", envelope.RequestID, recorder.Header().Get("X-Request-Id"))
	}
}

func decodeTestJSON(t *testing.T, recorder *httptest.ResponseRecorder, dst any) {
	t.Helper()
	if err := json.Unmarshal(recorder.Body.Bytes(), dst); err != nil {
		t.Fatalf("decode response: %v body=%s", err, recorder.Body.String())
	}
}

func itoaTest(value int64) string {
	return strconv.FormatInt(value, 10)
}
