package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

type transferTask struct {
	ID        int64  `json:"id"`
	PublicKey string `json:"public_key"`
}

type transferFixture struct {
	send         transferTask
	collection   transferTask
	submissionID int64
	token        string
	files        map[string][]byte
}

func transferCrashScenarios() []scenario {
	return []scenario{
		{name: "transfer send upload", journalDir: "operations/transfer-uploads", ready: uploadTempVisible, prepare: prepareTransferSend, request: requestTransferUpload, verify: verifyTransferUpload},
		{name: "transfer send finalize", ready: func(*fixture) bool { return true }, prepare: prepareTransferFinalize, request: requestTransferFinalize, verify: verifyTransferFinalize},
		{name: "transfer collect submit", journalDir: "operations/transfer-uploads", ready: uploadTempVisible, prepare: prepareTransferCollection, request: requestTransferSubmit, verify: verifyTransferSubmit},
		{name: "transfer save to files", journalDir: "operations/file-uploads", ready: uploadTempVisible, prepare: prepareTransferSave, request: requestTransferSave, verify: verifyTransferSave},
		{name: "transfer GC", ready: transferGCStarted, prepare: prepareTransferGC, request: requestTransferGC, settle: awaitTransferGC, verify: verifyTransferGC},
	}
}

func (f *fixture) transferJSON(method, path string, body any, result any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := f.apiRequest(method, path, bytes.NewReader(data), "application/json")
	if err != nil {
		return err
	}
	return f.transferDo(req, result)
}

func (f *fixture) transferDo(req *http.Request, result any) error {
	response, err := f.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("%s %s HTTP %d: %s", req.Method, req.URL.Path, response.StatusCode, data)
	}
	if result != nil {
		return json.Unmarshal(data, result)
	}
	return nil
}

func prepareTransferSend(f *fixture) error {
	var result envelope[struct {
		Send transferTask `json:"send"`
	}]
	if err := f.transferJSON(http.MethodPost, "/api/v1/transfers", map[string]any{
		"title": "crash acceptance send", "require_code": false,
	}, &result); err != nil {
		return err
	}
	f.transfer.send = result.Data.Send
	if f.transfer.send.ID == 0 || f.transfer.send.PublicKey == "" {
		return errors.New("create transfer omitted identity")
	}
	return nil
}

func requestTransferUpload(f *fixture) (*http.Request, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("relative_path", "delivery.bin"); err != nil {
		return nil, err
	}
	part, err := writer.CreateFormFile("file", "delivery.bin")
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(largePayload()); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return f.apiRequest(http.MethodPost, fmt.Sprintf("/api/v1/transfers/%d/files/upload", f.transfer.send.ID), &body, writer.FormDataContentType())
}

func prepareTransferFinalize(f *fixture) error {
	if err := prepareTransferSend(f); err != nil {
		return err
	}
	req, err := requestTransferUpload(f)
	if err != nil {
		return err
	}
	return f.transferDo(req, nil)
}

func requestTransferFinalize(f *fixture) (*http.Request, error) {
	return f.apiRequest(http.MethodPost, fmt.Sprintf("/api/v1/transfers/%d/finalize", f.transfer.send.ID), nil, "")
}

func prepareTransferCollection(f *fixture) error {
	var result envelope[struct {
		Collection transferTask `json:"collection"`
	}]
	if err := f.transferJSON(http.MethodPost, "/api/v1/transfer-collections", map[string]any{
		"title": "crash acceptance collect", "require_code": false,
	}, &result); err != nil {
		return err
	}
	f.transfer.collection = result.Data.Collection
	if f.transfer.collection.ID == 0 || f.transfer.collection.PublicKey == "" {
		return errors.New("create collection omitted identity")
	}
	var unlocked envelope[struct {
		Token string `json:"token"`
	}]
	if err := f.transferJSON(http.MethodPost, "/api/v1/public/transfer-collections/"+f.transfer.collection.PublicKey+"/unlock", map[string]any{}, &unlocked); err != nil {
		return err
	}
	f.transfer.token = unlocked.Data.Token
	f.transfer.files = map[string][]byte{
		"first.bin": largePayload(), "nested/second.bin": largePayload(), "nested/last.txt": []byte("last file in atomic collect batch"),
	}
	return nil
}

func requestTransferSubmit(f *fixture) (*http.Request, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("name", "crash acceptance sender"); err != nil {
		return nil, err
	}
	// Stable order makes the first large write an observable crash boundary.
	for _, name := range sortedKeys(f.transfer.files) {
		if err := writer.WriteField("relative_path", name); err != nil {
			return nil, err
		}
		part, err := writer.CreateFormFile("file", filepath.Base(name))
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(f.transfer.files[name]); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	req, err := f.apiRequest(http.MethodPost, "/api/v1/public/transfer-collections/"+f.transfer.collection.PublicKey+"/submit", &body, writer.FormDataContentType())
	if err == nil {
		req.Header.Set("Authorization", "Bearer "+f.transfer.token)
	}
	return req, err
}

func prepareTransferSave(f *fixture) error {
	if err := prepareTransferCollection(f); err != nil {
		return err
	}
	return submitTransferBatch(f)
}

func submitTransferBatch(f *fixture) error {
	req, err := requestTransferSubmit(f)
	if err != nil {
		return err
	}
	var result envelope[transferTask]
	if err := f.transferDo(req, &result); err != nil {
		return err
	}
	f.transfer.submissionID = result.Data.ID
	if f.transfer.submissionID == 0 {
		return errors.New("collect submit omitted submission ID")
	}
	return nil
}

func requestTransferSave(f *fixture) (*http.Request, error) {
	body := fmt.Sprintf(`{"source_key":%q,"path":"/saved"}`, f.publicKey)
	return f.apiRequest(http.MethodPost, fmt.Sprintf("/api/v1/transfer-collections/%d/submissions/%d/save-to-files", f.transfer.collection.ID, f.transfer.submissionID), strings.NewReader(body), "application/json")
}

func prepareTransferGC(f *fixture) error {
	if err := prepareTransferFinalize(f); err != nil {
		return err
	}
	req, err := requestTransferFinalize(f)
	if err != nil {
		return err
	}
	if err := f.transferDo(req, nil); err != nil {
		return err
	}
	if err := prepareTransferCollection(f); err != nil {
		return err
	}
	// Many small files keep directory removal observable without huge fixtures.
	f.transfer.files = make(map[string][]byte, 256)
	for index := range 256 {
		f.transfer.files[fmt.Sprintf("nested/file-%03d.bin", index)] = bytes.Repeat([]byte("gc-preserved-copy\n"), 64)
	}
	if err := submitTransferBatch(f); err != nil {
		return err
	}
	req, err = requestTransferSave(f)
	if err != nil {
		return err
	}
	if err := f.transferDo(req, nil); err != nil {
		return err
	}
	// Move only the isolated fixture's clock-dependent rows into the past.
	// Cleanup itself still runs through the production operations HTTP endpoint.
	db, err := f.transferDB()
	if err != nil {
		return err
	}
	defer db.Close()
	for _, table := range []string{"transfers", "transfer_collections", "transfer_access_sessions"} {
		if _, err := db.Exec("UPDATE "+table+" SET expires_at = ?", time.Now().UTC().Add(-time.Hour)); err != nil {
			return err
		}
	}
	return nil
}

func requestTransferGC(f *fixture) (*http.Request, error) {
	return f.apiRequest(http.MethodPost, "/api/v1/admin/operations/cleanup", nil, "")
}

func transferGCStarted(f *fixture) bool {
	return !pathExists(filepath.Join(f.teamRoot, ".omnistore", "transfer", "send", f.transfer.send.PublicKey, "delivery.bin"))
}

func (f *fixture) transferDB() (*sql.DB, error) {
	return sql.Open("sqlite", filepath.Join(f.dataDir, "omnistore.db")+"?_pragma=busy_timeout(5000)")
}

func verifyTransferUpload(f *fixture) error {
	if err := auditTransferPayloads(f); err != nil {
		return err
	}
	db, err := f.transferDB()
	if err != nil {
		return err
	}
	defer db.Close()
	var count int
	if err := db.QueryRow(`SELECT total_files FROM transfers WHERE id = ? AND status = 'draft'`, f.transfer.send.ID).Scan(&count); err != nil {
		return err
	}
	if count != 0 && count != 1 {
		return fmt.Errorf("send upload recovered %d files", count)
	}
	if count == 0 {
		req, err := requestTransferUpload(f)
		if err != nil {
			return err
		}
		if err := f.transferDo(req, nil); err != nil {
			return fmt.Errorf("retry interrupted send upload: %w", err)
		}
	}
	return verifyTransferFinalize(f)
}

func verifyTransferFinalize(f *fixture) error {
	if err := auditTransferPayloads(f); err != nil {
		return err
	}
	db, err := f.transferDB()
	if err != nil {
		return err
	}
	defer db.Close()
	var status string
	var finalized sql.NullString
	if err := db.QueryRow(`SELECT status, finalized_at FROM transfers WHERE id = ? AND total_files = 1`, f.transfer.send.ID).Scan(&status, &finalized); err != nil {
		return err
	}
	if status == "draft" && !finalized.Valid {
		req, err := requestTransferFinalize(f)
		if err != nil {
			return err
		}
		if err := f.transferDo(req, nil); err != nil {
			return fmt.Errorf("retry interrupted finalize: %w", err)
		}
	} else if status != "active" || !finalized.Valid {
		return fmt.Errorf("inconsistent finalized state: %s finalized_at=%v", status, finalized)
	}
	if err := db.QueryRow(`SELECT status, finalized_at FROM transfers WHERE id = ?`, f.transfer.send.ID).Scan(&status, &finalized); err != nil {
		return err
	}
	if status != "active" || !finalized.Valid {
		return errors.New("recovered send could not be finalized")
	}
	return auditTransferPayloads(f)
}

func verifyTransferSubmit(f *fixture) error {
	if err := auditTransferPayloads(f); err != nil {
		return err
	}
	db, err := f.transferDB()
	if err != nil {
		return err
	}
	defer db.Close()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM transfer_submissions WHERE collection_id = ?`, f.transfer.collection.ID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if err := submitTransferBatch(f); err != nil {
			return fmt.Errorf("retry interrupted collection batch: %w", err)
		}
	} else if count != 1 {
		return fmt.Errorf("collection recovered duplicate submissions: %d", count)
	}
	return auditTransferPayloads(f)
}

func verifyTransferSave(f *fixture) error {
	if err := auditTransferPayloads(f); err != nil {
		return err
	}
	if err := verifySavedTransferFiles(f, "saved", false); err != nil {
		return err
	}
	// Save-to-files commits individual files; interruption may leave complete
	// earlier files, but neither corrupt files nor changed original submissions.
	path := fmt.Sprintf("/api/v1/transfer-collections/%d/submissions/%d/save-to-files", f.transfer.collection.ID, f.transfer.submissionID)
	if err := f.transferJSON(http.MethodPost, path, map[string]any{"source_key": f.publicKey, "path": "/saved-after-recovery"}, nil); err != nil {
		return fmt.Errorf("save recovered original to a fresh destination: %w", err)
	}
	if err := verifySavedTransferFiles(f, "saved-after-recovery", true); err != nil {
		return err
	}
	return auditFixture(f)
}

func awaitTransferGC(f *fixture) error {
	db, err := f.transferDB()
	if err != nil {
		return err
	}
	defer db.Close()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var pending int
		err := db.QueryRow(`SELECT (SELECT COUNT(*) FROM transfers WHERE status <> 'expired') + (SELECT COUNT(*) FROM transfer_collections WHERE status <> 'expired') + (SELECT COUNT(*) FROM transfer_access_sessions)`).Scan(&pending)
		if err != nil {
			return err
		}
		if pending == 0 {
			break
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("startup GC did not converge: %d pending rows", pending)
		}
		time.Sleep(10 * time.Millisecond)
	}
	return nil
}

func verifyTransferGC(f *fixture) error {
	if err := auditTransferPayloads(f); err != nil {
		return err
	}
	if err := verifySavedTransferFiles(f, "saved", true); err != nil {
		return err
	}
	// Explicit repetition checks the cleanup endpoint's idempotence as well.
	req, err := requestTransferGC(f)
	if err != nil {
		return err
	}
	if err := f.transferDo(req, nil); err != nil {
		return err
	}
	if err := auditTransferPayloads(f); err != nil {
		return err
	}
	if err := verifySavedTransferFiles(f, "saved", true); err != nil {
		return err
	}
	return auditFixture(f)
}

func verifySavedTransferFiles(f *fixture, dir string, requireAll bool) error {
	for name, content := range f.transfer.files {
		actual, err := os.ReadFile(filepath.Join(f.publicRoot, dir, filepath.FromSlash(name)))
		if errors.Is(err, os.ErrNotExist) && !requireAll {
			continue
		}
		if err != nil {
			return err
		}
		if !bytes.Equal(actual, content) {
			return fmt.Errorf("saved submission content mismatch: %s/%s", dir, name)
		}
	}
	return nil
}

// auditTransferPayloads checks the managed namespace excluded by auditSource:
// every live ledger file must exist with exact bytes, every physical payload
// must have a live ledger, and all batch/task counters must match those rows.
func auditTransferPayloads(f *fixture) error {
	db, err := f.transferDB()
	if err != nil {
		return err
	}
	defer db.Close()
	queries := []string{
		`SELECT COUNT(*) FROM transfers t WHERE total_files <> (SELECT COUNT(*) FROM transfer_files f WHERE f.transfer_id = t.id) OR total_size <> (SELECT COALESCE(SUM(size), 0) FROM transfer_files f WHERE f.transfer_id = t.id)`,
		`SELECT COUNT(*) FROM transfer_submissions s WHERE file_count = 0 OR file_count <> (SELECT COUNT(*) FROM transfer_submission_files f WHERE f.submission_id = s.id) OR total_size <> (SELECT COALESCE(SUM(size), 0) FROM transfer_submission_files f WHERE f.submission_id = s.id)`,
		`SELECT COUNT(*) FROM transfer_collections c WHERE total_files <> (SELECT COALESCE(SUM(file_count), 0) FROM transfer_submissions s WHERE s.collection_id = c.id) OR total_size <> (SELECT COALESCE(SUM(total_size), 0) FROM transfer_submissions s WHERE s.collection_id = c.id)`,
	}
	for index, query := range queries {
		var mismatches int
		if err := db.QueryRow(query).Scan(&mismatches); err != nil {
			return err
		}
		if mismatches != 0 {
			return fmt.Errorf("transfer ledger invariant %d failed for %d rows", index+1, mismatches)
		}
	}
	if f.transfer.collection.ID != 0 {
		var batchSize int64
		for _, content := range f.transfer.files {
			batchSize += int64(len(content))
		}
		var partial int
		if err := db.QueryRow(`SELECT COUNT(*) FROM transfer_submissions WHERE collection_id = ? AND (file_count <> ? OR total_size <> ?)`,
			f.transfer.collection.ID, len(f.transfer.files), batchSize).Scan(&partial); err != nil {
			return err
		}
		if partial != 0 {
			return fmt.Errorf("collection exposed %d partial batches", partial)
		}
	}
	expected := map[string]int64{}
	rows, err := db.Query(`SELECT s.root_path, 'send/' || t.public_key || '/' || f.relative_path, f.relative_path, f.size
 FROM transfer_files f JOIN transfers t ON t.id = f.transfer_id JOIN storage_sources s ON s.id = t.storage_source_id WHERE t.status IN ('draft', 'active')
 UNION ALL
 SELECT s.root_path, 'collect/' || c.public_key || '/' || sub.id || '/' || f.relative_path, f.relative_path, f.size
 FROM transfer_submission_files f JOIN transfer_submissions sub ON sub.id = f.submission_id JOIN transfer_collections c ON c.id = sub.collection_id JOIN storage_sources s ON s.id = c.storage_source_id WHERE c.status = 'active'`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var root, physical, logical string
		var size int64
		if err := rows.Scan(&root, &physical, &logical, &size); err != nil {
			return err
		}
		path := filepath.Join(root, ".omnistore", "transfer", filepath.FromSlash(physical))
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("ledger points to missing transfer payload %s: %w", path, err)
		}
		want := f.transfer.files[logical]
		if strings.HasPrefix(physical, "send/") {
			want = largePayload()
		}
		if int64(len(content)) != size || !bytes.Equal(content, want) {
			return fmt.Errorf("transfer payload content/size mismatch: %s", physical)
		}
		expected[path] = size
	}
	if err := rows.Err(); err != nil {
		return err
	}
	actual := map[string]int64{}
	for _, root := range []string{f.teamRoot, f.publicRoot} {
		err := filepath.WalkDir(filepath.Join(root, ".omnistore", "transfer"), func(path string, entry os.DirEntry, err error) error {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			info, err := entry.Info()
			if err != nil {
				return err
			}
			actual[path] = info.Size()
			return nil
		})
		if err != nil {
			return err
		}
	}
	if !equalFileMaps(expected, actual) {
		return fmt.Errorf("transfer managed filesystem/ledger mismatch: expected=%v actual=%v", expected, actual)
	}
	return nil
}

func sortedKeys(values map[string][]byte) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}
