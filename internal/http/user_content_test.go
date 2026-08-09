package httpserver

import (
	"bytes"
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSetUserContentHeadersBlocksActiveInlineContent(t *testing.T) {
	tests := []struct {
		name        string
		filename    string
		body        string
		download    bool
		disposition string
		contentType string
	}{
		{name: "html extension", filename: "attack.html", body: "<script>alert(1)</script>", disposition: "attachment", contentType: "text/html"},
		{name: "svg", filename: "attack.svg", body: `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`, disposition: "attachment", contentType: "image/svg+xml"},
		{name: "javascript", filename: "attack.js", body: "alert(1)", disposition: "attachment", contentType: "text/javascript"},
		{name: "extensionless html", filename: "attack", body: "<!doctype html><script>alert(1)</script>", disposition: "attachment", contentType: "text/html"},
		{name: "plain text", filename: "readme.txt", body: "hello", disposition: "inline", contentType: "text/plain"},
		{name: "forced download", filename: "photo.jpg", body: "not important", download: true, disposition: "attachment", contentType: "image/jpeg"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			content := bytes.NewReader([]byte(tt.body))
			if err := setUserContentHeaders(response, content, tt.filename, tt.download); err != nil {
				t.Fatalf("set headers: %v", err)
			}

			disposition, params, err := mime.ParseMediaType(response.Header().Get("Content-Disposition"))
			if err != nil {
				t.Fatalf("parse disposition: %v", err)
			}
			if disposition != tt.disposition || params["filename"] != tt.filename {
				t.Fatalf("disposition=%q filename=%q", disposition, params["filename"])
			}
			if got := response.Header().Get("Content-Type"); !strings.HasPrefix(got, tt.contentType) {
				t.Fatalf("content-type=%q want prefix %q", got, tt.contentType)
			}
			if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Fatalf("X-Content-Type-Options=%q", got)
			}
			if got := response.Header().Get("Content-Security-Policy"); got != userContentCSP {
				t.Fatalf("Content-Security-Policy=%q", got)
			}
		})
	}
}

func TestWithSecurityHeadersAppliesToAllResponses(t *testing.T) {
	handler := WithSecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))

	if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options=%q", got)
	}
	if got := response.Header().Get("Referrer-Policy"); got != "same-origin" {
		t.Fatalf("Referrer-Policy=%q", got)
	}
	if got := response.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("X-Frame-Options=%q", got)
	}
}
