package httpserver

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/transfers"
)

func TestTransferAccessRequirementsHTTP(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	for _, kind := range []string{"send", "collection"} {
		for _, tc := range []struct {
			name        string
			body        string
			requireCode bool
			password    string
		}{
			{name: "legacy-default", body: `{}`, requireCode: true},
			{name: "explicit-code", body: `{"require_code":true}`, requireCode: true},
			{name: "link", body: `{"require_code":false}`},
			{name: "password-link", body: `{"require_code":false,"password":"access-password"}`, password: "access-password"},
		} {
			t.Run(kind+"/"+tc.name, func(t *testing.T) {
				ownerRoute, publicRoute, objectKey, codeKey, credentialKey := "/api/v1/transfers", "/api/v1/public/transfers/", "send", "pickup_code", "pickup_code"
				if kind == "collection" {
					ownerRoute, publicRoute, objectKey, codeKey, credentialKey = "/api/v1/transfer-collections", "/api/v1/public/transfer-collections/", "collection", "code", "code"
				}
				if resp := publicPostJSON(t, fixture.handler, ownerRoute, tc.body); resp.Code != http.StatusUnauthorized {
					t.Fatalf("anonymous creation status=%d body=%s", resp.Code, resp.Body.String())
				}
				created := fixture.postJSON(t, ownerRoute, tc.body)
				if created.Code != http.StatusOK {
					t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
				}
				data := decodeTransferJSON(t, created).Data
				object := data[objectKey].(map[string]any)
				code := data[codeKey].(string)
				if object["require_code"] != tc.requireCode || (code != "") != tc.requireCode {
					t.Fatalf("create code requirements: %s", created.Body.String())
				}
				id := int64(object["id"].(float64))
				key := object["public_key"].(string)
				if kind == "send" {
					if _, err := fixture.app.transfers.AddSendUpload(id, ownerIDOf(t, fixture), "nested/a.txt", strings.NewReader("public bytes")); err != nil {
						t.Fatal(err)
					}
					if resp := fixture.postJSON(t, ownerRoute+"/"+int64String(id)+"/finalize", ""); resp.Code != http.StatusOK {
						t.Fatalf("finalize status=%d body=%s", resp.Code, resp.Body.String())
					}
				}
				lookup := publicGet(t, fixture.handler, publicRoute+key, "")
				if lookup.Code != http.StatusOK {
					t.Fatalf("lookup status=%d body=%s", lookup.Code, lookup.Body.String())
				}
				publicInfo := decodeTransferJSON(t, lookup).Data
				if publicInfo["require_code"] != tc.requireCode || publicInfo["has_password"] != (tc.password != "") {
					t.Fatalf("public access requirements: %s", lookup.Body.String())
				}
				for _, field := range []string{"code", "pickup_code", "code_hash", "pickup_code_hash", "password_hash", "owner_user_id", "source_key"} {
					if _, exists := publicInfo[field]; exists {
						t.Fatalf("public response exposes %s: %s", field, lookup.Body.String())
					}
				}
				if tc.requireCode || tc.password != "" {
					resp := publicPostJSON(t, fixture.handler, publicRoute+key+"/unlock", `{}`)
					want := http.StatusBadRequest
					if tc.password != "" {
						want = http.StatusForbidden
					}
					if resp.Code != want {
						t.Fatalf("credentials bypass status=%d want=%d body=%s", resp.Code, want, resp.Body.String())
					}
				}
				credentials, err := json.Marshal(map[string]string{credentialKey: code, "password": tc.password})
				if err != nil {
					t.Fatal(err)
				}
				body := string(credentials)
				if !tc.requireCode && tc.password == "" {
					body = `{}`
				}
				unlock := publicPostJSON(t, fixture.handler, publicRoute+key+"/unlock", body)
				if unlock.Code != http.StatusOK {
					t.Fatalf("unlock status=%d body=%s", unlock.Code, unlock.Body.String())
				}
				token := decodeTransferJSON(t, unlock).Data["token"].(string)
				if kind == "send" {
					list := publicGet(t, fixture.handler, publicRoute+key+"/files", token)
					if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), "nested/a.txt") {
						t.Fatalf("files status=%d body=%s", list.Code, list.Body.String())
					}
				} else {
					submit := submitMultipart(t, fixture.handler, publicRoute+key+"/submit", token, nil, "nested/a.txt", "private bytes")
					if submit.Code != http.StatusOK {
						t.Fatalf("submit status=%d body=%s", submit.Code, submit.Body.String())
					}
					if resp := fixture.postJSON(t, ownerRoute+"/"+int64String(id)+"/close", ""); resp.Code != http.StatusOK {
						t.Fatal(resp.Body.String())
					}
					if resp := submitMultipart(t, fixture.handler, publicRoute+key+"/submit", token, nil, "late.txt", "late"); resp.Code != http.StatusConflict {
						t.Fatalf("closed collection accepted old token: status=%d body=%s", resp.Code, resp.Body.String())
					}
				}
				// 所有者详情无需从最近 200 条列表定位；历史任务也能直接读。
				detail := serveTestRequest(t, fixture.handler, http.MethodGet, ownerRoute+"/"+int64String(id), "", fixture.cookie, "")
				if detail.Code != http.StatusOK || decodeTransferJSON(t, detail).Data["id"] != float64(id) {
					t.Fatalf("owner detail status=%d body=%s", detail.Code, detail.Body.String())
				}
				if resp := publicGet(t, fixture.handler, ownerRoute+"/"+int64String(id), token); resp.Code != http.StatusUnauthorized {
					t.Fatalf("public token read owner detail: status=%d body=%s", resp.Code, resp.Body.String())
				}
				other := serveTestRequest(t, fixture.handler, http.MethodGet, ownerRoute+"/"+int64String(id), "", fixture.adminCookie, "")
				if other.Code != http.StatusNotFound {
					t.Fatalf("another owner detail status=%d body=%s", other.Code, other.Body.String())
				}
			})
		}
	}
}

func TestCollectionLinkSessionAndOwnerIsolationHTTP(t *testing.T) {
	fixture := newTransferHTTPFixture(t)
	optional := false
	owner := ownerIDOf(t, fixture)
	first, _, err := fixture.app.transfers.CreateCollection(transfers.CreateCollectionInput{OwnerUserID: owner, RequireCode: &optional})
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := fixture.app.transfers.CreateCollection(transfers.CreateCollectionInput{OwnerUserID: owner, RequireCode: &optional})
	if err != nil {
		t.Fatal(err)
	}
	unlock := publicPostJSON(t, fixture.handler, "/api/v1/public/transfer-collections/"+first.PublicKey+"/unlock", `{}`)
	if unlock.Code != http.StatusOK {
		t.Fatal(unlock.Body.String())
	}
	token := decodeTransferJSON(t, unlock).Data["token"].(string)
	if resp := submitMultipart(t, fixture.handler, "/api/v1/public/transfer-collections/"+second.PublicKey+"/submit", token, nil, "a.txt", "data"); resp.Code != http.StatusNotFound {
		t.Fatalf("cross-collection token status=%d body=%s", resp.Code, resp.Body.String())
	}
	if resp := submitMultipart(t, fixture.handler, "/api/v1/public/transfer-collections/"+first.PublicKey+"/submit", "", nil, "a.txt", "data"); resp.Code != http.StatusUnauthorized {
		t.Fatalf("link still needs scoped session: status=%d body=%s", resp.Code, resp.Body.String())
	}
	if resp := submitMultipart(t, fixture.handler, "/api/v1/public/transfer-collections/"+first.PublicKey+"/submit", token, nil, "a.txt", "private bytes"); resp.Code != http.StatusOK {
		t.Fatal(resp.Body.String())
	}
	for _, cookie := range []*http.Cookie{nil, fixture.adminCookie} {
		want := http.StatusUnauthorized
		if cookie != nil {
			want = http.StatusNotFound
		}
		resp := serveTestRequest(t, fixture.handler, http.MethodGet,
			"/api/v1/transfer-collections/"+int64String(first.ID)+"/submissions", "", cookie, "")
		if resp.Code != want {
			t.Fatalf("unauthorized inbox status=%d want=%d body=%s", resp.Code, want, resp.Body.String())
		}
	}
	admin, err := fixture.app.users.GetByUsername("transfer-admin")
	if err != nil {
		t.Fatal(err)
	}
	other, _, err := fixture.app.transfers.CreateCollection(transfers.CreateCollectionInput{OwnerUserID: admin.ID, RequireCode: &optional})
	if err != nil {
		t.Fatal(err)
	}
	otherToken, _, err := fixture.app.transfers.UnlockCollection(other.PublicKey, "", "")
	if err != nil {
		t.Fatal(err)
	}
	submission, err := fixture.app.transfers.SubmitToCollection(other.PublicKey, otherToken, "", "", []transfers.IncomingSubmissionFile{
		{RelativePath: "other-private.txt", Body: strings.NewReader("other private bytes")},
	})
	if err != nil {
		t.Fatal(err)
	}
	resp := fixture.postJSON(t,
		"/api/v1/transfer-collections/"+int64String(first.ID)+"/submissions/"+int64String(submission.ID)+"/save-to-files",
		`{"source_key":"`+fixture.target.Key+`","path":""}`)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("cross-owner copy status=%d body=%s", resp.Code, resp.Body.String())
	}
	if _, err := os.Stat(filepath.Join(fixture.target.RootPath, "other-private.txt")); !os.IsNotExist(err) {
		t.Fatalf("cross-owner copy created file: %v", err)
	}
}
