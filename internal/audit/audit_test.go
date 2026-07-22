package audit_test

import (
	"io"
	"log/slog"
	"path/filepath"
	"testing"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/db"
)

func newTestLogger(t *testing.T, maxEntries int) *audit.Logger {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "audit.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return audit.New(conn, true, maxEntries, logger)
}

func TestQueryFiltersSearchesAndPaginates(t *testing.T) {
	logger := newTestLogger(t, 0)
	entries := []audit.Entry{
		{ActorType: audit.ActorUser, EntryType: audit.EntryWeb, Action: "upload", SourceID: "photos", RelativePath: "trip/a.jpg", IPAddress: "192.0.2.1", Status: audit.StatusSuccess},
		{ActorType: audit.ActorAnonymous, EntryType: audit.EntryAnonymousImageBed, Action: "image_upload", SourceID: "images", RelativePath: "anonymous/b.png", IPAddress: "192.0.2.2", Status: audit.StatusFailed, ErrorCode: "RATE_LIMITED"},
		{ActorType: audit.ActorUser, EntryType: audit.EntryWebDAV, Action: "move", SourceID: "photos", RelativePath: "trip/a.jpg", TargetRelativePath: "trip/b.jpg", IPAddress: "192.0.2.3", Status: audit.StatusSuccess},
		{ActorType: audit.ActorSystem, EntryType: audit.EntryCLI, Action: "export_100%", Status: audit.StatusSuccess},
	}
	for _, entry := range entries {
		logger.Log(entry)
	}

	items, total, err := logger.Query(audit.QueryOptions{
		Page: 1, PageSize: 1, ActorType: audit.ActorUser, Status: audit.StatusSuccess,
	})
	if err != nil {
		t.Fatalf("query audit entries: %v", err)
	}
	if total != 2 || len(items) != 1 || items[0].Action != "move" {
		t.Fatalf("unexpected first page: total=%d items=%+v", total, items)
	}

	items, total, err = logger.Query(audit.QueryOptions{SearchText: "RATE_LIMITED"})
	if err != nil {
		t.Fatalf("search audit entries: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].Action != "image_upload" {
		t.Fatalf("unexpected search result: total=%d items=%+v", total, items)
	}

	items, total, err = logger.Query(audit.QueryOptions{SearchText: "trip/b.jpg"})
	if err != nil {
		t.Fatalf("search target path: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].Action != "move" {
		t.Fatalf("unexpected target path result: total=%d items=%+v", total, items)
	}

	items, total, err = logger.Query(audit.QueryOptions{SearchText: "%"})
	if err != nil {
		t.Fatalf("search literal wildcard: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].Action != "export_100%" {
		t.Fatalf("search wildcard was not escaped: total=%d items=%+v", total, items)
	}
}

func TestLoggerTrimsOldestEntries(t *testing.T) {
	logger := newTestLogger(t, 2)
	for _, action := range []string{"first", "second", "third"} {
		logger.Log(audit.Entry{
			ActorType: audit.ActorSystem, EntryType: audit.EntryCLI,
			Action: action, Status: audit.StatusSuccess,
		})
	}

	items, total, err := logger.Query(audit.QueryOptions{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("query retained audit entries: %v", err)
	}
	if total != 2 || len(items) != 2 || items[0].Action != "third" || items[1].Action != "second" {
		t.Fatalf("unexpected retained entries: total=%d items=%+v", total, items)
	}
}
