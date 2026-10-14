package httpserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/transfers"
)

func readAdminCapabilityBindings(t *testing.T, f *staticFixture) map[string]capabilities.Binding {
	t.Helper()
	response := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/capabilities", "", f.cookie, "")
	if response.Code != http.StatusOK {
		t.Fatalf("list capabilities status=%d body=%s", response.Code, response.Body.String())
	}
	var envelope struct {
		Data struct {
			Items []capabilities.Binding `json:"items"`
			Total int                    `json:"total"`
		} `json:"data"`
	}
	decodeTestJSON(t, response, &envelope)
	if envelope.Data.Total != 3 || len(envelope.Data.Items) != 3 {
		t.Fatalf("expected exactly three singleton services: %s", response.Body.String())
	}
	bindings := make(map[string]capabilities.Binding, 3)
	for _, binding := range envelope.Data.Items {
		if _, duplicate := bindings[binding.Capability]; duplicate {
			t.Fatalf("duplicate singleton %q", binding.Capability)
		}
		bindings[binding.Capability] = binding
	}
	for _, capability := range capabilities.AllCapabilities() {
		if _, ok := bindings[capability]; !ok {
			t.Fatalf("missing singleton %q: %s", capability, response.Body.String())
		}
	}
	return bindings
}

func updateAdminCapability(t *testing.T, f *staticFixture, capability string, input map[string]any) capabilities.Binding {
	t.Helper()
	body, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	response := serveTestRequest(t, f.handler, http.MethodPut, "/api/v1/admin/capabilities/"+capability, string(body), f.cookie, f.csrf)
	if response.Code != http.StatusOK {
		t.Fatalf("update %s status=%d body=%s", capability, response.Code, response.Body.String())
	}
	var envelope struct {
		Data capabilities.Binding `json:"data"`
	}
	decodeTestJSON(t, response, &envelope)
	return envelope.Data
}

func newCapabilityTarget(t *testing.T, f *staticFixture) *models.StorageSource {
	t.Helper()
	root := filepath.Join(filepath.Dir(f.sourceRoot), "second-source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	target, err := f.app.sources.Create(sources.CreateInput{Name: "Second source", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	return target
}

func TestAdminCapabilitiesAuthorizationAndSingletonList(t *testing.T) {
	f := newStaticHTTPFixture(t)
	member, err := f.app.users.Create("capability-member", "Member", "member-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	session, csrf, err := f.app.sessions.Create(member.ID, "capability-test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	memberCookie := &http.Cookie{Name: SessionCookieName(), Value: session}
	for _, method := range []string{http.MethodGet, http.MethodPut} {
		path, body := "/api/v1/admin/capabilities", ""
		if method == http.MethodPut {
			path += "/public_drive"
			body = `{"enabled":false}`
		}
		assertErrorResponse(t, serveTestRequest(t, f.handler, method, path, body, nil, ""), http.StatusUnauthorized, CodeUnauthorized)
		assertErrorResponse(t, serveTestRequest(t, f.handler, method, path, body, memberCookie, csrf), http.StatusForbidden, CodeForbidden)
	}
	assertErrorResponse(t, serveTestRequest(t, f.handler, http.MethodPut, "/api/v1/admin/capabilities/public_drive", `{"enabled":false}`, f.cookie, ""), http.StatusForbidden, CodeForbidden)
	for key, binding := range readAdminCapabilityBindings(t, f) {
		if binding.Enabled || binding.SourceKey != "" || binding.Revision != 0 || binding.UpdatedAt.IsZero() {
			t.Fatalf("unexpected fresh %s singleton: %+v", key, binding)
		}
	}
}

func TestAdminCapabilityBindingLifecycle(t *testing.T) {
	for _, capability := range capabilities.AllCapabilities() {
		t.Run(capability, func(t *testing.T) {
			f := newStaticHTTPFixture(t)
			initial := readAdminCapabilityBindings(t, f)[capability]
			path := "/api/v1/admin/capabilities/" + capability
			assertErrorResponse(t, serveTestRequest(t, f.handler, http.MethodPut, path, `{"enabled":true,"expected_revision":0}`, f.cookie, f.csrf), http.StatusBadRequest, CodeValidationError)
			if current := readAdminCapabilityBindings(t, f)[capability]; !reflect.DeepEqual(current, initial) {
				t.Fatalf("failed unbound enable mutated binding: %+v", current)
			}
			bound := updateAdminCapability(t, f, capability, map[string]any{"enabled": true, "storage_source_key": f.source.Key, "expected_revision": initial.Revision})
			if !bound.Enabled || bound.SourceKey != f.source.Key || bound.SourceName != f.source.Name || bound.Revision != initial.Revision+1 {
				t.Fatalf("invalid initial binding: %+v", bound)
			}
			// A stale settings form cannot disable or replace a newer binding.
			stale := fmt.Sprintf(`{"enabled":false,"storage_source_key":"","expected_revision":%d}`, initial.Revision)
			assertErrorResponse(t, serveTestRequest(t, f.handler, http.MethodPut, path, stale, f.cookie, f.csrf), http.StatusConflict, CodeConflict)
			assertErrorResponse(t, serveTestRequest(t, f.handler, http.MethodPut, path, `{"storage_source_key":"missing-source"}`, f.cookie, f.csrf), http.StatusBadRequest, CodeValidationError)
			if current := readAdminCapabilityBindings(t, f)[capability]; !reflect.DeepEqual(current, bound) {
				t.Fatalf("rejected update mutated binding: before=%+v after=%+v", bound, current)
			}
			closed := updateAdminCapability(t, f, capability, map[string]any{"enabled": false, "expected_revision": bound.Revision})
			if closed.Enabled || closed.SourceKey != f.source.Key || closed.Revision != bound.Revision+1 {
				t.Fatalf("disable must retain source: %+v", closed)
			}
			reopened := updateAdminCapability(t, f, capability, map[string]any{"enabled": true, "expected_revision": closed.Revision})
			if !reopened.Enabled || reopened.SourceKey != f.source.Key || reopened.Revision != closed.Revision+1 {
				t.Fatalf("reopen lost prior source: %+v", reopened)
			}
			// Unbinding an enabled service must explicitly turn it off in this API.
			unbindWhileEnabled := fmt.Sprintf(`{"storage_source_key":"","expected_revision":%d}`, reopened.Revision)
			assertErrorResponse(t, serveTestRequest(t, f.handler, http.MethodPut, path, unbindWhileEnabled, f.cookie, f.csrf), http.StatusBadRequest, CodeValidationError)
			if current := readAdminCapabilityBindings(t, f)[capability]; !reflect.DeepEqual(current, reopened) {
				t.Fatalf("rejected active unbind mutated binding: %+v", current)
			}
			unbound := updateAdminCapability(t, f, capability, map[string]any{"enabled": false, "storage_source_key": "", "expected_revision": reopened.Revision})
			if unbound.Enabled || unbound.SourceKey != "" || unbound.SourceName != "" || unbound.Revision != reopened.Revision+1 {
				t.Fatalf("unbind must disable and increment revision: %+v", unbound)
			}
			if current := readAdminCapabilityBindings(t, f)[capability]; !reflect.DeepEqual(current, unbound) {
				t.Fatalf("persisted unbind differs: %+v", current)
			}
		})
	}
}

func TestAdminCapabilityConcurrentUpdatesAndUnknownCapability(t *testing.T) {
	f := newStaticHTTPFixture(t)
	bound := updateAdminCapability(t, f, "public_drive", map[string]any{"enabled": true, "storage_source_key": f.source.Key, "expected_revision": 0})
	target := newCapabilityTarget(t, f)
	start := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, 2)
	for _, sourceKey := range []string{f.source.Key, target.Key} {
		body := fmt.Sprintf(`{"enabled":false,"storage_source_key":%q,"expected_revision":%d}`, sourceKey, bound.Revision)
		go func() {
			<-start
			responses <- serveTestRequest(t, f.handler, http.MethodPut, "/api/v1/admin/capabilities/public_drive", body, f.cookie, f.csrf)
		}()
	}
	close(start)
	wins, conflicts := 0, 0
	var winner capabilities.Binding
	for range 2 {
		response := <-responses
		if response.Code == http.StatusOK {
			wins++
			var envelope struct {
				Data capabilities.Binding `json:"data"`
			}
			decodeTestJSON(t, response, &envelope)
			winner = envelope.Data
		} else {
			assertErrorResponse(t, response, http.StatusConflict, CodeConflict)
			conflicts++
		}
	}
	if wins != 1 || conflicts != 1 || winner.Revision != bound.Revision+1 {
		t.Fatalf("concurrent results wins=%d conflicts=%d winner=%+v", wins, conflicts, winner)
	}
	if current := readAdminCapabilityBindings(t, f)["public_drive"]; !reflect.DeepEqual(current, winner) {
		t.Fatalf("losing update overwrote winner: %+v", current)
	}
	before := readAdminCapabilityBindings(t, f)
	for _, unknown := range []string{"unknown", "static_assets"} {
		response := serveTestRequest(t, f.handler, http.MethodPut, "/api/v1/admin/capabilities/"+unknown, `{"enabled":false}`, f.cookie, f.csrf)
		assertErrorResponse(t, response, http.StatusNotFound, CodeFileNotFound)
	}
	if after := readAdminCapabilityBindings(t, f); !reflect.DeepEqual(after, before) {
		t.Fatal("unknown capability changed singleton state")
	}
}

func TestAdminCapabilityPublicDriveSwitchAndUnavailableSource(t *testing.T) {
	f := newStaticHTTPFixture(t)
	target := newCapabilityTarget(t, f)
	for root, content := range map[string]string{f.sourceRoot: "original source", target.RootPath: "replacement source"} {
		if err := os.WriteFile(filepath.Join(root, "same.txt"), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	bound := updateAdminCapability(t, f, "public_drive", map[string]any{"enabled": true, "storage_source_key": f.source.Key, "expected_revision": 0})
	response := serveTestRequest(t, f.handler, http.MethodGet, "/public/raw/same.txt", "", nil, "")
	if response.Code != http.StatusOK || response.Body.String() != "original source" {
		t.Fatalf("original public read: %d %s", response.Code, response.Body.String())
	}
	bound = updateAdminCapability(t, f, "public_drive", map[string]any{"storage_source_key": target.Key, "expected_revision": bound.Revision})
	response = serveTestRequest(t, f.handler, http.MethodGet, "/public/raw/same.txt", "", nil, "")
	if response.Code != http.StatusOK || response.Body.String() != "replacement source" {
		t.Fatalf("fixed public URL did not switch source: %d %s", response.Code, response.Body.String())
	}
	if content, err := os.ReadFile(filepath.Join(f.sourceRoot, "same.txt")); err != nil || string(content) != "original source" {
		t.Fatalf("switch moved or changed original files: %q %v", content, err)
	}
	if response := serveTestRequest(t, f.handler, http.MethodPost, "/api/v1/admin/sources/"+target.Key+"/disable", "", f.cookie, f.csrf); response.Code != http.StatusOK {
		t.Fatal(response.Body.String())
	}
	// Binding enabled state is configuration, not the effective availability of its source.
	if current := readAdminCapabilityBindings(t, f)["public_drive"]; !reflect.DeepEqual(current, bound) {
		t.Fatalf("disabling source changed binding: %+v", current)
	}
	response = serveTestRequest(t, f.handler, http.MethodGet, "/public/raw/same.txt", "", nil, "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("disabled bound source read status=%d", response.Code)
	}
	// The current backend accepts a binding to a disabled source; serving stays unavailable.
	bound = updateAdminCapability(t, f, "public_drive", map[string]any{"enabled": true, "storage_source_key": target.Key, "expected_revision": bound.Revision})
	if !bound.Enabled || bound.SourceKey != target.Key {
		t.Fatalf("disabled source binding contract changed: %+v", bound)
	}
	if response := serveTestRequest(t, f.handler, http.MethodPost, "/api/v1/admin/sources/"+target.Key+"/enable", "", f.cookie, f.csrf); response.Code != http.StatusOK {
		t.Fatal(response.Body.String())
	}
	if err := os.RemoveAll(target.RootPath); err != nil {
		t.Fatal(err)
	}
	response = serveTestRequest(t, f.handler, http.MethodGet, "/public/raw/same.txt", "", nil, "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("missing root read status=%d", response.Code)
	}
	if current := readAdminCapabilityBindings(t, f)["public_drive"]; !reflect.DeepEqual(current, bound) {
		t.Fatalf("missing root silently changed binding: %+v", current)
	}
}

func TestAdminCapabilityImageBedSwitchKeepsExistingImages(t *testing.T) {
	f := newStaticHTTPFixture(t)
	target := newCapabilityTarget(t, f)
	user, err := f.app.users.GetByUsername("static-admin")
	if err != nil {
		t.Fatal(err)
	}
	var payload bytes.Buffer
	if err := png.Encode(&payload, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	bound := updateAdminCapability(t, f, "image_bed", map[string]any{"enabled": true, "storage_source_key": f.source.Key, "expected_revision": 0})
	original, err := f.app.imagebed.UploadForUser(user, "original.png", bytes.NewReader(payload.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	bound = updateAdminCapability(t, f, "image_bed", map[string]any{"storage_source_key": target.Key, "expected_revision": bound.Revision})
	replacement, err := f.app.imagebed.UploadForUser(user, "replacement.png", bytes.NewReader(payload.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if original.StorageSourceID != f.source.ID || replacement.StorageSourceID != target.ID {
		t.Fatalf("upload source original=%d replacement=%d", original.StorageSourceID, replacement.StorageSourceID)
	}
	updateAdminCapability(t, f, "image_bed", map[string]any{"enabled": false, "expected_revision": bound.Revision})
	for _, img := range []*models.Image{original, replacement} {
		record, err := f.app.imagebed.Get(img.ImageID)
		if err != nil || record.StorageSourceID != img.StorageSourceID {
			t.Fatalf("switch changed image record: %+v %v", record, err)
		}
		response := serveTestRequest(t, f.handler, http.MethodGet, "/i/"+img.ImageID+"."+img.Ext, "", nil, "")
		if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), payload.Bytes()) {
			t.Fatalf("disabling new uploads revoked existing image %s: %d", img.ImageID, response.Code)
		}
	}
	if _, err := f.app.imagebed.UploadForUser(user, "blocked.png", bytes.NewReader(payload.Bytes())); err == nil {
		t.Fatal("disabled image-bed still accepts new uploads")
	}
}

func TestAdminCapabilityTransferSwitchKeepsExistingTasks(t *testing.T) {
	f := newStaticHTTPFixture(t)
	target := newCapabilityTarget(t, f)
	bound := updateAdminCapability(t, f, "transfer_center", map[string]any{"enabled": true, "storage_source_key": f.source.Key, "expected_revision": 0})
	create := func(title string) transfers.Send {
		t.Helper()
		response := serveTestRequest(t, f.handler, http.MethodPost, "/api/v1/transfers", fmt.Sprintf(`{"title":%q}`, title), f.cookie, f.csrf)
		if response.Code != http.StatusOK {
			t.Fatalf("create transfer: %d %s", response.Code, response.Body.String())
		}
		var envelope struct {
			Data struct {
				Send transfers.Send `json:"send"`
			} `json:"data"`
		}
		decodeTestJSON(t, response, &envelope)
		return envelope.Data.Send
	}
	original := create("original task")
	bound = updateAdminCapability(t, f, "transfer_center", map[string]any{"storage_source_key": target.Key, "expected_revision": bound.Revision})
	replacement := create("replacement task")
	if original.SourceKey != f.source.Key || replacement.SourceKey != target.Key {
		t.Fatalf("new task targets original=%s replacement=%s", original.SourceKey, replacement.SourceKey)
	}
	updateAdminCapability(t, f, "transfer_center", map[string]any{"enabled": false, "expected_revision": bound.Revision})
	response := serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/transfers", "", f.cookie, "")
	if response.Code != http.StatusOK {
		t.Fatal(response.Body.String())
	}
	var envelope struct {
		Data struct {
			Items []transfers.Send `json:"items"`
		} `json:"data"`
	}
	decodeTestJSON(t, response, &envelope)
	byID := make(map[int64]transfers.Send)
	for _, send := range envelope.Data.Items {
		byID[send.ID] = send
	}
	if len(byID) != 2 || byID[original.ID].SourceKey != original.SourceKey || byID[replacement.ID].SourceKey != replacement.SourceKey || byID[original.ID].Status != "draft" {
		t.Fatalf("binding switch or disable changed existing task records: %+v", byID)
	}
	response = serveTestRequest(t, f.handler, http.MethodPost, "/api/v1/transfers", `{"title":"blocked task"}`, f.cookie, f.csrf)
	// This service currently reports unavailable creation through its generic error.
	assertErrorResponse(t, response, http.StatusInternalServerError, CodeInternalError)
}

func TestAdminCapabilityAnonymousImageBedGateRetainsBinding(t *testing.T) {
	f := newStaticHTTPFixture(t)
	bound := updateAdminCapability(t, f, "image_bed", map[string]any{"enabled": true, "storage_source_key": f.source.Key, "expected_revision": 0})
	for _, enabled := range []bool{false, true, false} {
		response := serveTestRequest(t, f.handler, http.MethodPut, "/api/v1/admin/image-bed/anonymous-settings", fmt.Sprintf(`{"enabled":%t}`, enabled), f.cookie, f.csrf)
		if response.Code != http.StatusOK {
			t.Fatal(response.Body.String())
		}
		response = serveTestRequest(t, f.handler, http.MethodGet, "/api/v1/admin/image-bed/anonymous-settings", "", f.cookie, "")
		if response.Code != http.StatusOK {
			t.Fatal(response.Body.String())
		}
		var envelope struct {
			Data struct {
				Enabled bool   `json:"enabled"`
				Key     string `json:"key"`
			} `json:"data"`
		}
		decodeTestJSON(t, response, &envelope)
		wantKey := ""
		if enabled {
			wantKey = f.source.Key
		}
		if envelope.Data.Enabled != enabled || envelope.Data.Key != wantKey {
			t.Fatalf("anonymous gate state=%+v want enabled=%t key=%q", envelope.Data, enabled, wantKey)
		}
		if current := readAdminCapabilityBindings(t, f)["image_bed"]; !reflect.DeepEqual(current, bound) {
			t.Fatalf("anonymous gate erased or changed service binding: %+v", current)
		}
	}
}
