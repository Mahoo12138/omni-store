package httpserver

import (
	"net/http"
	"testing"
)

func TestRemovedTransferRoutesReturn404(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)
	for _, target := range []string{"/transfer", "/transfer?view=send", "/app/transfer", "/pickup/abc", "/collect/abc"} {
		response := serveTestRequest(t, fixture.handler, http.MethodGet, target, "", nil, "")
		if response.Code != http.StatusNotFound {
			t.Fatalf("removed route %s = %d body=%.60s, want 404", target, response.Code, response.Body.String())
		}
	}
	// 其它前端路由仍走 SPA fallback。
	if response := serveTestRequest(t, fixture.handler, http.MethodGet, "/files", "", nil, ""); response.Code != http.StatusOK {
		t.Fatalf("normal SPA route = %d", response.Code)
	}
}
