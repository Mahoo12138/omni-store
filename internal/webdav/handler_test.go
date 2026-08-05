package webdav

import (
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	lockpkg "github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

type webDAVTestEnv struct {
	handler     *Handler
	fileService *files.Service
	conn        *sql.DB
	sources     *sources.Service
	source      *models.StorageSource
	username    string
	token       string
	root        string
}

func (e *webDAVTestEnv) path(inner string) string {
	return "/dav/" + e.source.Key + inner
}

func newWebDAVTestEnv(t *testing.T) *webDAVTestEnv {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	user, err := users.NewService(conn).Create("dav-user", "DAV User", "test-password", models.RoleUser)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	tokenService := auth.NewTokens(conn)
	token, err := tokenService.Reset(user.ID, auth.TokenTypeWebDAV)
	if err != nil {
		t.Fatalf("create WebDAV token: %v", err)
	}
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatalf("create source root: %v", err)
	}
	sourceService := sources.NewService(conn, dataDir)
	source, err := sourceService.Create(sources.CreateInput{Name: "Team Files", RootPath: root})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	if _, err := sourceService.CreatePolicy(sources.PolicyInput{
		Name: "WebDAV test", UserIDs: []int64{user.ID},
		Sources: []sources.PolicySourceInput{{SourceKey: source.Key, Permission: models.PermissionReadWrite}},
	}); err != nil {
		t.Fatalf("create access policy: %v", err)
	}
	fileService := files.NewService(conn, sourceService, lockpkg.NewManager())
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := New(tokenService, sourceService, fileService, audit.New(conn, true, 100, logger),
		security.NewProxyResolver([]string{"127.0.0.1"}), logger, 10)
	return &webDAVTestEnv{handler: handler, fileService: fileService, conn: conn, sources: sourceService,
		source: source, username: user.Username, token: token, root: root}
}

func (e *webDAVTestEnv) request(t *testing.T, method, requestPath, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, requestPath, strings.NewReader(body))
	req.SetBasicAuth(e.username, e.token)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	e.handler.ServeHTTP(recorder, req)
	return recorder
}

const exclusiveLockBody = `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:exclusive/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
  <D:owner><D:href>urn:omnistore:test-owner</D:href></D:owner>
</D:lockinfo>`

func TestPersistentWebDAVLockLifecycleAndWriteEnforcement(t *testing.T) {
	env := newWebDAVTestEnv(t)
	if err := os.WriteFile(filepath.Join(env.root, "document.txt"), []byte("before"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	options := env.request(t, "OPTIONS", env.path("/document.txt"), "", nil)
	if options.Code != http.StatusOK || options.Header().Get("DAV") != "1, 2" || !strings.Contains(options.Header().Get("Allow"), "LOCK") {
		t.Fatalf("unexpected OPTIONS response: status=%d DAV=%q Allow=%q", options.Code, options.Header().Get("DAV"), options.Header().Get("Allow"))
	}

	locked := env.request(t, "LOCK", env.path("/document.txt"), exclusiveLockBody, map[string]string{
		"Depth": "0", "Timeout": "Second-120", "Content-Type": "application/xml",
	})
	if locked.Code != http.StatusOK {
		t.Fatalf("LOCK failed: status=%d body=%s", locked.Code, locked.Body.String())
	}
	lockToken := strings.Trim(locked.Header().Get("Lock-Token"), "<>")
	if !strings.HasPrefix(lockToken, "urn:uuid:") || !strings.Contains(locked.Body.String(), "lockdiscovery") {
		t.Fatalf("invalid LOCK response: token=%q body=%s", lockToken, locked.Body.String())
	}

	if _, _, err := env.fileService.Upload(env.source, "", "document.txt", strings.NewReader("rest write"), true); !errors.Is(err, files.ErrLocked) {
		t.Fatalf("non-WebDAV write bypassed persistent lock: %v", err)
	}
	restartedFileService := files.NewService(env.conn, env.sources, lockpkg.NewManager())
	if _, _, err := restartedFileService.Upload(env.source, "", "document.txt", strings.NewReader("restart write"), true); !errors.Is(err, files.ErrLocked) {
		t.Fatalf("lock did not survive service restart: %v", err)
	}
	otherUser, err := users.NewService(env.conn).Create("other-user", "Other User", "test-password", models.RoleUser)
	if err != nil {
		t.Fatalf("create other user: %v", err)
	}
	if _, _, err := env.fileService.UploadWithLockTokens(env.source, "", "document.txt", strings.NewReader("other"), true,
		[]string{lockToken}, &otherUser.ID); !errors.Is(err, files.ErrLocked) {
		t.Fatalf("another user reused the lock token: %v", err)
	}
	withoutToken := env.request(t, http.MethodPut, env.path("/document.txt"), "blocked", nil)
	if withoutToken.Code != http.StatusLocked {
		t.Fatalf("PUT without token status=%d body=%s", withoutToken.Code, withoutToken.Body.String())
	}
	withToken := env.request(t, http.MethodPut, env.path("/document.txt"), "updated", map[string]string{"If": "(<" + lockToken + ">)"})
	if withToken.Code != http.StatusCreated {
		t.Fatalf("PUT with token status=%d body=%s", withToken.Code, withToken.Body.String())
	}

	conflict := env.request(t, "LOCK", env.path("/document.txt"), exclusiveLockBody, map[string]string{"Depth": "0"})
	if conflict.Code != http.StatusLocked {
		t.Fatalf("conflicting LOCK status=%d", conflict.Code)
	}
	refresh := env.request(t, "LOCK", env.path("/document.txt"), "", map[string]string{"If": "(<" + lockToken + ">)", "Timeout": "Second-240"})
	if refresh.Code != http.StatusOK || refresh.Header().Get("Lock-Token") != "" {
		t.Fatalf("refresh status=%d lock-token=%q body=%s", refresh.Code, refresh.Header().Get("Lock-Token"), refresh.Body.String())
	}
	propfind := env.request(t, "PROPFIND", env.path("/document.txt"), "", map[string]string{"Depth": "0"})
	if propfind.Code != http.StatusMultiStatus || !strings.Contains(propfind.Body.String(), lockToken) || !strings.Contains(propfind.Body.String(), "supportedlock") {
		t.Fatalf("PROPFIND missing lock properties: status=%d body=%s", propfind.Code, propfind.Body.String())
	}

	wrongPath := env.request(t, "UNLOCK", env.path("/other.txt"), "", map[string]string{"Lock-Token": "<" + lockToken + ">"})
	if wrongPath.Code != http.StatusConflict {
		t.Fatalf("UNLOCK wrong path status=%d", wrongPath.Code)
	}
	unlocked := env.request(t, "UNLOCK", env.path("/document.txt"), "", map[string]string{"Lock-Token": "<" + lockToken + ">"})
	if unlocked.Code != http.StatusNoContent {
		t.Fatalf("UNLOCK status=%d body=%s", unlocked.Code, unlocked.Body.String())
	}
	if _, _, err := env.fileService.Upload(env.source, "", "document.txt", strings.NewReader("after"), true); err != nil {
		t.Fatalf("write remained locked after UNLOCK: %v", err)
	}
}

func TestDepthInfinityAndLockNullResource(t *testing.T) {
	env := newWebDAVTestEnv(t)
	if err := os.Mkdir(filepath.Join(env.root, "folder"), 0o755); err != nil {
		t.Fatalf("create folder: %v", err)
	}
	locked := env.request(t, "LOCK", env.path("/folder"), exclusiveLockBody, nil)
	if locked.Code != http.StatusOK {
		t.Fatalf("LOCK collection: status=%d body=%s", locked.Code, locked.Body.String())
	}
	token := strings.Trim(locked.Header().Get("Lock-Token"), "<>")
	if _, _, err := env.fileService.Upload(env.source, "folder", "child.txt", strings.NewReader("x"), false); !errors.Is(err, files.ErrLocked) {
		t.Fatalf("Depth infinity did not protect descendant: %v", err)
	}
	put := env.request(t, http.MethodPut, env.path("/folder/child.txt"), "x", map[string]string{"If": "(<" + token + ">)"})
	if put.Code != http.StatusCreated {
		t.Fatalf("PUT descendant with token: status=%d body=%s", put.Code, put.Body.String())
	}

	if unlock := env.request(t, "UNLOCK", env.path("/folder"), "", map[string]string{"Lock-Token": "<" + token + ">"}); unlock.Code != http.StatusNoContent {
		t.Fatalf("UNLOCK collection status=%d", unlock.Code)
	}
	lockNull := env.request(t, "LOCK", env.path("/new-empty.txt"), exclusiveLockBody, map[string]string{"Depth": "0"})
	if lockNull.Code != http.StatusCreated {
		t.Fatalf("LOCK unmapped URL: status=%d body=%s", lockNull.Code, lockNull.Body.String())
	}
	info, err := os.Stat(filepath.Join(env.root, "new-empty.txt"))
	if err != nil || info.Size() != 0 {
		t.Fatalf("lock-null resource was not created: info=%v err=%v", info, err)
	}
}

func TestMoveDropsSourceLockInsteadOfMovingIt(t *testing.T) {
	env := newWebDAVTestEnv(t)
	if err := os.WriteFile(filepath.Join(env.root, "before.txt"), []byte("before"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	locked := env.request(t, "LOCK", env.path("/before.txt"), exclusiveLockBody, map[string]string{"Depth": "0"})
	if locked.Code != http.StatusOK {
		t.Fatalf("LOCK status=%d body=%s", locked.Code, locked.Body.String())
	}
	token := strings.Trim(locked.Header().Get("Lock-Token"), "<>")
	moved := env.request(t, "MOVE", env.path("/before.txt"), "", map[string]string{
		"Destination": env.path("/after.txt"),
		"If":          "(<" + token + ">)",
	})
	if moved.Code != http.StatusCreated {
		t.Fatalf("MOVE status=%d body=%s", moved.Code, moved.Body.String())
	}
	var count int
	if err := env.conn.QueryRow(`SELECT COUNT(*) FROM webdav_locks WHERE storage_source_id = ?`, env.source.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("MOVE retained or moved source lock: count=%d err=%v", count, err)
	}
	put := env.request(t, http.MethodPut, env.path("/after.txt"), "updated", nil)
	if put.Code != http.StatusCreated {
		t.Fatalf("destination remained locked after MOVE: status=%d body=%s", put.Code, put.Body.String())
	}
}

func TestDeleteCleansRemovedLockRootsButKeepsAncestorLock(t *testing.T) {
	env := newWebDAVTestEnv(t)
	if err := os.Mkdir(filepath.Join(env.root, "folder"), 0o755); err != nil {
		t.Fatalf("create folder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(env.root, "folder", "child.txt"), []byte("child"), 0o644); err != nil {
		t.Fatalf("write child: %v", err)
	}
	locked := env.request(t, "LOCK", env.path("/folder"), exclusiveLockBody, nil)
	if locked.Code != http.StatusOK {
		t.Fatalf("LOCK status=%d body=%s", locked.Code, locked.Body.String())
	}
	token := strings.Trim(locked.Header().Get("Lock-Token"), "<>")
	deletedChild := env.request(t, http.MethodDelete, env.path("/folder/child.txt"), "", map[string]string{
		"If": "(<" + token + ">)",
	})
	if deletedChild.Code != http.StatusNoContent {
		t.Fatalf("DELETE child status=%d body=%s", deletedChild.Code, deletedChild.Body.String())
	}
	var count int
	if err := env.conn.QueryRow(`SELECT COUNT(*) FROM webdav_locks WHERE token = ?`, token).Scan(&count); err != nil || count != 1 {
		t.Fatalf("DELETE child removed ancestor lock: count=%d err=%v", count, err)
	}
	deletedRoot := env.request(t, http.MethodDelete, env.path("/folder"), "", map[string]string{
		"If": "(<" + token + ">)",
	})
	if deletedRoot.Code != http.StatusNoContent {
		t.Fatalf("DELETE lock root status=%d body=%s", deletedRoot.Code, deletedRoot.Body.String())
	}
	if err := env.conn.QueryRow(`SELECT COUNT(*) FROM webdav_locks WHERE token = ?`, token).Scan(&count); err != nil || count != 0 {
		t.Fatalf("DELETE retained removed resource lock: count=%d err=%v", count, err)
	}
}

func TestExpiredPersistentLockIsCleanedLazily(t *testing.T) {
	env := newWebDAVTestEnv(t)
	if err := os.WriteFile(filepath.Join(env.root, "expires.txt"), []byte("before"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	locked := env.request(t, "LOCK", env.path("/expires.txt"), exclusiveLockBody, map[string]string{"Depth": "0"})
	if locked.Code != http.StatusOK {
		t.Fatalf("LOCK status=%d body=%s", locked.Code, locked.Body.String())
	}
	if _, err := env.conn.Exec(`UPDATE webdav_locks SET expires_at = datetime('now', '-1 second')`); err != nil {
		t.Fatalf("expire lock: %v", err)
	}
	if _, _, err := env.fileService.Upload(env.source, "", "expires.txt", strings.NewReader("after"), true); err != nil {
		t.Fatalf("expired lock still blocked write: %v", err)
	}
	var count int
	if err := env.conn.QueryRow(`SELECT COUNT(*) FROM webdav_locks`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired lock was not removed: count=%d err=%v", count, err)
	}
}

func TestExtractLockTokensRejectsNegatedConditions(t *testing.T) {
	token := "urn:uuid:11111111-1111-4111-8111-111111111111"
	if got := extractLockTokens("(Not <" + token + ">)"); len(got) != 0 {
		t.Fatalf("negated token was submitted: %v", got)
	}
	if got := extractLockTokens("(Not\t<" + token + ">)"); len(got) != 0 {
		t.Fatalf("tab-separated negated token was submitted: %v", got)
	}
	got := extractLockTokens("</dav/team-files/file> (<" + token + ">)")
	if len(got) != 1 || got[0] != token {
		t.Fatalf("valid token not extracted: %v", got)
	}
}
