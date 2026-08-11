package httpserver

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

type lifecycleGateReader struct {
	started chan struct{}
	release chan struct{}
	once    sync.Once
	sent    bool
}

func (r *lifecycleGateReader) Read(p []byte) (int, error) {
	r.once.Do(func() { close(r.started) })
	<-r.release
	if r.sent {
		return 0, io.EOF
	}
	r.sent = true
	return copy(p, "lifecycle payload"), nil
}

func TestSourceDeletionWaitsForInFlightUpload(t *testing.T) {
	server, source, admin, target := newLifecycleDeleteServer(t)
	reader := &lifecycleGateReader{started: make(chan struct{}), release: make(chan struct{})}
	uploadDone := make(chan error, 1)
	go func() {
		_, _, err := server.files.UploadWithLockTokens(source, "", "source-race.txt", reader, false, nil, &target.ID)
		uploadDone <- err
	}()
	<-reader.started

	deleteDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		req := adminDeleteRequest(admin, "/api/v1/admin/sources/"+source.Key)
		req.SetPathValue("key", source.Key)
		recorder := httptest.NewRecorder()
		server.handleAdminDeleteSource(recorder, req)
		deleteDone <- recorder
	}()
	assertDeleteIsWaiting(t, deleteDone)
	close(reader.release)
	if err := <-uploadDone; err != nil {
		t.Fatalf("UploadWithLockTokens(): %v", err)
	}
	select {
	case recorder := <-deleteDone:
		if recorder.Code != http.StatusOK {
			t.Fatalf("delete source status=%d body=%s", recorder.Code, recorder.Body.String())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("source deletion did not resume after upload")
	}
}

func TestUserDeletionWaitsForInFlightUpload(t *testing.T) {
	server, source, admin, target := newLifecycleDeleteServer(t)
	reader := &lifecycleGateReader{started: make(chan struct{}), release: make(chan struct{})}
	uploadDone := make(chan error, 1)
	go func() {
		_, _, err := server.files.UploadWithLockTokens(source, "", "user-race.txt", reader, false, nil, &target.ID)
		uploadDone <- err
	}()
	<-reader.started

	deleteDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		id := strconv.FormatInt(target.ID, 10)
		req := adminDeleteRequest(admin, "/api/v1/admin/users/"+id)
		req.SetPathValue("id", id)
		recorder := httptest.NewRecorder()
		server.handleAdminDeleteUser(recorder, req)
		deleteDone <- recorder
	}()
	assertDeleteIsWaiting(t, deleteDone)
	close(reader.release)
	if err := <-uploadDone; err != nil {
		t.Fatalf("UploadWithLockTokens(): %v", err)
	}
	select {
	case recorder := <-deleteDone:
		if recorder.Code != http.StatusOK {
			t.Fatalf("delete user status=%d body=%s", recorder.Code, recorder.Body.String())
		}
	case <-time.After(2 * time.Second):
		t.Fatal("user deletion did not resume after upload")
	}
}

func assertDeleteIsWaiting(t *testing.T, done <-chan *httptest.ResponseRecorder) {
	t.Helper()
	select {
	case recorder := <-done:
		t.Fatalf("deletion completed during active upload: status=%d body=%s", recorder.Code, recorder.Body.String())
	case <-time.After(40 * time.Millisecond):
	}
}

func adminDeleteRequest(admin *models.User, target string) *http.Request {
	req := httptest.NewRequest(http.MethodDelete, target, nil)
	return req.WithContext(context.WithValue(req.Context(), currentUserKey, admin))
}

func newLifecycleDeleteServer(t *testing.T) (*Server, *models.StorageSource, *models.User, *models.User) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	userService := users.NewService(conn)
	admin, err := userService.Create("admin", "Admin", "admin-password", models.RoleSuperAdmin)
	if err != nil {
		t.Fatal(err)
	}
	target, err := userService.Create("target", "Target", "target-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	sourceService := sources.NewService(conn, dataDir)
	source, err := sourceService.Create(sources.CreateInput{Name: "Lifecycle", RootPath: root, ExcludePatterns: []string{}, HasPatterns: true})
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return &Server{
		sources: sourceService,
		files:   files.NewService(conn, sourceService, locks.NewManager()),
		users:   userService,
		audit:   audit.New(conn, false, 0, logger),
		proxy:   security.NewProxyResolver(nil),
		logger:  logger,
	}, source, admin, target
}
