package httpserver

import (
	"bytes"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

type privateFileAPIFixture struct {
	handler http.Handler
	cookie  *http.Cookie
	csrf    string
	primary *models.StorageSource
	archive *models.StorageSource
}

func TestPrivateFileAPILifecycle(t *testing.T) {
	fixture := newPrivateFileAPIFixture(t)
	primaryBase := "/api/v1/sources/" + fixture.primary.Key
	archiveBase := "/api/v1/sources/" + fixture.archive.Key

	sourceList := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/sources", "", fixture.cookie, "")
	if sourceList.Code != http.StatusOK || !strings.Contains(sourceList.Body.String(), fixture.primary.Key) || !strings.Contains(sourceList.Body.String(), fixture.archive.Key) {
		t.Fatalf("source list status=%d body=%s", sourceList.Code, sourceList.Body.String())
	}
	permission := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/permission?path=%2F", "", fixture.cookie, "")
	if permission.Code != http.StatusOK || !strings.Contains(permission.Body.String(), `"permission":"read_write"`) {
		t.Fatalf("permission status=%d body=%s", permission.Code, permission.Body.String())
	}

	missingCSRF := serveTestRequest(t, fixture.handler, http.MethodPost, primaryBase+"/folders", `{"path":"/","name":"docs"}`, fixture.cookie, "")
	assertErrorResponse(t, missingCSRF, http.StatusForbidden, CodeForbidden)
	createFolder := serveTestRequest(t, fixture.handler, http.MethodPost, primaryBase+"/folders", `{"path":"/","name":"docs"}`, fixture.cookie, fixture.csrf)
	if createFolder.Code != http.StatusOK || !strings.Contains(createFolder.Body.String(), `"path":"/docs"`) {
		t.Fatalf("create folder status=%d body=%s", createFolder.Code, createFolder.Body.String())
	}

	content := []byte("OmniStore HTTP integration")
	upload := serveMultipartUpload(t, fixture, primaryBase+"/upload?path=%2Fdocs", "note.txt", content)
	if upload.Code != http.StatusOK || !strings.Contains(upload.Body.String(), `"path":"/docs/note.txt"`) {
		t.Fatalf("upload status=%d body=%s", upload.Code, upload.Body.String())
	}
	duplicate := serveMultipartUpload(t, fixture, primaryBase+"/upload?path=%2Fdocs", "note.txt", content)
	assertErrorResponse(t, duplicate, http.StatusConflict, CodeFileAlreadyExists)

	list := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/files?path=%2Fdocs&page=1&page_size=20", "", fixture.cookie, "")
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), `"name":"note.txt"`) || !strings.Contains(list.Body.String(), `"total":1`) {
		t.Fatalf("file list status=%d body=%s", list.Code, list.Body.String())
	}
	stat := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/files/stat?path=%2Fdocs%2Fnote.txt", "", fixture.cookie, "")
	if stat.Code != http.StatusOK || !strings.Contains(stat.Body.String(), `"size":26`) {
		t.Fatalf("stat status=%d body=%s", stat.Code, stat.Body.String())
	}

	rangeRequest := httptest.NewRequest(http.MethodGet, primaryBase+"/download?path=%2Fdocs%2Fnote.txt", nil)
	rangeRequest.AddCookie(fixture.cookie)
	rangeRequest.Header.Set("Range", "bytes=0-8")
	rangeResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(rangeResponse, rangeRequest)
	if rangeResponse.Code != http.StatusPartialContent || rangeResponse.Body.String() != "OmniStore" || rangeResponse.Header().Get("Content-Range") != "bytes 0-8/26" {
		t.Fatalf("range download status=%d headers=%v body=%q", rangeResponse.Code, rangeResponse.Header(), rangeResponse.Body.String())
	}
	if rangeResponse.Header().Get("Cache-Control") != "private, no-store" || !strings.Contains(rangeResponse.Header().Get("Content-Disposition"), "note.txt") {
		t.Fatalf("unexpected private download headers: %v", rangeResponse.Header())
	}

	rename := serveTestRequest(t, fixture.handler, http.MethodPost, primaryBase+"/files/rename", `{"path":"/docs/note.txt","new_name":"renamed.txt"}`, fixture.cookie, fixture.csrf)
	if rename.Code != http.StatusOK || !strings.Contains(rename.Body.String(), `"path":"/docs/renamed.txt"`) {
		t.Fatalf("rename status=%d body=%s", rename.Code, rename.Body.String())
	}
	copyBody := `{"path":"/docs/renamed.txt","target_source_key":"` + fixture.archive.Key + `","target_path":"/copied.txt"}`
	copyResponse := serveTestRequest(t, fixture.handler, http.MethodPost, primaryBase+"/files/copy", copyBody, fixture.cookie, fixture.csrf)
	if copyResponse.Code != http.StatusOK || !strings.Contains(copyResponse.Body.String(), `"path":"/copied.txt"`) {
		t.Fatalf("copy status=%d body=%s", copyResponse.Code, copyResponse.Body.String())
	}
	moveBody := `{"path":"/copied.txt","target_source_key":"` + fixture.primary.Key + `","target_path":"/moved.txt"}`
	moveResponse := serveTestRequest(t, fixture.handler, http.MethodPost, archiveBase+"/files/move", moveBody, fixture.cookie, fixture.csrf)
	if moveResponse.Code != http.StatusOK || !strings.Contains(moveResponse.Body.String(), `"path":"/moved.txt"`) {
		t.Fatalf("move status=%d body=%s", moveResponse.Code, moveResponse.Body.String())
	}

	search := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/search?q=moved&source_key="+url.QueryEscape(fixture.primary.Key)+"&page=1&page_size=20", "", fixture.cookie, "")
	if search.Code != http.StatusOK || !strings.Contains(search.Body.String(), `"name":"moved.txt"`) {
		t.Fatalf("search status=%d body=%s", search.Code, search.Body.String())
	}

	trashKey := deleteFileAndGetTrashKey(t, fixture, primaryBase, "/moved.txt")
	trash := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/trash", "", fixture.cookie, "")
	if trash.Code != http.StatusOK || !strings.Contains(trash.Body.String(), trashKey) || !strings.Contains(trash.Body.String(), "moved.txt") {
		t.Fatalf("trash list status=%d body=%s", trash.Code, trash.Body.String())
	}
	restore := serveTestRequest(t, fixture.handler, http.MethodPost, primaryBase+"/trash/"+trashKey+"/restore", `{"target_path":"/restored.txt"}`, fixture.cookie, fixture.csrf)
	if restore.Code != http.StatusOK || !strings.Contains(restore.Body.String(), "restored.txt") {
		t.Fatalf("restore status=%d body=%s", restore.Code, restore.Body.String())
	}
	restoredStat := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/files/stat?path=%2Frestored.txt", "", fixture.cookie, "")
	if restoredStat.Code != http.StatusOK {
		t.Fatalf("restored stat status=%d body=%s", restoredStat.Code, restoredStat.Body.String())
	}

	restoredTrashKey := deleteFileAndGetTrashKey(t, fixture, primaryBase, "/restored.txt")
	purge := serveTestRequest(t, fixture.handler, http.MethodDelete, primaryBase+"/trash/"+restoredTrashKey, "", fixture.cookie, fixture.csrf)
	if purge.Code != http.StatusOK || !strings.Contains(purge.Body.String(), `"ok":true`) {
		t.Fatalf("purge status=%d body=%s", purge.Code, purge.Body.String())
	}
	afterPurge := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/files/stat?path=%2Frestored.txt", "", fixture.cookie, "")
	assertErrorResponse(t, afterPurge, http.StatusNotFound, CodeFileNotFound)

	unknownSource := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/sources/src-does-not-exist/files?path=%2F", "", fixture.cookie, "")
	assertErrorResponse(t, unknownSource, http.StatusNotFound, CodeSourceNotFound)
	invalidPath := serveTestRequest(t, fixture.handler, http.MethodGet, primaryBase+"/permission?path=..%2Fsecret", "", fixture.cookie, "")
	assertErrorResponse(t, invalidPath, http.StatusBadRequest, CodePathInvalid)
	shortSearch := serveTestRequest(t, fixture.handler, http.MethodGet, "/api/v1/search?q=x", "", fixture.cookie, "")
	assertErrorResponse(t, shortSearch, http.StatusBadRequest, CodeValidationError)
	invalidUpload := serveTestRequest(t, fixture.handler, http.MethodPost, primaryBase+"/upload?path=%2Fdocs", `{"file":"not-multipart"}`, fixture.cookie, fixture.csrf)
	assertErrorResponse(t, invalidUpload, http.StatusBadRequest, CodeValidationError)
}

func newPrivateFileAPIFixture(t *testing.T) privateFileAPIFixture {
	t.Helper()
	baseDir := t.TempDir()
	dataDir := filepath.Join(baseDir, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	cfg := config.Default()
	cfg.Data.Dir = dataDir
	cfg.Database.Path = filepath.Join(dataDir, "omnistore.db")
	cfg.Server.PublicURL = "http://example.test"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	httpServer, app := New(cfg, conn, logger)

	user, err := app.users.Create("file-user", "File API User", "file-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	createSource := func(name string) *models.StorageSource {
		root := filepath.Join(baseDir, strings.ToLower(name))
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}
		source, err := app.sources.Create(sources.CreateInput{Name: name, RootPath: root})
		if err != nil {
			t.Fatal(err)
		}
		return source
	}
	primary := createSource("Primary")
	archive := createSource("Archive")
	_, err = app.sources.CreatePolicy(sources.PolicyInput{
		Name:    "File API read-write",
		UserIDs: []int64{user.ID},
		Sources: []sources.PolicySourceInput{
			{SourceKey: primary.Key, Permission: models.PermissionReadWrite},
			{SourceKey: archive.Key, Permission: models.PermissionReadWrite},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	sessionID, csrf, err := app.sessions.Create(user.ID, "integration-test", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	return privateFileAPIFixture{
		handler: httpServer.Handler,
		cookie:  &http.Cookie{Name: SessionCookieName(), Value: sessionID},
		csrf:    csrf,
		primary: primary,
		archive: archive,
	}
}

func serveMultipartUpload(t *testing.T, fixture privateFileAPIFixture, target, filename string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, target, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("X-CSRF-Token", fixture.csrf)
	request.AddCookie(fixture.cookie)
	recorder := httptest.NewRecorder()
	fixture.handler.ServeHTTP(recorder, request)
	return recorder
}

func deleteFileAndGetTrashKey(t *testing.T, fixture privateFileAPIFixture, sourceBase, path string) string {
	t.Helper()
	response := serveTestRequest(t, fixture.handler, http.MethodDelete, sourceBase+"/files?path="+url.QueryEscape(path), "", fixture.cookie, fixture.csrf)
	if response.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", response.Code, response.Body.String())
	}
	var envelope struct {
		Data struct {
			Key string `json:"key"`
		} `json:"data"`
	}
	decodeTestJSON(t, response, &envelope)
	if envelope.Data.Key == "" {
		t.Fatalf("delete response missing trash key: %s", response.Body.String())
	}
	return envelope.Data.Key
}
