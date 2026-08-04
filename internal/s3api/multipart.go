package s3api

import (
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
)

const (
	MinMultipartPartSize = 5 * 1024 * 1024
	MaxMultipartPartSize = int64(5 * 1024 * 1024 * 1024)
	MaxMultipartParts    = 10000
	MultipartMaxAge      = 24 * time.Hour
)

var (
	ErrNoSuchUpload     = errors.New("Multipart Upload 不存在")
	ErrInvalidPart      = errors.New("Multipart Part 不存在或 ETag 不匹配")
	ErrInvalidPartOrder = errors.New("Multipart Part 必须按 PartNumber 严格递增")
	ErrEntityTooSmall   = errors.New("除最后一片外，每个 Part 至少为 5 MiB")
	ErrEntityTooLarge   = errors.New("Multipart 数据超过上传大小限制")
)

var uploadIDPattern = regexp.MustCompile(`^mpu_[0-9a-f]{48}$`)

type MultipartUpload struct {
	UploadID    string
	OwnerUserID int64
	SourceID    string
	ObjectKey   string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type MultipartPart struct {
	PartNumber int
	ETag       string
	Size       int64
	CreatedAt  time.Time
}

type CompletedPart struct {
	PartNumber int
	ETag       string
}

type MultipartCleanupResult struct {
	UploadsRemoved int
	OrphansRemoved int
}

// MultipartStore 管理上传状态、临时分片与最终原子合并。
type MultipartStore struct {
	db        *sql.DB
	root      string
	files     *files.Service
	maxObject int64
	locks     *locks.Manager
	now       func() time.Time
}

func NewMultipartStore(db *sql.DB, dataDir string, fileService *files.Service, maxFileSizeMB int64) *MultipartStore {
	return &MultipartStore{
		db: db, root: filepath.Join(dataDir, "tmp", "multipart"), files: fileService,
		maxObject: maxFileSizeMB * 1024 * 1024, locks: locks.NewManager(), now: time.Now,
	}
}

func (s *MultipartStore) Create(userID int64, sourceID, objectKey string) (*MultipartUpload, error) {
	if err := os.MkdirAll(s.root, 0o700); err != nil {
		return nil, fmt.Errorf("创建 Multipart 临时目录失败: %w", err)
	}
	now := s.now().UTC()
	for range 5 {
		uploadID := "mpu_" + auth.NewRandomToken("", 24)
		dir := s.uploadDir(uploadID)
		if err := os.Mkdir(dir, 0o700); err != nil {
			if os.IsExist(err) {
				continue
			}
			return nil, err
		}
		_, err := s.db.Exec(`INSERT INTO s3_multipart_uploads
  (upload_id, owner_user_id, source_id, object_key, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)`, uploadID, userID, sourceID, objectKey, now, now)
		if err == nil {
			return &MultipartUpload{UploadID: uploadID, OwnerUserID: userID, SourceID: sourceID, ObjectKey: objectKey, CreatedAt: now, UpdatedAt: now}, nil
		}
		_ = os.RemoveAll(dir)
		if !strings.Contains(err.Error(), "s3_multipart_uploads.upload_id") {
			return nil, err
		}
	}
	return nil, fmt.Errorf("生成 upload_id 失败")
}

func (s *MultipartStore) Get(userID int64, sourceID, objectKey, uploadID string) (*MultipartUpload, error) {
	if !uploadIDPattern.MatchString(uploadID) {
		return nil, ErrNoSuchUpload
	}
	var upload MultipartUpload
	err := s.db.QueryRow(`SELECT upload_id, owner_user_id, source_id, object_key, created_at, updated_at
  FROM s3_multipart_uploads WHERE upload_id = ? AND owner_user_id = ? AND source_id = ? AND object_key = ?`,
		uploadID, userID, sourceID, objectKey).Scan(&upload.UploadID, &upload.OwnerUserID,
		&upload.SourceID, &upload.ObjectKey, &upload.CreatedAt, &upload.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoSuchUpload
	}
	return &upload, err
}

func (s *MultipartStore) UploadPart(userID int64, sourceID, objectKey, uploadID string, partNumber int, body io.Reader) (*MultipartPart, error) {
	if partNumber < 1 || partNumber > MaxMultipartParts {
		return nil, fmt.Errorf("partNumber 必须为 1-10000")
	}
	unlock := s.locks.Lock("multipart:" + uploadID)
	defer unlock()
	if _, err := s.Get(userID, sourceID, objectKey, uploadID); err != nil {
		return nil, err
	}
	dir := s.uploadDir(uploadID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	tmp, err := os.CreateTemp(dir, ".part-*.tmp")
	if err != nil {
		return nil, err
	}
	tmpPath := tmp.Name()
	cleanup := func() {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
	}
	md5Hash := md5.New()
	limit := MaxMultipartPartSize
	if s.maxObject > 0 && s.maxObject < limit {
		limit = s.maxObject
	}
	written, err := io.Copy(tmp, io.TeeReader(io.LimitReader(body, limit+1), md5Hash))
	if err != nil {
		cleanup()
		return nil, err
	}
	if written > limit {
		cleanup()
		return nil, ErrEntityTooLarge
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}

	var otherSize int64
	if err := s.db.QueryRow(`SELECT COALESCE(SUM(size), 0) FROM s3_multipart_parts
  WHERE upload_id = ? AND part_number <> ?`, uploadID, partNumber).Scan(&otherSize); err != nil {
		_ = os.Remove(tmpPath)
		return nil, err
	}
	if s.maxObject > 0 && otherSize+written > s.maxObject {
		_ = os.Remove(tmpPath)
		return nil, ErrEntityTooLarge
	}

	etag := `"` + hex.EncodeToString(md5Hash.Sum(nil)) + `"`
	finalPath := s.partPath(uploadID, partNumber)
	backupPath := finalPath + ".previous"
	_ = os.Remove(backupPath)
	hadPrevious := false
	if err := os.Rename(finalPath, backupPath); err == nil {
		hadPrevious = true
	} else if !os.IsNotExist(err) {
		_ = os.Remove(tmpPath)
		return nil, err
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		if hadPrevious {
			_ = os.Rename(backupPath, finalPath)
		}
		return nil, err
	}
	rollbackFile := func() {
		_ = os.Remove(finalPath)
		if hadPrevious {
			_ = os.Rename(backupPath, finalPath)
		}
	}
	now := s.now().UTC()
	tx, err := s.db.Begin()
	if err != nil {
		rollbackFile()
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO s3_multipart_parts (upload_id, part_number, etag, size, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(upload_id, part_number) DO UPDATE SET etag = excluded.etag, size = excluded.size, created_at = excluded.created_at`,
		uploadID, partNumber, etag, written, now); err != nil {
		rollbackFile()
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE s3_multipart_uploads SET updated_at = ? WHERE upload_id = ?`, now, uploadID); err != nil {
		rollbackFile()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		rollbackFile()
		return nil, err
	}
	if hadPrevious {
		_ = os.Remove(backupPath)
	}
	return &MultipartPart{PartNumber: partNumber, ETag: etag, Size: written, CreatedAt: now}, nil
}

func (s *MultipartStore) ListParts(userID int64, sourceID, objectKey, uploadID string) ([]MultipartPart, error) {
	if _, err := s.Get(userID, sourceID, objectKey, uploadID); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT part_number, etag, size, created_at FROM s3_multipart_parts
  WHERE upload_id = ? ORDER BY part_number`, uploadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	parts := []MultipartPart{}
	for rows.Next() {
		var part MultipartPart
		if err := rows.Scan(&part.PartNumber, &part.ETag, &part.Size, &part.CreatedAt); err != nil {
			return nil, err
		}
		parts = append(parts, part)
	}
	return parts, rows.Err()
}

func (s *MultipartStore) Complete(userID int64, src *models.StorageSource, objectKey, uploadID string, requested []CompletedPart) (string, int64, error) {
	unlock := s.locks.Lock("multipart:" + uploadID)
	defer unlock()
	if _, err := s.Get(userID, src.SourceID, objectKey, uploadID); err != nil {
		return "", 0, err
	}
	if len(requested) == 0 || len(requested) > MaxMultipartParts {
		return "", 0, ErrInvalidPart
	}
	for i, part := range requested {
		if part.PartNumber < 1 || part.PartNumber > MaxMultipartParts {
			return "", 0, ErrInvalidPart
		}
		if i > 0 && requested[i-1].PartNumber >= part.PartNumber {
			return "", 0, ErrInvalidPartOrder
		}
	}

	stored, err := s.partsByNumber(uploadID)
	if err != nil {
		return "", 0, err
	}
	selected := make([]MultipartPart, len(requested))
	var total int64
	combinedMD5 := md5.New()
	for i, requestedPart := range requested {
		part, ok := stored[requestedPart.PartNumber]
		if !ok || normalizeETag(part.ETag) != normalizeETag(requestedPart.ETag) {
			return "", 0, ErrInvalidPart
		}
		if i < len(requested)-1 && part.Size < MinMultipartPartSize {
			return "", 0, ErrEntityTooSmall
		}
		digest, err := hex.DecodeString(normalizeETag(part.ETag))
		if err != nil || len(digest) != md5.Size {
			return "", 0, ErrInvalidPart
		}
		_, _ = combinedMD5.Write(digest)
		total += part.Size
		selected[i] = part
	}
	if s.maxObject > 0 && total > s.maxObject {
		return "", 0, ErrEntityTooLarge
	}
	if err := s.files.EnsureObjectParents(src, objectKey); err != nil {
		return "", 0, err
	}
	reader := &sequentialPartReader{store: s, uploadID: uploadID, parts: selected}
	dir, filename := path.Split(objectKey)
	dir = strings.TrimSuffix(dir, "/")
	_, written, err := s.files.Upload(src, dir, filename, reader, true)
	_ = reader.Close()
	if err != nil {
		return "", 0, err
	}
	if written != total {
		return "", 0, fmt.Errorf("Multipart 合并大小不匹配")
	}
	etag := `"` + hex.EncodeToString(combinedMD5.Sum(nil)) + "-" + strconv.Itoa(len(selected)) + `"`
	entry, err := s.files.Stat(src, objectKey)
	if err != nil {
		return "", 0, err
	}
	if err := s.RememberObjectETag(src.SourceID, objectKey, etag, entry.Size, entry.MTime); err != nil {
		return "", 0, err
	}
	if _, err := s.db.Exec(`DELETE FROM s3_multipart_uploads WHERE upload_id = ?`, uploadID); err != nil {
		return "", 0, err
	}
	_ = os.RemoveAll(s.uploadDir(uploadID))
	return etag, total, nil
}

// RememberObjectETag 保存 Multipart 完成后的非普通 MD5 ETag。
func (s *MultipartStore) RememberObjectETag(sourceID, objectKey, etag string, size int64, mtime time.Time) error {
	_, err := s.db.Exec(`INSERT INTO s3_object_etags
  (source_id, object_key, etag, size, mtime_unix_nano, updated_at) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id, object_key) DO UPDATE SET etag = excluded.etag, size = excluded.size,
    mtime_unix_nano = excluded.mtime_unix_nano, updated_at = excluded.updated_at`,
		sourceID, objectKey, etag, size, mtime.UnixNano(), s.now().UTC())
	return err
}

// ObjectETag 返回仍与物理文件 size + mtime 匹配的 Multipart ETag。
func (s *MultipartStore) ObjectETag(sourceID, objectKey string, size int64, mtime time.Time) (string, bool, error) {
	var etag string
	var storedSize, storedMTime int64
	err := s.db.QueryRow(`SELECT etag, size, mtime_unix_nano FROM s3_object_etags
  WHERE source_id = ? AND object_key = ?`, sourceID, objectKey).Scan(&etag, &storedSize, &storedMTime)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	if storedSize != size || storedMTime != mtime.UnixNano() {
		if err := s.ForgetObjectETag(sourceID, objectKey); err != nil {
			return "", false, err
		}
		return "", false, nil
	}
	return etag, true, nil
}

// ForgetObjectETag 移除被普通 PUT、DELETE 或外部修改取代的 Multipart ETag。
func (s *MultipartStore) ForgetObjectETag(sourceID, objectKey string) error {
	_, err := s.db.Exec(`DELETE FROM s3_object_etags WHERE source_id = ? AND object_key = ?`, sourceID, objectKey)
	return err
}

func (s *MultipartStore) Abort(userID int64, sourceID, objectKey, uploadID string) error {
	unlock := s.locks.Lock("multipart:" + uploadID)
	defer unlock()
	if _, err := s.Get(userID, sourceID, objectKey, uploadID); err != nil {
		return err
	}
	if _, err := s.db.Exec(`DELETE FROM s3_multipart_uploads WHERE upload_id = ?`, uploadID); err != nil {
		return err
	}
	return os.RemoveAll(s.uploadDir(uploadID))
}

func (s *MultipartStore) CleanupExpired(maxAge time.Duration) (MultipartCleanupResult, error) {
	if maxAge <= 0 {
		maxAge = MultipartMaxAge
	}
	cutoff := s.now().UTC().Add(-maxAge)
	rows, err := s.db.Query(`SELECT upload_id FROM s3_multipart_uploads WHERE updated_at < ?`, cutoff)
	if err != nil {
		return MultipartCleanupResult{}, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return MultipartCleanupResult{}, err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return MultipartCleanupResult{}, err
	}
	result := MultipartCleanupResult{}
	for _, id := range ids {
		unlock := s.locks.Lock("multipart:" + id)
		res, deleteErr := s.db.Exec(`DELETE FROM s3_multipart_uploads WHERE upload_id = ? AND updated_at < ?`, id, cutoff)
		if deleteErr == nil {
			if n, _ := res.RowsAffected(); n > 0 {
				_ = os.RemoveAll(s.uploadDir(id))
				result.UploadsRemoved++
			}
		}
		unlock()
		if deleteErr != nil {
			return result, deleteErr
		}
	}

	entries, err := os.ReadDir(s.root)
	if os.IsNotExist(err) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	for _, entry := range entries {
		if !uploadIDPattern.MatchString(entry.Name()) {
			continue
		}
		var count int
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM s3_multipart_uploads WHERE upload_id = ?`, entry.Name()).Scan(&count); err != nil {
			return result, err
		}
		if count > 0 {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			if err := os.RemoveAll(s.uploadDir(entry.Name())); err == nil {
				result.OrphansRemoved++
			}
		}
	}
	return result, nil
}

func (s *MultipartStore) partsByNumber(uploadID string) (map[int]MultipartPart, error) {
	parts, err := s.listPartsUnchecked(uploadID)
	if err != nil {
		return nil, err
	}
	out := make(map[int]MultipartPart, len(parts))
	for _, part := range parts {
		out[part.PartNumber] = part
	}
	return out, nil
}

func (s *MultipartStore) listPartsUnchecked(uploadID string) ([]MultipartPart, error) {
	rows, err := s.db.Query(`SELECT part_number, etag, size, created_at FROM s3_multipart_parts WHERE upload_id = ?`, uploadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	parts := []MultipartPart{}
	for rows.Next() {
		var part MultipartPart
		if err := rows.Scan(&part.PartNumber, &part.ETag, &part.Size, &part.CreatedAt); err != nil {
			return nil, err
		}
		parts = append(parts, part)
	}
	sort.Slice(parts, func(i, j int) bool { return parts[i].PartNumber < parts[j].PartNumber })
	return parts, rows.Err()
}

func normalizeETag(value string) string {
	return strings.ToLower(strings.Trim(strings.TrimSpace(value), `"`))
}

func (s *MultipartStore) uploadDir(uploadID string) string {
	return filepath.Join(s.root, uploadID)
}

func (s *MultipartStore) partPath(uploadID string, partNumber int) string {
	return filepath.Join(s.uploadDir(uploadID), fmt.Sprintf("%05d.part", partNumber))
}

type sequentialPartReader struct {
	store    *MultipartStore
	uploadID string
	parts    []MultipartPart
	index    int
	current  *os.File
}

func (r *sequentialPartReader) Read(p []byte) (int, error) {
	for {
		if r.current == nil {
			if r.index >= len(r.parts) {
				return 0, io.EOF
			}
			part := r.parts[r.index]
			file, err := os.Open(r.store.partPath(r.uploadID, part.PartNumber))
			if err != nil {
				return 0, err
			}
			r.current = file
		}
		n, err := r.current.Read(p)
		if errors.Is(err, io.EOF) {
			_ = r.current.Close()
			r.current = nil
			r.index++
			if n > 0 {
				return n, nil
			}
			continue
		}
		return n, err
	}
}

func (r *sequentialPartReader) Close() error {
	if r.current != nil {
		return r.current.Close()
	}
	return nil
}
