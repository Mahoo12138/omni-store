package httpserver

import (
	"net/http/httptest"
	"testing"

	"github.com/omni-store/omnistore/internal/audit"
)

func TestParseAuditQuery(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/admin/audit-logs?page=2&page_size=25&actor_type=user&entry_type=webdav&status=failed&q=move", nil)
	opts, err := parseAuditQuery(req)
	if err != nil {
		t.Fatalf("parse query: %v", err)
	}
	if opts.Page != 2 || opts.PageSize != 25 || opts.ActorType != audit.ActorUser ||
		opts.EntryType != audit.EntryWebDAV || opts.Status != audit.StatusFailed || opts.SearchText != "move" {
		t.Fatalf("unexpected options: %+v", opts)
	}
}

func TestParseAuditQueryRejectsInvalidValues(t *testing.T) {
	tests := []string{
		"?page=0",
		"?page_size=201",
		"?actor_type=guest",
		"?entry_type=s3",
		"?status=pending",
	}
	for _, query := range tests {
		req := httptest.NewRequest("GET", "/api/v1/admin/audit-logs"+query, nil)
		if _, err := parseAuditQuery(req); err == nil {
			t.Errorf("expected validation error for %s", query)
		}
	}
}
