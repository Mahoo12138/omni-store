package httpserver

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
)

func bootstrapTransferGuest(t *testing.T, fixture *transferFixture) (*http.Cookie, transferIdentityDTO) {
	t.Helper()
	response := publicPostJSON(t, fixture.handler, "/api/v1/transfer-identity", `{}`)
	if response.Code != http.StatusOK {
		t.Fatalf("bootstrap guest status=%d body=%s", response.Code, response.Body.String())
	}
	var body struct {
		Data transferIdentityDTO `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == transferGuestCookieName && cookie.Value != "" {
			return cookie, body.Data
		}
	}
	t.Fatal("bootstrap did not set guest cookie")
	return nil, body.Data
}

func transferGuestUpload(t *testing.T, fixture *transferFixture, cookie *http.Cookie, csrf, target, fileName string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("relative_path", fileName); err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("guest bytes")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, target, &body)
	request.AddCookie(cookie)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("X-CSRF-Token", csrf)
	response := httptest.NewRecorder()
	fixture.handler.ServeHTTP(response, request)
	return response
}

func TestTransferGuestIdentityPersistsWithoutNormalAccount(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	fixture.app.cfg.Security.SessionTTLHours = 24
	if response := publicGet(t, fixture.handler, "/api/v1/transfer-identity", ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("identity without cookie status=%d", response.Code)
	}
	var usersBefore int
	if err := fixture.app.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&usersBefore); err != nil {
		t.Fatal(err)
	}
	cookie, identity := bootstrapTransferGuest(t, fixture)
	if !cookie.HttpOnly || cookie.Path != "/api/v1" || cookie.SameSite != http.SameSiteLaxMode || cookie.MaxAge != 24*60*60 {
		t.Fatalf("guest cookie properties=%+v", cookie)
	}
	if identity.Kind != "guest" || !strings.HasPrefix(identity.OwnerKey, "guest:") || identity.CSRFToken == "" || identity.MaxExpiryHours != 24 ||
		identity.Limits == nil || identity.Limits.MaxActiveTasks != 20 || identity.Limits.MaxActiveBytes <= 0 || identity.Limits.MaxFileSize <= 0 {
		t.Fatalf("guest identity=%+v", identity)
	}
	if identity.ExpiresAt.After(time.Now().UTC().Add(24*time.Hour+time.Second)) || identity.ExpiresAt.Before(time.Now().UTC().Add(23*time.Hour)) {
		t.Fatalf("guest expiry=%v", identity.ExpiresAt)
	}
	var storedHash string
	var usersAfter int
	if err := fixture.app.db.QueryRow(`SELECT token_hash FROM transfer_guest_identities`).Scan(&storedHash); err != nil || storedHash == cookie.Value {
		t.Fatalf("guest cookie stored in plaintext=%v err=%v", storedHash == cookie.Value, err)
	}
	if err := fixture.app.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&usersAfter); err != nil || usersAfter != usersBefore {
		t.Fatalf("guest bootstrap created ordinary account: before=%d after=%d err=%v", usersBefore, usersAfter, err)
	}
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		response := serveTestRequest(t, fixture.handler, method, "/api/v1/transfer-identity", `{}`, cookie, "")
		if response.Code != http.StatusOK {
			t.Fatal(response.Body.String())
		}
		var body struct {
			Data transferIdentityDTO `json:"data"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.Data.OwnerKey != identity.OwnerKey || body.Data.CSRFToken != identity.CSRFToken || !body.Data.ExpiresAt.Equal(identity.ExpiresAt) {
			t.Fatalf("identity changed on reload/bootstrap: before=%+v after=%+v", identity, body.Data)
		}
		for _, renewed := range response.Result().Cookies() {
			if renewed.Name == transferGuestCookieName && renewed.MaxAge > 0 {
				t.Fatal("guest bootstrap must not extend existing identity")
			}
		}
	}
	for _, route := range []string{"/api/v1/auth/me", "/api/v1/sources", "/api/v1/admin/users", "/api/v1/sources/" + fixture.store.Key + "/files"} {
		response := serveTestRequest(t, fixture.handler, http.MethodGet, route, "", cookie, "")
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("guest got normal app access %s: status=%d body=%s", route, response.Code, response.Body.String())
		}
	}
	for _, csrf := range []string{"", "wrong", fixture.csrf} {
		response := serveTestRequest(t, fixture.handler, http.MethodPost, "/api/v1/transfers", `{"require_code":false}`, cookie, csrf)
		if response.Code != http.StatusForbidden {
			t.Fatalf("guest invalid CSRF status=%d body=%s", response.Code, response.Body.String())
		}
	}
	loggedIn := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/transfer-identity", "", fixture.cookie, "")
	if loggedIn.Code != http.StatusOK || decodeTransferJSON(t, loggedIn).Data["owner_key"] == identity.OwnerKey ||
		decodeTransferJSON(t, loggedIn).Data["kind"] != "user" || decodeTransferJSON(t, loggedIn).Data["csrf_token"] != fixture.csrf {
		t.Fatalf("normal identity status=%d body=%s", loggedIn.Code, loggedIn.Body.String())
	}
	mixedRequest := httptest.NewRequest(http.MethodGet, "/api/v1/transfer-identity", nil)
	mixedRequest.AddCookie(cookie)
	mixedRequest.AddCookie(fixture.cookie)
	mixedResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(mixedResponse, mixedRequest)
	if mixedResponse.Code != http.StatusOK || decodeTransferJSON(t, mixedResponse).Data["kind"] != "user" {
		t.Fatalf("guest cookie overrides normal login identity: status=%d body=%s", mixedResponse.Code, mixedResponse.Body.String())
	}
}

func TestTransferGuestOwnsOnlyItsTasksHTTP(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	fixture.app.cfg.Security.SessionTTLHours = 24
	cookie, identity := bootstrapTransferGuest(t, fixture)
	otherCookie, otherIdentity := bootstrapTransferGuest(t, fixture)
	for _, route := range []string{"/api/v1/transfers", "/api/v1/transfer-collections"} {
		created := serveTestRequest(t, fixture.handler, http.MethodPost, route,
			`{"title":"Guest task","require_code":false,"expires_in_hours":168}`, cookie, identity.CSRFToken)
		if created.Code != http.StatusOK {
			t.Fatalf("guest create status=%d body=%s", created.Code, created.Body.String())
		}
		objectKey := "send"
		if route == "/api/v1/transfer-collections" {
			objectKey = "collection"
		}
		object := decodeTransferJSON(t, created).Data[objectKey].(map[string]any)
		id := int64(object["id"].(float64))
		key := object["public_key"].(string)
		expires, err := time.Parse(time.RFC3339Nano, object["expires_at"].(string))
		if err != nil || !expires.Equal(identity.ExpiresAt) {
			t.Fatalf("guest task must clamp to identity expiry=%v got=%v err=%v", identity.ExpiresAt, expires, err)
		}
		detailRoute := route + "/" + int64String(id)
		for _, credentials := range []struct {
			cookie *http.Cookie
			csrf   string
			want   int
		}{
			{cookie: cookie, csrf: identity.CSRFToken, want: http.StatusOK},
			{cookie: otherCookie, csrf: otherIdentity.CSRFToken, want: http.StatusNotFound},
			{cookie: fixture.cookie, csrf: fixture.csrf, want: http.StatusNotFound},
		} {
			response := serveTestRequest(t, fixture.handler, http.MethodGet, detailRoute, "", credentials.cookie, "")
			if response.Code != credentials.want {
				t.Fatalf("guest task detail status=%d want=%d body=%s", response.Code, credentials.want, response.Body.String())
			}
		}
		if response := serveTestRequest(t, fixture.handler, http.MethodGet, route, "", cookie, ""); response.Code != http.StatusOK || !strings.Contains(response.Body.String(), key) {
			t.Fatalf("guest history after reload status=%d body=%s", response.Code, response.Body.String())
		}
		if response := serveTestRequest(t, fixture.handler, http.MethodGet, route, "", otherCookie, ""); response.Code != http.StatusOK || strings.Contains(response.Body.String(), key) {
			t.Fatalf("other guest history leaked task: status=%d body=%s", response.Code, response.Body.String())
		}
		if objectKey == "send" {
			if response := transferGuestUpload(t, fixture, otherCookie, otherIdentity.CSRFToken, detailRoute+"/files/upload", "a.txt"); response.Code != http.StatusNotFound {
				t.Fatalf("other guest upload status=%d body=%s", response.Code, response.Body.String())
			}
			if response := transferGuestUpload(t, fixture, cookie, identity.CSRFToken, detailRoute+"/files/upload", "a.txt"); response.Code != http.StatusOK {
				t.Fatalf("guest upload status=%d body=%s", response.Code, response.Body.String())
			}
			if response := serveTestRequest(t, fixture.handler, http.MethodPost, detailRoute+"/files/from-store",
				`{"source_key":"`+fixture.store.Key+`","paths":["secret.txt"]}`, cookie, identity.CSRFToken); response.Code != http.StatusUnauthorized {
				t.Fatalf("guest accessed storage copy: status=%d body=%s", response.Code, response.Body.String())
			}
			if response := serveTestRequest(t, fixture.handler, http.MethodPost, detailRoute+"/finalize", "", cookie, identity.CSRFToken); response.Code != http.StatusOK {
				t.Fatal(response.Body.String())
			}
		} else {
			unlock := publicPostJSON(t, fixture.handler, "/api/v1/public/transfer-collections/"+key+"/unlock", `{}`)
			token := decodeTransferJSON(t, unlock).Data["token"].(string)
			if response := submitMultipart(t, fixture.handler, "/api/v1/public/transfer-collections/"+key+"/submit", token, nil, "private.txt", "private bytes"); response.Code != http.StatusOK {
				t.Fatal(response.Body.String())
			}
			inbox := serveTestRequest(t, fixture.handler, http.MethodGet, detailRoute+"/submissions", "", cookie, "")
			if inbox.Code != http.StatusOK || !strings.Contains(inbox.Body.String(), "private.txt") {
				t.Fatalf("guest inbox status=%d body=%s", inbox.Code, inbox.Body.String())
			}
			var submissionID, fileID int64
			if err := fixture.app.db.QueryRow(`SELECT sub.id, f.id FROM transfer_submissions sub JOIN transfer_submission_files f ON f.submission_id = sub.id WHERE sub.collection_id = ?`, id).Scan(&submissionID, &fileID); err != nil {
				t.Fatal(err)
			}
			downloadRoute := detailRoute + "/submissions/" + int64String(submissionID) + "/files/" + int64String(fileID) + "/download"
			if response := serveTestRequest(t, fixture.handler, http.MethodGet, downloadRoute, "", cookie, ""); response.Code != http.StatusOK || response.Body.String() != "private bytes" {
				t.Fatalf("guest cannot download own submission: status=%d body=%s", response.Code, response.Body.String())
			}
			for _, bad := range []*http.Cookie{otherCookie, fixture.cookie} {
				if response := serveTestRequest(t, fixture.handler, http.MethodGet, detailRoute+"/submissions", "", bad, ""); response.Code != http.StatusNotFound {
					t.Fatalf("another owner read guest inbox: status=%d body=%s", response.Code, response.Body.String())
				}
				if response := serveTestRequest(t, fixture.handler, http.MethodGet, downloadRoute, "", bad, ""); response.Code != http.StatusNotFound {
					t.Fatalf("another owner read guest submission bytes: status=%d body=%s", response.Code, response.Body.String())
				}
			}
			if response := serveTestRequest(t, fixture.handler, http.MethodPost, detailRoute+"/submissions/1/save-to-files",
				`{"source_key":"`+fixture.target.Key+`","path":""}`, cookie, identity.CSRFToken); response.Code != http.StatusUnauthorized {
				t.Fatalf("guest accessed storage save: status=%d body=%s", response.Code, response.Body.String())
			}
			if response := serveTestRequest(t, fixture.handler, http.MethodPost, detailRoute+"/close", "", otherCookie, otherIdentity.CSRFToken); response.Code != http.StatusNotFound {
				t.Fatalf("other guest close status=%d body=%s", response.Code, response.Body.String())
			}
			if response := serveTestRequest(t, fixture.handler, http.MethodPost, detailRoute+"/close", "", cookie, identity.CSRFToken); response.Code != http.StatusOK {
				t.Fatal(response.Body.String())
			}
		}
	}
	if _, err := fixture.app.db.Exec(`UPDATE transfer_guest_identities SET expires_at = ? WHERE token_hash = ?`, time.Now().UTC().Add(-time.Hour), auth.HashToken(cookie.Value)); err != nil {
		t.Fatal(err)
	}
	if response := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/transfers", "", cookie, ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("expired guest cookie status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestTransferGuestBootstrapRejectsCrossSiteAndRateLimits(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	for _, headers := range []map[string]string{
		{"Origin": "https://evil.example.test"},
		{"Origin": "null"},
		{"Sec-Fetch-Site": "cross-site"},
		{"Origin": "https://example.com"}, // httptest's plain HTTP host cannot change scheme.
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/transfer-identity", strings.NewReader(`{}`))
		request.Header.Set("Content-Type", "application/json")
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		response := httptest.NewRecorder()
		fixture.handler.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("cross-site bootstrap status=%d body=%s", response.Code, response.Body.String())
		}
	}
	fixture.app.transferGuestLimiter = newKeyedRateLimiter(1, time.Hour)
	cookie, identity := bootstrapTransferGuest(t, fixture)
	if response := publicPostJSON(t, fixture.handler, "/api/v1/transfer-identity", `{}`); response.Code != http.StatusTooManyRequests {
		t.Fatalf("bootstrap limit status=%d body=%s", response.Code, response.Body.String())
	}
	if response := serveTestRequest(t, fixture.handler, http.MethodPost, "/api/v1/transfer-identity", `{}`, cookie, ""); response.Code != http.StatusOK {
		t.Fatalf("rate limit prevented existing identity restore: status=%d body=%s", response.Code, response.Body.String())
	}
	for i, want := range []int{http.StatusOK, http.StatusTooManyRequests} {
		response := serveTestRequest(t, fixture.handler, http.MethodPost, "/api/v1/transfers", `{"require_code":false}`, cookie, identity.CSRFToken)
		if response.Code != want {
			t.Fatalf("guest create %d status=%d want=%d body=%s", i, response.Code, want, response.Body.String())
		}
	}
}

func TestSystemStatusTransferHintReflectsGuestSupport(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	status := readPublicSystemStatus(t, fixture.handler, fixture.carrier.RootPath, fixture.app.cfg.Data.Dir)
	if !status.TransferCenter.Enabled || status.TransferCenter.Hint != "访客和登录用户均可创建发件包和收集任务；已有链接按各自授权访问" {
		t.Fatalf("transfer support hint=%+v", status.TransferCenter)
	}
}

func TestRevokeEmptyTransferIsIdempotentHTTP(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	guestCookie, identity := bootstrapTransferGuest(t, fixture)
	for _, owner := range []struct {
		cookie *http.Cookie
		csrf   string
	}{
		{cookie: fixture.cookie, csrf: fixture.csrf}, {cookie: guestCookie, csrf: identity.CSRFToken},
	} {
		created := serveTestRequest(t, fixture.handler, http.MethodPost, "/api/v1/transfers", `{}`, owner.cookie, owner.csrf)
		if created.Code != http.StatusOK {
			t.Fatal(created.Body.String())
		}
		id := int64(decodeTransferJSON(t, created).Data["send"].(map[string]any)["id"].(float64))
		for i := 0; i < 2; i++ {
			response := serveTestRequest(t, fixture.handler, http.MethodDelete, "/api/v1/transfers/"+int64String(id), "", owner.cookie, owner.csrf)
			if response.Code != http.StatusOK {
				t.Fatalf("empty draft revoke %d status=%d body=%s", i+1, response.Code, response.Body.String())
			}
		}
	}
}
