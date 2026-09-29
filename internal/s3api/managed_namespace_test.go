package s3api

import (
	"encoding/xml"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/security"
)

type listBucketResultShape struct {
	XMLName        xml.Name `xml:"ListBucketResult"`
	Keys           []string `xml:"Contents>Key"`
	CommonPrefixes []struct {
		Prefix string `xml:"Prefix"`
	} `xml:"CommonPrefixes>Prefix"`
}

// S3 入口必须对托管命名空间返回 NoSuchKey/404，且列举永远不包含内部对象。
func TestS3ManagedNamespaceIsolated(t *testing.T) {
	f := newS3Fixture(t)
	if err := os.Mkdir(filepath.Join(f.root, security.ManagedNamespaceSegment), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.root, security.ManagedNamespaceSegment, "payload.bin"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.root, "visible.txt"), []byte("visible"), 0o600); err != nil {
		t.Fatal(err)
	}

	get := perform(f.handler, f.signedRequest(t, http.MethodGet, "/"+f.bucket+"/"+security.ManagedNamespaceSegment+"/payload.bin", nil))
	if get.Code != http.StatusNotFound || !strings.Contains(get.Body.String(), "NoSuchKey") {
		t.Fatalf("GET managed object = %d body=%s", get.Code, get.Body.String())
	}
	head := perform(f.handler, f.signedRequest(t, http.MethodHead, "/"+f.bucket+"/"+security.ManagedNamespaceSegment+"/payload.bin", nil))
	if head.Code != http.StatusNotFound || head.Body.Len() != 0 {
		t.Fatalf("HEAD managed object = %d bodyLen=%d", head.Code, head.Body.Len())
	}
	// 写请求按不存在资源拒绝，且不落盘。
	put := perform(f.handler, f.signedRequest(t, http.MethodPut, "/"+f.bucket+"/"+security.ManagedNamespaceSegment+"/evil.txt", []byte("evil")))
	if put.Code != http.StatusNotFound {
		t.Fatalf("PUT into managed = %d body=%s", put.Code, put.Body.String())
	}
	del := perform(f.handler, f.signedRequest(t, http.MethodDelete, "/"+f.bucket+"/"+security.ManagedNamespaceSegment+"/payload.bin", nil))
	if del.Code != http.StatusNoContent {
		t.Fatalf("DELETE managed = %d, S3 缺失键语义允许静默 204", del.Code)
	}

	listResp := perform(f.handler, f.signedRequest(t, http.MethodGet, "/"+f.bucket+"?list-type=2", nil))
	if listResp.Code != http.StatusOK {
		t.Fatalf("ListObjects = %d body=%s", listResp.Code, listResp.Body.String())
	}
	body, err := io.ReadAll(listResp.Body)
	if err != nil {
		t.Fatal(err)
	}
	var parsed listBucketResultShape
	if err := xml.Unmarshal(body, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Keys) != 1 || parsed.Keys[0] != "visible.txt" {
		t.Fatalf("list keys=%v, want only visible.txt", parsed.Keys)
	}

	payload, err := os.ReadFile(filepath.Join(f.root, security.ManagedNamespaceSegment, "payload.bin"))
	if err != nil || string(payload) != "secret" {
		t.Fatalf("managed payload changed: %q err=%v", payload, err)
	}
	if _, err := os.Stat(filepath.Join(f.root, security.ManagedNamespaceSegment, "evil.txt")); err == nil {
		t.Fatal("rejected PUT must not create objects")
	}
}
