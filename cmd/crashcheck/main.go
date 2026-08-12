// Command crashcheck runs destructive process-level crash recovery acceptance
// checks against isolated OmniStore fixtures. It is intentionally excluded from
// the normal unit-test path and is invoked by scripts/verify-crash-recovery.sh.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"io"
	"math/rand/v2"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const (
	adminUsername        = "admin"
	adminPassword        = "OmniStore-Test-Admin!"
	reservedSentinel     = ".omnistore-upload-0123456789abcdef.tmp"
	reservedSentinelData = "user-owned reserved-name sentinel"
)

type scenario struct {
	name       string
	journalDir string
	ready      func(*fixture) bool
	prepare    func(*fixture) error
	request    func(*fixture) (*http.Request, error)
	verify     func(*fixture) error
}

type fixture struct {
	root       string
	dataDir    string
	sourcesDir string
	publicRoot string
	teamRoot   string
	configPath string
	httpAddr   string
	s3Addr     string
	baseURL    string
	serverBin  string
	seedBin    string
	server     *exec.Cmd
	client     *http.Client
	csrf       string
	publicKey  string
	teamKey    string
	trashKey   string
	protocol   protocolCredentials
	partETag   string
	uploadID   string
}

type protocolCredentials struct {
	S3Endpoint      string `json:"s3_endpoint"`
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	Region          string `json:"region"`
	TeamBucket      string `json:"team_bucket"`
}

type envelope[T any] struct {
	Data T `json:"data"`
}

type sourceItem struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

type trashItem struct {
	Key string `json:"key"`
}

func main() {
	serverBin := flag.String("server", "", "path to the omnistore binary")
	seedBin := flag.String("seed", "", "path to the testenv binary")
	rounds := flag.Int("rounds", 3, "random SIGKILL rounds per scenario")
	flag.Parse()
	if *serverBin == "" || *seedBin == "" || *rounds < 1 {
		fatal(errors.New("--server, --seed and positive --rounds are required"))
	}

	scenarios := crashScenarios()
	completed := 0
	for _, item := range scenarios {
		for round := 1; round <= *rounds; round++ {
			if err := runScenario(item, round, *serverBin, *seedBin); err != nil {
				fatal(fmt.Errorf("%s round %d: %w", item.name, round, err))
			}
			completed++
			fmt.Printf("ok  %-22s round %d/%d\n", item.name, round, *rounds)
		}
	}
	fmt.Printf("crash recovery acceptance passed: %d SIGKILL rounds\n", completed)
}

func runScenario(item scenario, round int, serverBin, seedBin string) error {
	root, err := os.MkdirTemp("", "omnistore-crashcheck-")
	if err != nil {
		return err
	}
	root, err = filepath.EvalSymlinks(root)
	if err != nil {
		return err
	}
	f := &fixture{
		root: root, dataDir: filepath.Join(root, "data"), sourcesDir: filepath.Join(root, "sources"),
		publicRoot: filepath.Join(root, "sources", "public-demo"), teamRoot: filepath.Join(root, "sources", "team-files"),
		configPath: filepath.Join(root, "config.yaml"), serverBin: serverBin, seedBin: seedBin,
	}
	keep := true
	defer func() {
		f.stop()
		if !keep {
			_ = os.RemoveAll(root)
		} else {
			fmt.Fprintf(os.Stderr, "crashcheck evidence retained at %s\n", root)
		}
	}()
	if err := f.initialize(item); err != nil {
		return err
	}
	if item.prepare != nil {
		if err := item.prepare(f); err != nil {
			return err
		}
	}
	req, err := item.request(f)
	if err != nil {
		return err
	}
	requestContext, cancelRequest := context.WithCancel(req.Context())
	defer cancelRequest()
	req = req.WithContext(requestContext)

	done := make(chan error, 1)
	go func() {
		response, requestErr := f.client.Do(req)
		if response != nil {
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
			if requestErr == nil && response.StatusCode >= 400 {
				requestErr = fmt.Errorf("operation returned HTTP %d", response.StatusCode)
			}
		}
		done <- requestErr
	}()

	journalPath := filepath.Join(f.dataDir, item.journalDir)
	deadline := time.Now().Add(3 * time.Second)
	requestFinished := false
	for time.Now().Before(deadline) {
		operationReady := directoryHasEntries(journalPath)
		if item.ready != nil {
			operationReady = item.ready(f)
		}
		if operationReady {
			break
		}
		select {
		case requestErr := <-done:
			if requestErr != nil {
				return requestErr
			}
			requestFinished = true
			deadline = time.Time{}
		default:
			time.Sleep(time.Millisecond)
		}
	}
	// Kill after a random interval once the operation journal is visible. Fast
	// operations may already be committed; that is a valid post-commit endpoint.
	time.Sleep(time.Duration(rand.IntN(16)) * time.Millisecond)
	if !requestFinished {
		select {
		case requestErr := <-done:
			if requestErr != nil {
				return requestErr
			}
			requestFinished = true
		default:
		}
	}
	if err := f.kill(); err != nil {
		return err
	}
	cancelRequest()
	if !requestFinished {
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			return errors.New("operation request did not unblock after SIGKILL")
		}
	}
	if err := f.start(); err != nil {
		return fmt.Errorf("restart and recover: %w", err)
	}
	if err := auditFixture(f); err != nil {
		return err
	}
	if err := item.verify(f); err != nil {
		return err
	}
	keep = false
	return nil
}

func (f *fixture) initialize(item scenario) error {
	httpAddr, err := freeAddress()
	if err != nil {
		return err
	}
	s3Addr, err := freeAddress()
	if err != nil {
		return err
	}
	f.httpAddr, f.s3Addr = httpAddr, s3Addr
	f.baseURL = "http://" + httpAddr
	config := fmt.Sprintf(`server:
  http_addr: %q
  public_url: %q
  s3_addr: %q
  s3_enabled: true
data:
  dir: %q
database:
  path: %q
security:
  cookie_secure: false
  session_ttl_hours: 1
  login_rate_limit:
    enabled: false
upload:
  max_file_size_mb: 64
image_bed:
  root_path: "/images"
  user_max_file_size_mb: 32
  anonymous_max_file_size_mb: 5
  anonymous_rate_limit:
    enabled: false
audit:
  enabled: false
log:
  level: "error"
`, httpAddr, f.baseURL, s3Addr, f.dataDir, filepath.Join(f.dataDir, "omnistore.db"))
	if err := os.WriteFile(f.configPath, []byte(config), 0o600); err != nil {
		return err
	}
	if err := seedScenarioFiles(f, item.name); err != nil {
		return err
	}
	seed := exec.Command(f.seedBin, "seed", "--config", f.configPath, "--fixtures", f.sourcesDir)
	seed.Env = append(os.Environ(), "OMNISTORE_MASTER_KEY=01234567890123456789012345678901")
	if output, err := seed.CombinedOutput(); err != nil {
		return fmt.Errorf("seed: %w: %s", err, output)
	}
	protocolData, err := os.ReadFile(filepath.Join(f.root, "protocol-credentials.json"))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(protocolData, &f.protocol); err != nil {
		return err
	}
	if err := f.start(); err != nil {
		return err
	}
	jar, _ := cookiejar.New(nil)
	f.client = &http.Client{Jar: jar, Timeout: 45 * time.Second}
	if err := f.login(); err != nil {
		return err
	}
	if err := f.loadSources(); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(f.teamRoot, reservedSentinel), []byte(reservedSentinelData), 0o600)
}

func seedScenarioFiles(f *fixture, name string) error {
	for _, root := range []string{f.publicRoot, f.teamRoot} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			return err
		}
	}
	content := bytes.Repeat([]byte("0123456789abcdef"), 4096)
	seedTree := func(root, dir string) error {
		for index := 0; index < 96; index++ {
			path := filepath.Join(root, dir, fmt.Sprintf("file-%03d.bin", index))
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				return err
			}
			if err := os.WriteFile(path, content, 0o600); err != nil {
				return err
			}
		}
		return nil
	}
	switch name {
	case "overwrite upload":
		return os.WriteFile(filepath.Join(f.teamRoot, "overwrite.bin"), []byte("old-content"), 0o600)
	case "directory copy", "same-source move", "trash":
		return seedTree(f.teamRoot, "subject")
	case "cross-source move":
		return seedTree(f.teamRoot, "subject")
	case "restore", "permanent delete":
		return seedTree(f.teamRoot, "subject")
	case "multipart complete", "image upload":
		return nil
	default:
		return fmt.Errorf("unknown scenario %q", name)
	}
}

func (f *fixture) start() error {
	cmd := exec.Command(f.serverBin, "server", "--config", f.configPath)
	cmd.Env = append(os.Environ(), "OMNISTORE_MASTER_KEY=01234567890123456789012345678901")
	logFile, err := os.OpenFile(filepath.Join(f.root, "server.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	cmd.Stdout, cmd.Stderr = logFile, logFile
	if err := cmd.Start(); err != nil {
		_ = logFile.Close()
		return err
	}
	_ = logFile.Close()
	f.server = cmd
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get(f.baseURL + "/api/v1/health")
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return nil
			}
		}
		if cmd.ProcessState != nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	return fmt.Errorf("server did not become healthy; see %s", filepath.Join(f.root, "server.log"))
}

func (f *fixture) kill() error {
	if f.server == nil || f.server.Process == nil {
		return errors.New("server is not running")
	}
	err := f.server.Process.Kill()
	_ = f.server.Wait()
	f.server = nil
	return err
}

func (f *fixture) stop() {
	if f.server != nil && f.server.Process != nil {
		_ = f.server.Process.Kill()
		_ = f.server.Wait()
		f.server = nil
	}
}

func (f *fixture) login() error {
	body := strings.NewReader(`{"username":"` + adminUsername + `","password":"` + adminPassword + `"}`)
	req, _ := http.NewRequest(http.MethodPost, f.baseURL+"/api/v1/auth/login", body)
	req.Header.Set("Content-Type", "application/json")
	response, err := f.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(response.Body)
		return fmt.Errorf("login HTTP %d: %s", response.StatusCode, data)
	}
	var result envelope[struct {
		CSRF string `json:"csrf_token"`
	}]
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return err
	}
	f.csrf = result.Data.CSRF
	return nil
}

func (f *fixture) loadSources() error {
	response, err := f.client.Get(f.baseURL + "/api/v1/sources")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var result envelope[struct {
		Items []sourceItem `json:"items"`
	}]
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return err
	}
	for _, item := range result.Data.Items {
		switch item.Name {
		case "公开演示资料":
			f.publicKey = item.Key
		case "团队文件":
			f.teamKey = item.Key
		}
	}
	if f.publicKey == "" || f.teamKey == "" {
		return errors.New("seeded sources not found")
	}
	return nil
}

func (f *fixture) apiRequest(method, path string, body io.Reader, contentType string) (*http.Request, error) {
	req, err := http.NewRequest(method, f.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if method != http.MethodGet && method != http.MethodHead {
		req.Header.Set("X-CSRF-Token", f.csrf)
	}
	return req, nil
}

func crashScenarios() []scenario {
	return []scenario{
		{name: "overwrite upload", journalDir: "operations/file-uploads", ready: uploadTempVisible, request: requestOverwrite, verify: verifyOverwrite},
		{name: "directory copy", journalDir: "operations/copies", request: requestCopy, verify: verifyCopy},
		{name: "cross-source move", journalDir: "operations/transfers", request: requestCrossMove, verify: verifyCrossMove},
		{name: "same-source move", journalDir: "operations/paths", request: requestSameMove, verify: verifySameMove},
		{name: "trash", journalDir: "trash/.operations", request: requestTrash, verify: verifyTrash},
		{name: "restore", journalDir: "trash/.operations", prepare: prepareTrash, request: requestRestore, verify: verifyRestore},
		{name: "permanent delete", journalDir: "trash/.operations", prepare: prepareTrash, request: requestPurge, verify: verifyPurge},
		{name: "multipart complete", journalDir: "operations/s3-multipart-completions", prepare: prepareMultipart, request: requestMultipartComplete, verify: verifyMultipart},
		{name: "image upload", journalDir: "operations/image-uploads", ready: uploadTempVisible, request: requestImageUpload, verify: verifyImageUpload},
	}
}

func uploadTempVisible(f *fixture) bool {
	for _, root := range []string{f.publicRoot, f.teamRoot} {
		found := false
		_ = filepath.WalkDir(root, func(_ string, entry os.DirEntry, err error) error {
			if err != nil || entry.IsDir() || entry.Name() == reservedSentinel {
				return nil
			}
			if strings.HasPrefix(entry.Name(), ".omnistore-upload-") && strings.HasSuffix(entry.Name(), ".tmp") {
				found = true
				return filepath.SkipAll
			}
			return nil
		})
		if found {
			return true
		}
	}
	return false
}

func requestOverwrite(f *fixture) (*http.Request, error) {
	return multipartRequest(f, "/api/v1/sources/"+f.teamKey+"/upload?path=%2F&overwrite=true", "overwrite.bin", largePayload())
}

func requestCopy(f *fixture) (*http.Request, error) {
	body := fmt.Sprintf(`{"path":"/subject","target_source_key":%q,"target_path":"/copied"}`, f.teamKey)
	return f.apiRequest(http.MethodPost, "/api/v1/sources/"+f.teamKey+"/files/copy", strings.NewReader(body), "application/json")
}

func requestCrossMove(f *fixture) (*http.Request, error) {
	body := fmt.Sprintf(`{"path":"/subject","target_source_key":%q,"target_path":"/moved"}`, f.publicKey)
	return f.apiRequest(http.MethodPost, "/api/v1/sources/"+f.teamKey+"/files/move", strings.NewReader(body), "application/json")
}

func requestSameMove(f *fixture) (*http.Request, error) {
	body := fmt.Sprintf(`{"path":"/subject","target_source_key":%q,"target_path":"/moved"}`, f.teamKey)
	return f.apiRequest(http.MethodPost, "/api/v1/sources/"+f.teamKey+"/files/move", strings.NewReader(body), "application/json")
}

func requestTrash(f *fixture) (*http.Request, error) {
	return f.apiRequest(http.MethodDelete, "/api/v1/sources/"+f.teamKey+"/files?path=%2Fsubject", nil, "")
}

func prepareTrash(f *fixture) error {
	req, _ := f.apiRequest(http.MethodDelete, "/api/v1/sources/"+f.teamKey+"/files?path=%2Fsubject", nil, "")
	response, err := f.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("prepare trash HTTP %d", response.StatusCode)
	}
	var result envelope[trashItem]
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return err
	}
	f.trashKey = result.Data.Key
	if f.trashKey == "" {
		return errors.New("prepare trash response omitted key")
	}
	return nil
}

func requestRestore(f *fixture) (*http.Request, error) {
	return f.apiRequest(http.MethodPost, "/api/v1/sources/"+f.teamKey+"/trash/"+f.trashKey+"/restore",
		strings.NewReader(`{"target_path":"/restored"}`), "application/json")
}

func requestPurge(f *fixture) (*http.Request, error) {
	return f.apiRequest(http.MethodDelete, "/api/v1/sources/"+f.teamKey+"/trash/"+f.trashKey, nil, "")
}

func requestImageUpload(f *fixture) (*http.Request, error) {
	return multipartRequest(f, "/api/v1/image-bed/uploads?key="+url.QueryEscape(f.teamKey), "crash.png", pngPayload())
}

func multipartRequest(f *fixture, path, name string, data []byte) (*http.Request, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(data); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return f.apiRequest(http.MethodPost, path, &body, writer.FormDataContentType())
}

func prepareMultipart(f *fixture) error {
	initReq, err := signedS3Request(f, http.MethodPost, "multipart.bin", nil, [][2]string{{"uploads", ""}}, nil)
	if err != nil {
		return err
	}
	response, err := f.client.Do(initReq)
	if err != nil {
		return err
	}
	data, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("init multipart HTTP %d: %s", response.StatusCode, data)
	}
	var initiated struct {
		UploadID string `xml:"UploadId"`
	}
	if err := xml.Unmarshal(data, &initiated); err != nil {
		return err
	}
	f.uploadID = initiated.UploadID
	partReq, err := signedS3Request(f, http.MethodPut, "multipart.bin", largePayload(), [][2]string{{"partNumber", "1"}, {"uploadId", f.uploadID}}, nil)
	if err != nil {
		return err
	}
	response, err = f.client.Do(partReq)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("upload part HTTP %d", response.StatusCode)
	}
	f.partETag = response.Header.Get("ETag")
	return nil
}

func requestMultipartComplete(f *fixture) (*http.Request, error) {
	body := []byte(`<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>` + f.partETag + `</ETag></Part></CompleteMultipartUpload>`)
	return signedS3Request(f, http.MethodPost, "multipart.bin", body, [][2]string{{"uploadId", f.uploadID}}, map[string]string{"Content-Type": "application/xml"})
}

func verifyOverwrite(f *fixture) error {
	data, err := os.ReadFile(filepath.Join(f.teamRoot, "overwrite.bin"))
	if err != nil {
		return err
	}
	if !bytes.Equal(data, []byte("old-content")) && !bytes.Equal(data, largePayload()) {
		return errors.New("overwrite target is neither old nor new content")
	}
	return nil
}

func verifyCopy(f *fixture) error {
	return verifyTreeEndpoint(f.teamRoot, "subject", f.teamRoot, "copied", false)
}

func verifyCrossMove(f *fixture) error {
	return verifyTreeEndpoint(f.teamRoot, "subject", f.publicRoot, "moved", true)
}

func verifySameMove(f *fixture) error {
	return verifyTreeEndpoint(f.teamRoot, "subject", f.teamRoot, "moved", true)
}

func verifyTrash(f *fixture) error {
	source := filepath.Join(f.teamRoot, "subject")
	exists := pathExists(source)
	entries, err := trashEntries(f)
	if err != nil {
		return err
	}
	if exists == (len(entries) > 0) {
		return fmt.Errorf("trash endpoint split: source=%t entries=%d", exists, len(entries))
	}
	return nil
}

func verifyRestore(f *fixture) error {
	restored := pathExists(filepath.Join(f.teamRoot, "restored"))
	entries, err := trashEntries(f)
	if err != nil {
		return err
	}
	if restored == (len(entries) > 0) {
		return fmt.Errorf("restore endpoint split: restored=%t entries=%d", restored, len(entries))
	}
	return nil
}

func verifyPurge(f *fixture) error {
	entries, err := trashEntries(f)
	if err != nil {
		return err
	}
	payload := filepath.Join(f.dataDir, "trash", f.trashKey, "payload")
	if (len(entries) > 0) != pathExists(payload) {
		return fmt.Errorf("purge endpoint split: entries=%d payload=%t", len(entries), pathExists(payload))
	}
	return nil
}

func verifyMultipart(f *fixture) error {
	db, err := sql.Open("sqlite", filepath.Join(f.dataDir, "omnistore.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	var uploads, etags int
	if err := db.QueryRow(`SELECT COUNT(*) FROM s3_multipart_uploads WHERE upload_id = ?`, f.uploadID).Scan(&uploads); err != nil {
		return err
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM s3_object_etags WHERE object_key = 'multipart.bin'`).Scan(&etags); err != nil {
		return err
	}
	target := pathExists(filepath.Join(f.teamRoot, "multipart.bin"))
	if uploads == 1 {
		if target || etags != 0 {
			return fmt.Errorf("multipart pre-commit split: target=%t etags=%d", target, etags)
		}
		return nil
	}
	if uploads == 0 && target && etags == 1 {
		return nil
	}
	return fmt.Errorf("multipart endpoint invalid: uploads=%d target=%t etags=%d", uploads, target, etags)
}

func verifyImageUpload(f *fixture) error {
	db, err := sql.Open("sqlite", filepath.Join(f.dataDir, "omnistore.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT relative_path FROM images WHERE original_filename = 'crash.png' AND trash_key IS NULL`)
	if err != nil {
		return err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var rel string
		if err := rows.Scan(&rel); err != nil {
			return err
		}
		count++
		if !pathExists(filepath.Join(f.teamRoot, filepath.FromSlash(rel))) {
			return fmt.Errorf("committed image missing file %s", rel)
		}
	}
	if count > 1 {
		return fmt.Errorf("duplicate committed crash images: %d", count)
	}
	return rows.Err()
}

func verifyTreeEndpoint(sourceRoot, sourceRel, targetRoot, targetRel string, move bool) error {
	source := pathExists(filepath.Join(sourceRoot, sourceRel))
	target := pathExists(filepath.Join(targetRoot, targetRel))
	if move {
		if source == target {
			return fmt.Errorf("move endpoint split: source=%t target=%t", source, target)
		}
	} else if !source || (target && !treesEqual(filepath.Join(sourceRoot, sourceRel), filepath.Join(targetRoot, targetRel))) {
		return fmt.Errorf("copy endpoint invalid: source=%t target=%t", source, target)
	}
	return nil
}

func auditFixture(f *fixture) error {
	sentinelPath := filepath.Join(f.teamRoot, reservedSentinel)
	sentinel, err := os.ReadFile(sentinelPath)
	if err != nil {
		return fmt.Errorf("reserved-name user file was not preserved: %w", err)
	}
	if string(sentinel) != reservedSentinelData {
		return errors.New("reserved-name user file content changed")
	}
	db, err := sql.Open("sqlite", filepath.Join(f.dataDir, "omnistore.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id, root_path FROM storage_sources`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var sourceID int64
		var root string
		if err := rows.Scan(&sourceID, &root); err != nil {
			rows.Close()
			return err
		}
		ignoredPath := ""
		if root == f.teamRoot {
			ignoredPath = sentinelPath
		}
		if err := auditSource(db, sourceID, root, ignoredPath); err != nil {
			rows.Close()
			return err
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, dir := range []string{
		"operations/copies", "operations/file-uploads", "operations/image-uploads", "operations/paths",
		"operations/s3-multipart-completions", "operations/s3-multipart-parts", "operations/transfers", "trash/.operations",
	} {
		if directoryHasEntries(filepath.Join(f.dataDir, dir)) {
			return fmt.Errorf("recovery journal remains in %s", dir)
		}
	}
	return auditTrash(db, f.dataDir)
}

func auditSource(db *sql.DB, sourceID int64, root, ignoredPath string) error {
	disk := make(map[string]int64)
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if path == ignoredPath {
			return nil
		}
		if strings.HasPrefix(entry.Name(), ".omnistore-") {
			return fmt.Errorf("internal artifact remains at %s", path)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode().IsRegular() {
			rel, _ := filepath.Rel(root, path)
			disk[filepath.ToSlash(rel)] = info.Size()
		}
		return nil
	})
	if err != nil {
		return err
	}
	records := make(map[string]int64)
	rows, err := db.Query(`SELECT relative_path, size FROM file_records WHERE storage_source_id = ? AND record_status = 'active'`, sourceID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var rel string
		var size int64
		if err := rows.Scan(&rel, &size); err != nil {
			rows.Close()
			return err
		}
		records[rel] = size
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if !equalFileMaps(disk, records) {
		return fmt.Errorf("source %d filesystem/file_records mismatch: disk=%d records=%d", sourceID, len(disk), len(records))
	}
	for _, table := range []string{"images", "file_shares"} {
		rows, err := db.Query(`SELECT relative_path FROM `+table+` WHERE storage_source_id = ? AND trash_key IS NULL`, sourceID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var rel string
			if err := rows.Scan(&rel); err != nil {
				rows.Close()
				return err
			}
			if _, exists := disk[rel]; !exists {
				rows.Close()
				return fmt.Errorf("active %s points to missing file %s", table, rel)
			}
		}
		if err := rows.Close(); err != nil {
			return err
		}
	}
	return nil
}

func auditTrash(db *sql.DB, dataDir string) error {
	keys := make(map[string]struct{})
	rows, err := db.Query(`SELECT trash_key FROM trash_entries`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			rows.Close()
			return err
		}
		keys[key] = struct{}{}
		if !pathExists(filepath.Join(dataDir, "trash", key, "payload")) {
			rows.Close()
			return fmt.Errorf("trash entry %s has no payload", key)
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	entries, err := os.ReadDir(filepath.Join(dataDir, "trash"))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	for _, entry := range entries {
		if entry.Name() == ".operations" {
			continue
		}
		if entry.IsDir() {
			if _, exists := keys[entry.Name()]; !exists {
				return fmt.Errorf("orphan trash payload %s", entry.Name())
			}
		}
	}
	return nil
}

func trashEntries(f *fixture) ([]trashItem, error) {
	response, err := f.client.Get(f.baseURL + "/api/v1/sources/" + f.teamKey + "/trash")
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(response.Body)
		return nil, fmt.Errorf("list trash HTTP %d: %s", response.StatusCode, data)
	}
	var result envelope[struct {
		Items []trashItem `json:"items"`
	}]
	err = json.NewDecoder(response.Body).Decode(&result)
	return result.Data.Items, err
}

func signedS3Request(f *fixture, method, key string, body []byte, query [][2]string, headers map[string]string) (*http.Request, error) {
	encoded := strings.Join(strings.Split(url.PathEscape(key), "%2F"), "/")
	target, _ := url.Parse(f.protocol.S3Endpoint + "/" + url.PathEscape(f.protocol.TeamBucket) + "/" + encoded)
	values := url.Values{}
	for _, pair := range query {
		values.Add(pair[0], pair[1])
	}
	target.RawQuery = values.Encode()
	req, err := http.NewRequest(method, target.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	timestamp, date := now.Format("20060102T150405Z"), now.Format("20060102")
	payloadHash := sha256Hex(body)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("X-Amz-Date", timestamp)
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	canonicalQuery := target.Query().Encode()
	canonical := strings.Join([]string{method, target.EscapedPath(), canonicalQuery,
		"host:" + target.Host + "\n" + "x-amz-content-sha256:" + payloadHash + "\n" + "x-amz-date:" + timestamp + "\n",
		"host;x-amz-content-sha256;x-amz-date", payloadHash}, "\n")
	scope := date + "/" + f.protocol.Region + "/s3/aws4_request"
	toSign := "AWS4-HMAC-SHA256\n" + timestamp + "\n" + scope + "\n" + sha256Hex([]byte(canonical))
	dateKey := hmacSHA256([]byte("AWS4"+f.protocol.SecretAccessKey), date)
	regionKey := hmacSHA256(dateKey, f.protocol.Region)
	serviceKey := hmacSHA256(regionKey, "s3")
	signingKey := hmacSHA256(serviceKey, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(signingKey, toSign))
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+f.protocol.AccessKeyID+"/"+scope+
		",SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature="+signature)
	return req, nil
}

func largePayload() []byte {
	return bytes.Repeat([]byte("crash-recovery-payload\n"), 350000)
}

func pngPayload() []byte {
	// A valid 1x1 PNG followed by ignored payload bytes keeps format validation
	// real while making the filesystem phase long enough to interrupt.
	prefix, _ := hex.DecodeString("89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082")
	return append(prefix, bytes.Repeat([]byte{0}, 8*1024*1024)...)
}

func freeAddress() (string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	defer listener.Close()
	return listener.Addr().String(), nil
}

func directoryHasEntries(path string) bool {
	entries, err := os.ReadDir(path)
	return err == nil && len(entries) > 0
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func treesEqual(left, right string) bool {
	leftFiles := treeFileMap(left)
	rightFiles := treeFileMap(right)
	return equalFileMaps(leftFiles, rightFiles)
}

func treeFileMap(root string) map[string]int64 {
	result := make(map[string]int64)
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		result[filepath.ToSlash(rel)] = info.Size()
		return nil
	})
	return result
}

func equalFileMaps(left, right map[string]int64) bool {
	if len(left) != len(right) {
		return false
	}
	keys := make([]string, 0, len(left))
	for key := range left {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if right[key] != left[key] {
			return false
		}
	}
	return true
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(data))
	return mac.Sum(nil)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "crashcheck:", err)
	os.Exit(1)
}
