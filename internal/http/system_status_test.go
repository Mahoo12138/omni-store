package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/capabilities"
)

func readPublicSystemStatus(t *testing.T, handler http.Handler, privatePaths ...string) systemStatusResponse {
	t.Helper()
	response := serveTestRequest(t, handler, http.MethodGet, "/api/v1/system/status", "", nil, "")
	if response.Code != http.StatusOK {
		t.Fatalf("public status=%d body=%s", response.Code, response.Body.String())
	}
	for _, path := range privatePaths {
		if path != "" && strings.Contains(response.Body.String(), path) {
			t.Fatalf("public status leaked private path %q: %s", path, response.Body.String())
		}
	}
	var envelope struct {
		Data systemStatusResponse `json:"data"`
	}
	decodeTestJSON(t, response, &envelope)
	return envelope.Data
}

func statusServiceFlags(status systemStatusResponse) map[string]systemStatusFlag {
	return map[string]systemStatusFlag{
		capabilities.CapabilityPublicDrive:    status.PublicDrive,
		capabilities.CapabilityImageBed:       status.ImageBed,
		capabilities.CapabilityTransferCenter: status.TransferCenter,
	}
}

func TestSystemStatusPublicContractAndUnboundServices(t *testing.T) {
	f := newStaticHTTPFixture(t)
	status := readPublicSystemStatus(t, f.handler, f.sourceRoot, f.app.cfg.Data.Dir)
	for capability, flag := range statusServiceFlags(status) {
		if flag.Enabled || flag.Status != "未绑定" || flag.Hint == "" {
			t.Fatalf("unbound %s status=%+v", capability, flag)
		}
	}
	if status.Version == "" || status.PublicURL != f.app.cfg.Server.PublicURL || status.InstanceName != "OmniStore" {
		t.Fatalf("existing instance fields missing: %+v", status)
	}
	if status.S3.Enabled != f.app.cfg.Server.S3Enabled || !status.WebDAV.Enabled || !status.FilePreview.Enabled || status.Anonymous.Enabled {
		t.Fatalf("existing feature flags changed: %+v", status)
	}
	// Legacy and new flags all keep the same enabled/status/hint JSON contract.
	body, err := json.Marshal(status)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"s3", "webdav", "file_preview", "anonymous", "public_drive", "image_bed", "transfer_center"} {
		var flag map[string]any
		if err := json.Unmarshal(fields[key], &flag); err != nil {
			t.Fatalf("decode %s: %v", key, err)
		}
		if len(flag) != 3 || flag["status"] == "" || flag["hint"] == "" {
			t.Fatalf("invalid flag contract %s: %+v", key, flag)
		}
		if _, ok := flag["enabled"].(bool); !ok {
			t.Fatalf("%s enabled is not a boolean", key)
		}
	}
}

func TestSystemStatusServiceAvailabilityLifecycle(t *testing.T) {
	for _, capability := range capabilities.AllCapabilities() {
		t.Run(capability, func(t *testing.T) {
			f := newStaticHTTPFixture(t)
			target := newCapabilityTarget(t, f)
			assertState := func(enabled bool, state string) {
				t.Helper()
				status := readPublicSystemStatus(t, f.handler, f.sourceRoot, target.RootPath)
				for key, flag := range statusServiceFlags(status) {
					if key == capability {
						if flag.Enabled != enabled || flag.Status != state || flag.Hint == "" {
							t.Fatalf("%s state=%+v want enabled=%t status=%q", key, flag, enabled, state)
						}
					} else if flag.Enabled || flag.Status != "未绑定" {
						t.Fatalf("%s mutation affected independent %s: %+v", capability, key, flag)
					}
				}
			}
			assertState(false, "未绑定")
			bound := updateAdminCapability(t, f, capability, map[string]any{"storage_source_key": f.source.Key, "enabled": false, "expected_revision": 0})
			assertState(false, "已关闭")
			bound = updateAdminCapability(t, f, capability, map[string]any{"enabled": true, "expected_revision": bound.Revision})
			assertState(true, "已启用")
			if err := f.app.sources.SetDisabled(f.source.Key, true); err != nil {
				t.Fatal(err)
			}
			assertState(false, "存储源已禁用")
			if err := f.app.sources.SetDisabled(f.source.Key, false); err != nil {
				t.Fatal(err)
			}
			assertState(true, "已启用")
			if err := os.RemoveAll(f.sourceRoot); err != nil {
				t.Fatal(err)
			}
			assertState(false, "目录不可用")
			if err := os.WriteFile(f.sourceRoot, []byte("directory replaced by a file"), 0o600); err != nil {
				t.Fatal(err)
			}
			assertState(false, "目录不可用")
			// Switching to a valid source restores availability without touching the old root.
			bound = updateAdminCapability(t, f, capability, map[string]any{"storage_source_key": target.Key, "expected_revision": bound.Revision})
			assertState(true, "已启用")
			bound = updateAdminCapability(t, f, capability, map[string]any{"enabled": false, "expected_revision": bound.Revision})
			assertState(false, "已关闭")
			updateAdminCapability(t, f, capability, map[string]any{"enabled": false, "storage_source_key": "", "expected_revision": bound.Revision})
			assertState(false, "未绑定")
		})
	}
}

func TestSystemStatusAnonymousRequiresAvailableImageBed(t *testing.T) {
	f := newStaticHTTPFixture(t)
	if err := f.app.imagebed.SetAnonymousSettings(true); err != nil {
		t.Fatal(err)
	}
	if flag := readPublicSystemStatus(t, f.handler).Anonymous; flag.Enabled || flag.Status != "暂不可用" {
		t.Fatalf("unbound anonymous upload advertised as usable: %+v", flag)
	}
	bound := updateAdminCapability(t, f, "image_bed", map[string]any{"enabled": true, "storage_source_key": f.source.Key, "expected_revision": 0})
	if flag := readPublicSystemStatus(t, f.handler).Anonymous; !flag.Enabled || flag.Status != "已启用" {
		t.Fatalf("available anonymous upload missing: %+v", flag)
	}
	bound = updateAdminCapability(t, f, "image_bed", map[string]any{"enabled": false, "expected_revision": bound.Revision})
	if flag := readPublicSystemStatus(t, f.handler).Anonymous; flag.Enabled || flag.Status != "暂不可用" {
		t.Fatalf("closed image-bed advertised anonymous upload: %+v", flag)
	}
	updateAdminCapability(t, f, "image_bed", map[string]any{"enabled": true, "expected_revision": bound.Revision})
	if err := f.app.sources.SetDisabled(f.source.Key, true); err != nil {
		t.Fatal(err)
	}
	if flag := readPublicSystemStatus(t, f.handler).Anonymous; flag.Enabled {
		t.Fatalf("disabled source advertised anonymous upload: %+v", flag)
	}
	if err := f.app.sources.SetDisabled(f.source.Key, false); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(f.sourceRoot); err != nil {
		t.Fatal(err)
	}
	if flag := readPublicSystemStatus(t, f.handler, f.sourceRoot).Anonymous; flag.Enabled || flag.Status != "暂不可用" {
		t.Fatalf("missing root advertised anonymous upload: %+v", flag)
	}
	if err := f.app.imagebed.SetAnonymousSettings(false); err != nil {
		t.Fatal(err)
	}
	if flag := readPublicSystemStatus(t, f.handler).Anonymous; flag.Enabled || flag.Status != "未启用" {
		t.Fatalf("anonymous gate state missing: %+v", flag)
	}
}

func TestSystemStatusLookupFailureDoesNotLeakErrorDetails(t *testing.T) {
	f := newStaticHTTPFixture(t)
	if err := f.app.db.Close(); err != nil {
		t.Fatal(err)
	}
	status := readPublicSystemStatus(t, f.handler, f.sourceRoot, f.app.cfg.Data.Dir)
	for capability, flag := range statusServiceFlags(status) {
		if flag.Enabled || flag.Status != "暂不可用" || flag.Hint != "站点服务状态暂不可用" {
			t.Fatalf("unsafe %s lookup failure: %+v", capability, flag)
		}
	}
	if status.Anonymous.Enabled || status.Anonymous.Hint != "匿名上传状态暂不可用" {
		t.Fatalf("unsafe anonymous lookup failure: %+v", status.Anonymous)
	}
}

func TestSystemStatusTransferAvailabilityDoesNotRevokeHistoricalPickup(t *testing.T) {
	f := newTransferHTTPFixture(t)
	created := f.postJSON(t, "/api/v1/transfers", `{"title":"已有取件包","expires_in_hours":48}`)
	if created.Code != http.StatusOK {
		t.Fatal(created.Body.String())
	}
	data := decodeTransferJSON(t, created).Data
	send := data["send"].(map[string]any)
	id := int64(send["id"].(float64))
	publicKey := send["public_key"].(string)
	pickupCode := data["pickup_code"].(string)
	upload := f.uploadMultipart(t, "/api/v1/transfers/"+int64String(id)+"/files/upload", map[string]string{"relative_path": "delivery.txt"}, "delivery.txt", []byte("HISTORICAL DELIVERY"))
	if upload.Code != http.StatusOK {
		t.Fatal(upload.Body.String())
	}
	if response := f.postJSON(t, "/api/v1/transfers/"+int64String(id)+"/finalize", ""); response.Code != http.StatusOK {
		t.Fatal(response.Body.String())
	}
	admin := &staticFixture{handler: f.handler, app: f.app, cookie: f.adminCookie, csrf: f.adminCSRF}
	bound := readAdminCapabilityBindings(t, admin)["transfer_center"]
	assertPickup := func(enabled bool, state string) {
		t.Helper()
		flag := readPublicSystemStatus(t, f.handler, f.carrier.RootPath, f.target.RootPath).TransferCenter
		if flag.Enabled != enabled || flag.Status != state {
			t.Fatalf("current transfer availability=%+v", flag)
		}
		base := "/api/v1/public/transfers/" + publicKey
		if response := publicGet(t, f.handler, base, ""); response.Code != http.StatusOK {
			t.Fatalf("existing pickup disappeared: %d %s", response.Code, response.Body.String())
		}
		if response := publicGet(t, f.handler, base+"/files", ""); response.Code != http.StatusNotFound {
			t.Fatalf("historical pickup bypassed authorization: %d", response.Code)
		}
		unlock := publicPostJSON(t, f.handler, base+"/unlock", fmt.Sprintf(`{"pickup_code":%q}`, pickupCode))
		if unlock.Code != http.StatusOK {
			t.Fatalf("historical unlock: %d %s", unlock.Code, unlock.Body.String())
		}
		token := decodeTransferJSON(t, unlock).Data["token"].(string)
		files := publicGet(t, f.handler, base+"/files", token)
		if files.Code != http.StatusOK {
			t.Fatalf("authorized historical file list: %d %s", files.Code, files.Body.String())
		}
		var fileList struct {
			Data struct {
				Items []struct {
					ID int64 `json:"id"`
				} `json:"items"`
			} `json:"data"`
		}
		decodeTestJSON(t, files, &fileList)
		if len(fileList.Data.Items) != 1 || fileList.Data.Items[0].ID <= 0 {
			t.Fatalf("historical file list changed: %s", files.Body.String())
		}
		fileID := fileList.Data.Items[0].ID
		download := publicGet(t, f.handler, base+"/files/"+int64String(fileID)+"/download", token)
		if download.Code != http.StatusOK || download.Body.String() != "HISTORICAL DELIVERY" {
			t.Fatalf("historical download did not use original carrier: %d %s", download.Code, download.Body.String())
		}
	}
	assertPickup(true, "已启用")
	bound = updateAdminCapability(t, admin, "transfer_center", map[string]any{"enabled": false, "expected_revision": bound.Revision})
	assertPickup(false, "已关闭")
	bound = updateAdminCapability(t, admin, "transfer_center", map[string]any{"enabled": true, "storage_source_key": f.target.Key, "expected_revision": bound.Revision})
	assertPickup(true, "已启用")
	if err := f.app.sources.SetDisabled(f.target.Key, true); err != nil {
		t.Fatal(err)
	}
	assertPickup(false, "存储源已禁用")
	if err := f.app.sources.SetDisabled(f.target.Key, false); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(f.target.RootPath); err != nil {
		t.Fatal(err)
	}
	assertPickup(false, "目录不可用")
	// The bound source changed, but the package record and payload remain at the original carrier.
	if _, err := os.Stat(filepath.Join(f.carrier.RootPath, ".omnistore")); err != nil {
		t.Fatalf("historical carrier payload missing: %v", err)
	}
}
