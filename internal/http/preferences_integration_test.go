package httpserver

import (
	"net/http"
	"testing"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/users"
)

// preferencesFixture 把已初始化的实例、handler 与管理员会话放在一起，
// 让用例只关心偏好接口本身的行为。
type preferencesFixture struct {
	handler http.Handler
	server  *Server
	userID  int64
	cookie  *http.Cookie
	csrf    string
}

// newPreferencesFixture 初始化一个只有超级管理员的实例并完成登录。
func newPreferencesFixture(t *testing.T) preferencesFixture {
	t.Helper()
	httpServer, internal := newAuthIntegrationServer(t)

	setup := serveTestRequest(t, httpServer.Handler, http.MethodPost, "/api/v1/setup/admin",
		`{"username":"admin","display_name":"Pref Admin","password":"admin-password","bootstrap_token":"integration-bootstrap-token"}`, nil, "")
	if setup.Code != http.StatusOK {
		t.Fatalf("setup status=%d body=%s", setup.Code, setup.Body.String())
	}
	var envelope struct {
		Data models.User `json:"data"`
	}
	decodeTestJSON(t, setup, &envelope)
	if envelope.Data.ID == 0 {
		t.Fatalf("setup returned no user id: body=%s", setup.Body.String())
	}
	login := serveTestRequest(t, httpServer.Handler, http.MethodPost, "/api/v1/auth/login",
		`{"username":"admin","password":"admin-password"}`, nil, "")
	cookie, csrf := parseLoginResponse(t, login)
	return preferencesFixture{handler: httpServer.Handler, server: internal, userID: envelope.Data.ID, cookie: cookie, csrf: csrf}
}

func TestMyPreferencesReadAndWrite(t *testing.T) {
	fx := newPreferencesFixture(t)

	anonymous := serveTestRequest(t, fx.handler, http.MethodGet, "/api/v1/me/preferences", "", nil, "")
	assertErrorResponse(t, anonymous, http.StatusUnauthorized, CodeUnauthorized)

	// 未设置过偏好的账号读到默认值，且读操作不建库记录（UpdatedAt 保持零值）。
	first := serveTestRequest(t, fx.handler, http.MethodGet, "/api/v1/me/preferences", "", fx.cookie, "")
	if first.Code != http.StatusOK {
		t.Fatalf("preferences status=%d body=%s", first.Code, first.Body.String())
	}
	var stored struct {
		Data models.Preferences `json:"data"`
	}
	decodeTestJSON(t, first, &stored)
	if stored.Data.Theme != models.ThemeSystem {
		t.Fatalf("default theme=%q want system body=%s", stored.Data.Theme, first.Body.String())
	}
	assertResponseRequestID(t, first)
	if !stored.Data.UpdatedAt.IsZero() {
		t.Fatalf("read must not create a preference row, updated_at=%v", stored.Data.UpdatedAt)
	}

	missingCSRF := serveTestRequest(t, fx.handler, http.MethodPatch, "/api/v1/me/preferences",
		`{"theme":"dark"}`, fx.cookie, "")
	assertErrorResponse(t, missingCSRF, http.StatusForbidden, CodeForbidden)

	invalid := serveTestRequest(t, fx.handler, http.MethodPatch, "/api/v1/me/preferences",
		`{"theme":"neon"}`, fx.cookie, fx.csrf)
	assertErrorResponse(t, invalid, http.StatusBadRequest, CodeValidationError)

	unknownField := serveTestRequest(t, fx.handler, http.MethodPatch, "/api/v1/me/preferences",
		`{"theme":"dark","density":"compact"}`, fx.cookie, fx.csrf)
	assertErrorResponse(t, unknownField, http.StatusBadRequest, CodeValidationError)

	// 非法写入不得留下副作用。
	rejected := serveTestRequest(t, fx.handler, http.MethodGet, "/api/v1/me/preferences", "", fx.cookie, "")
	var stillDefault struct {
		Data models.Preferences `json:"data"`
	}
	decodeTestJSON(t, rejected, &stillDefault)
	if stillDefault.Data.Theme != models.ThemeSystem || !stillDefault.Data.UpdatedAt.IsZero() {
		t.Fatalf("rejected writes changed preferences: %+v", stillDefault.Data)
	}

	for _, theme := range []string{models.ThemeDark, models.ThemeLight, models.ThemeSystem} {
		write := serveTestRequest(t, fx.handler, http.MethodPatch, "/api/v1/me/preferences",
			`{"theme":"`+theme+`"}`, fx.cookie, fx.csrf)
		if write.Code != http.StatusOK {
			t.Fatalf("patch %s status=%d body=%s", theme, write.Code, write.Body.String())
		}
		var written struct {
			Data models.Preferences `json:"data"`
		}
		decodeTestJSON(t, write, &written)
		if written.Data.Theme != theme || written.Data.UpdatedAt.IsZero() {
			t.Fatalf("patch %s returned %+v", theme, written.Data)
		}

		read := serveTestRequest(t, fx.handler, http.MethodGet, "/api/v1/me/preferences", "", fx.cookie, "")
		var readBack struct {
			Data models.Preferences `json:"data"`
		}
		decodeTestJSON(t, read, &readBack)
		if readBack.Data.Theme != theme {
			t.Fatalf("theme after patch=%q want %q", readBack.Data.Theme, theme)
		}
	}

	// 账号删除时偏好行一并清理，不留孤儿记录。
	if _, err := fx.server.users.SetPreferencesTheme(fx.userID, models.ThemeDark); err != nil {
		t.Fatalf("seed theme before delete: %v", err)
	}
	if err := fx.server.users.Delete(fx.userID); err != nil {
		t.Fatalf("delete user: %v", err)
	}
	afterDelete, err := fx.server.users.Preferences(fx.userID)
	if err != nil {
		t.Fatalf("query preferences after delete: %v", err)
	}
	if afterDelete.Theme != models.ThemeSystem || !afterDelete.UpdatedAt.IsZero() {
		t.Fatalf("deleted user kept a preference row: %+v", afterDelete)
	}
}

// TestSetPreferencesThemeRejectsUnknownValue 守住服务层校验：非法值不触达 SQLite CHECK 约束。
func TestSetPreferencesThemeRejectsUnknownValue(t *testing.T) {
	fx := newPreferencesFixture(t)

	if _, err := fx.server.users.SetPreferencesTheme(fx.userID, "AUTO"); err != users.ErrInvalidTheme {
		t.Fatalf("error=%v want ErrInvalidTheme", err)
	}
	if _, err := fx.server.users.SetPreferencesTheme(fx.userID, ""); err != users.ErrInvalidTheme {
		t.Fatalf("empty theme error=%v want ErrInvalidTheme", err)
	}
	prefs, err := fx.server.users.Preferences(fx.userID)
	if err != nil {
		t.Fatalf("query preferences: %v", err)
	}
	if prefs.Theme != models.ThemeSystem {
		t.Fatalf("rejected value persisted: %+v", prefs)
	}
}
