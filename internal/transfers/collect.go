package transfers

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

// Collection 是收集任务的台账记录。
type Collection struct {
	ID           int64      `json:"id"`
	PublicKey    string     `json:"public_key"`
	OwnerUserID  int64      `json:"owner_user_id"`
	SourceKey    string     `json:"source_key"`
	SourceName   string     `json:"source_name"`
	Title        string     `json:"title"`
	Description  string     `json:"description"`
	HasPassword  bool       `json:"has_password"`
	MaxFileSize  *int64     `json:"max_file_size"`
	MaxTotalSize *int64     `json:"max_total_size"`
	RequireName  bool       `json:"require_name"`
	RequireNote  bool       `json:"require_note"`
	AllowedExts  []string   `json:"allowed_exts"`
	ExpiresAt    *time.Time `json:"expires_at"`
	Status       string     `json:"status"`
	TotalFiles   int64      `json:"total_files"`
	TotalSize    int64      `json:"total_size"`
	CreatedAt    time.Time  `json:"created_at"`
	ClosedAt     *time.Time `json:"closed_at"`
}

type collectionRow struct {
	collection   Collection
	passwordHash string
	codeHash     string
	sourceID     int64
}

const collectionColumns = `c.id, c.public_key, c.owner_user_id, c.storage_source_id, s.key, s.name,
  c.title, c.description, c.password_hash IS NOT NULL, c.max_file_size, c.max_total_size,
  c.require_name, c.require_note, c.allowed_exts, c.expires_at, c.status,
  c.total_files, c.total_size, c.created_at, c.closed_at`

func scanCollection(row interface{ Scan(...any) error }) (*collectionRow, error) {
	var out collectionRow
	var passwordHash, codeHash, allowedExts string
	var sourceID int64
	var expires, closed sql.NullTime
	err := row.Scan(&out.collection.ID, &out.collection.PublicKey, &out.collection.OwnerUserID,
		&sourceID, &out.collection.SourceKey, &out.collection.SourceName,
		&out.collection.Title, &out.collection.Description, &out.collection.HasPassword,
		&out.collection.MaxFileSize, &out.collection.MaxTotalSize,
		&out.collection.RequireName, &out.collection.RequireNote, &allowedExts,
		&expires, &out.collection.Status, &out.collection.TotalFiles, &out.collection.TotalSize,
		&out.collection.CreatedAt, &closed, &passwordHash, &codeHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	assignNullableTime(&out.collection.ExpiresAt, expires)
	assignNullableTime(&out.collection.ClosedAt, closed)
	out.passwordHash = passwordHash
	out.codeHash = codeHash
	out.sourceID = sourceID
	if allowedExts != "" {
		out.collection.AllowedExts = strings.Split(allowedExts, ",")
	} else {
		out.collection.AllowedExts = []string{}
	}
	return &out, nil
}

// Submission 是一次访客提交。
type Submission struct {
	ID            int64            `json:"id"`
	CollectionID  int64            `json:"collection_id"`
	SubmitterName string           `json:"submitter_name"`
	Note          string           `json:"note"`
	FileCount     int64            `json:"file_count"`
	TotalSize     int64            `json:"total_size"`
	CreatedAt     time.Time        `json:"created_at"`
	Files         []SubmissionFile `json:"files,omitempty"`
}

type SubmissionFile struct {
	ID           int64     `json:"id"`
	RelativePath string    `json:"relative_path"`
	Size         int64     `json:"size"`
	MimeType     string    `json:"mime_type"`
	CreatedAt    time.Time `json:"created_at"`
}

const submissionColumns = `id, collection_id, submitter_name, note, file_count, total_size, created_at`

func scanSubmission(row interface{ Scan(...any) error }) (*Submission, error) {
	var sub Submission
	err := row.Scan(&sub.ID, &sub.CollectionID, &sub.SubmitterName, &sub.Note,
		&sub.FileCount, &sub.TotalSize, &sub.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &sub, err
}

// CreateCollectionInput 是创建收集任务的输入。
type CreateCollectionInput struct {
	OwnerUserID    int64
	Title          string
	Description    string
	ExpiresInHours *int64
	Password       string
	MaxFileSizeMB  *int64
	MaxTotalSizeMB *int64
	RequireName    bool
	RequireNote    bool
	AllowedExts    []string
}

// CreateCollection 创建收集任务，返回记录与一次性展示的明文收件码。
func (s *Service) CreateCollection(in CreateCollectionInput) (*Collection, string, error) {
	src, err := s.capabilities.ResolveSource("transfer_center")
	if err != nil {
		return nil, "", fmt.Errorf("流转中心未开启或未绑定存储源")
	}
	if in.MaxFileSizeMB != nil && *in.MaxFileSizeMB <= 0 {
		return nil, "", ErrSettingsInvalid
	}
	if in.MaxTotalSizeMB != nil && *in.MaxTotalSizeMB <= 0 {
		return nil, "", ErrSettingsInvalid
	}
	if err := s.managedRoots.Ensure(src); err != nil {
		return nil, "", err
	}
	settings, err := s.GetSettings()
	if err != nil {
		return nil, "", err
	}
	expiresAt, err := computeExpiry(in.ExpiresInHours, settings.DefaultExpiryHours)
	if err != nil {
		return nil, "", err
	}
	exts := make([]string, 0, len(in.AllowedExts))
	for _, ext := range in.AllowedExts {
		ext = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
		if ext != "" {
			exts = append(exts, ext)
		}
	}
	publicKey := auth.NewRandomToken("tc-", 12)
	code := generatePickupCode()
	now := time.Now().UTC()
	passwordHash := ""
	if strings.TrimSpace(in.Password) != "" {
		hash, hashErr := auth.HashPassword(in.Password)
		if hashErr != nil {
			return nil, "", hashErr
		}
		passwordHash = hash
	}
	result, err := s.db.Exec(`INSERT INTO transfer_collections
  (public_key, owner_user_id, storage_source_id, title, description, code_hash, password_hash,
   max_file_size, max_total_size, require_name, require_note, allowed_exts, expires_at, status,
   created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
		publicKey, in.OwnerUserID, src.ID, in.Title, in.Description, s.codeDigest(code),
		nullableString(passwordHash), mbToBytes(in.MaxFileSizeMB), mbToBytes(in.MaxTotalSizeMB),
		in.RequireName, in.RequireNote, strings.Join(exts, ","), nullableTime(expiresAt), now, now)
	if err != nil {
		return nil, "", err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, "", err
	}
	row, err := s.getCollectionByID(id)
	if err != nil {
		return nil, "", err
	}
	return &row.collection, code, nil
}

func mbToBytes(mb *int64) any {
	if mb == nil {
		return nil
	}
	return *mb * 1024 * 1024
}

func (s *Service) getCollectionByID(id int64) (*collectionRow, error) {
	return scanCollection(s.db.QueryRow(`SELECT `+collectionColumns+`,
  COALESCE(c.password_hash, ''), c.code_hash
  FROM transfer_collections c JOIN storage_sources s ON s.id = c.storage_source_id
  WHERE c.id = ?`, id))
}

func (s *Service) getCollectionByKey(publicKey string) (*collectionRow, error) {
	return scanCollection(s.db.QueryRow(`SELECT `+collectionColumns+`,
  COALESCE(c.password_hash, ''), c.code_hash
  FROM transfer_collections c JOIN storage_sources s ON s.id = c.storage_source_id
  WHERE c.public_key = ?`, publicKey))
}

// ListCollectionsByOwner 返回用户创建的收集任务。
func (s *Service) ListCollectionsByOwner(ownerUserID int64) ([]*Collection, error) {
	rows, err := s.db.Query(`SELECT `+collectionColumns+` FROM transfer_collections c
  JOIN storage_sources s ON s.id = c.storage_source_id
  WHERE c.owner_user_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 200`, ownerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Collection{}
	for rows.Next() {
		row, err := scanCollection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, &row.collection)
	}
	return out, rows.Err()
}

func (s *Service) loadOwnCollection(collectionID, ownerUserID int64) (*collectionRow, error) {
	row, err := s.getCollectionByID(collectionID)
	if err != nil {
		return nil, err
	}
	if row.collection.OwnerUserID != ownerUserID {
		return nil, ErrNotFound
	}
	return row, nil
}

// CloseCollection 关闭收集任务：后续提交拒绝，已有提交保留可下载。
func (s *Service) CloseCollection(collectionID, ownerUserID int64) error {
	row, err := s.loadOwnCollection(collectionID, ownerUserID)
	if err != nil {
		return err
	}
	if row.collection.Status != "active" {
		return ErrConflictState
	}
	now := time.Now().UTC()
	_, err = s.db.Exec(`UPDATE transfer_collections SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?`,
		now, now, row.collection.ID)
	return err
}

// --- 公开提交（Collect） ---

// CollectionPublicInfo 是访客可见的收集任务摘要与表单约束。
type CollectionPublicInfo struct {
	PublicKey   string     `json:"public_key"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	HasPassword bool       `json:"has_password"`
	MaxFileSize *int64     `json:"max_file_size"`
	RequireName bool       `json:"require_name"`
	RequireNote bool       `json:"require_note"`
	AllowedExts []string   `json:"allowed_exts"`
	ExpiresAt   *time.Time `json:"expires_at"`
}

// LookupCollection 公开解析收集任务；关闭 → ErrClosed，撤销 → ErrNotFound，过期 → ErrExpired。
func (s *Service) LookupCollection(publicKey string) (*CollectionPublicInfo, error) {
	row, err := s.getCollectionByKey(publicKey)
	if err != nil {
		return nil, err
	}
	if err := checkCollectionReceivable(&row.collection); err != nil {
		return nil, err
	}
	return &CollectionPublicInfo{
		PublicKey:   row.collection.PublicKey,
		Title:       row.collection.Title,
		Description: row.collection.Description,
		HasPassword: row.collection.HasPassword,
		MaxFileSize: row.collection.MaxFileSize,
		RequireName: row.collection.RequireName,
		RequireNote: row.collection.RequireNote,
		AllowedExts: row.collection.AllowedExts,
		ExpiresAt:   row.collection.ExpiresAt,
	}, nil
}

func checkCollectionReceivable(collection *Collection) error {
	switch collection.Status {
	case "active":
	case "closed":
		return ErrClosed
	case "revoked", "expired":
		return ErrNotFound
	default:
		return ErrNotFound
	}
	if collection.ExpiresAt != nil && !time.Now().Before(*collection.ExpiresAt) {
		return ErrExpired
	}
	return nil
}

// UnlockCollection 校验收件码与可选密码，签发提交会话。
func (s *Service) UnlockCollection(publicKey, code, password string) (string, time.Time, error) {
	row, err := s.getCollectionByKey(publicKey)
	if err != nil {
		return "", time.Time{}, ErrNotFound
	}
	if err := checkCollectionReceivable(&row.collection); err != nil {
		return "", time.Time{}, err
	}
	if !s.verifyCode(row.codeHash, code) {
		return "", time.Time{}, ErrPickupCode
	}
	if row.passwordHash != "" && !auth.VerifyPassword(row.passwordHash, password) {
		return "", time.Time{}, ErrPassword
	}
	return s.createSession(0, row.collection.ID, row.collection.ExpiresAt)
}

// IncomingSubmissionFile 是提交中的一个待写文件。
type IncomingSubmissionFile struct {
	RelativePath string
	Body         io.Reader
}

// SubmitToCollection 处理一次匿名提交：
// 校验约束 → 预插提交行 → 逐文件写入托管目录（限额截断）→ 单事务提交文件台账与总量。
// 中断会留下无台账提交行/目录，由 GC 在 orphanDirAfter 后清理。
func (s *Service) SubmitToCollection(publicKey, sessionToken, submitterName, note string, incoming []IncomingSubmissionFile) (*Submission, error) {
	row, err := s.getCollectionByKey(publicKey)
	if err != nil {
		return nil, err
	}
	if err := s.checkSession(0, row.collection.ID, sessionToken); err != nil {
		return nil, err
	}
	if err := checkCollectionReceivable(&row.collection); err != nil {
		return nil, err
	}
	if row.collection.RequireName && strings.TrimSpace(submitterName) == "" {
		return nil, ErrNameRequired
	}
	if row.collection.RequireNote && strings.TrimSpace(note) == "" {
		return nil, ErrNoteRequired
	}
	src, err := s.sources.GetByID(row.sourceID)
	if err != nil {
		return nil, err
	}

	// 活跃配额 + 本次收集总量剩余，二者取小作为总写入上限。
	totalCap, totalLimited, err := s.submitTotalCap(&row.collection)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	result, err := s.db.Exec(`INSERT INTO transfer_submissions
  (collection_id, submitter_name, note, created_at) VALUES (?, ?, ?, ?)`,
		row.collection.ID, submitterName, note, now)
	if err != nil {
		return nil, err
	}
	submissionID, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	rollback := func(err error) (*Submission, error) {
		_, _ = s.db.Exec(`DELETE FROM transfer_submissions WHERE id = ?`, submissionID)
		_ = s.files.DeleteManaged(src, collectPayloadRel(row.collection.PublicKey, submissionID, ""), ManagedScopeDir)
		return nil, err
	}

	quotaGuard, err := s.files.BeginQuotaWrite(src, "")
	if err != nil {
		return rollback(err)
	}
	defer quotaGuard.Close()
	sourceMax, sourceLimited := quotaGuard.MaxBytes()
	if totalLimited && (!sourceLimited || totalCap < sourceMax) {
		sourceMax = totalCap
		sourceLimited = true
	}

	var written int64
	type stagedFile struct {
		rel  string
		size int64
		ext  string
		mime string
	}
	staged := make([]stagedFile, 0, len(incoming))
	for _, item := range incoming {
		relPath, err := security.NormalizeRelPath(item.RelativePath)
		if err != nil || relPath == "" {
			return rollback(fmt.Errorf("%w: 非法的提交路径", files.ErrInvalid))
		}
		if err := security.ValidateUserRelPath(relPath); err != nil {
			return rollback(fmt.Errorf("%w: %v", files.ErrInvalid, err))
		}
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(relPath), "."))
		if len(row.collection.AllowedExts) > 0 {
			allowed := false
			for _, candidate := range row.collection.AllowedExts {
				if ext == candidate {
					allowed = true
					break
				}
			}
			if !allowed {
				return rollback(ErrTypeNotAllowed)
			}
		}
		var fileCap int64 = sourceMax - written
		fileLimited := sourceLimited
		if row.collection.MaxFileSize != nil && (!fileLimited || *row.collection.MaxFileSize < fileCap) {
			fileCap = *row.collection.MaxFileSize
			fileLimited = true
		}
		// 限额截断：写满上限 +1 字节判定超限。
		reader := item.Body
		if fileLimited {
			reader = io.LimitReader(item.Body, fileCap+1)
		}
		finalRel := collectPayloadRel(row.collection.PublicKey, submissionID, relPath)
		size, err := s.files.WriteManagedFile(src, finalRel, ManagedScopeDir, reader, fileCap, fileLimited)
		if errors.Is(err, files.ErrQuotaExceeded) {
			if row.collection.MaxFileSize != nil && fileCap == *row.collection.MaxFileSize {
				return rollback(ErrFileSizeExceeded)
			}
			return rollback(ErrTotalSizeExceeded)
		}
		if err != nil {
			return rollback(err)
		}
		written += size
		staged = append(staged, stagedFile{rel: relPath, size: size, ext: ext, mime: mime.TypeByExtension(filepath.Ext(relPath))})
	}
	if len(staged) == 0 {
		return rollback(fmt.Errorf("%w: 提交为空", files.ErrInvalid))
	}

	tx, err := s.db.Begin()
	if err != nil {
		return rollback(err)
	}
	defer tx.Rollback()
	for _, file := range staged {
		if _, err := tx.Exec(`INSERT INTO transfer_submission_files
  (submission_id, relative_path, size, ext, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			submissionID, file.rel, file.size, file.ext, file.mime, now); err != nil {
			return rollback(err)
		}
	}
	if _, err := tx.Exec(`UPDATE transfer_submissions SET file_count = ?, total_size = ? WHERE id = ?`,
		len(staged), written, submissionID); err != nil {
		return rollback(err)
	}
	if _, err := tx.Exec(`UPDATE transfer_collections
  SET total_files = total_files + ?, total_size = total_size + ?, updated_at = ? WHERE id = ?`,
		len(staged), written, now, row.collection.ID); err != nil {
		return rollback(err)
	}
	if err := tx.Commit(); err != nil {
		return rollback(err)
	}
	return &Submission{
		ID: submissionID, CollectionID: row.collection.ID,
		SubmitterName: submitterName, Note: note,
		FileCount: int64(len(staged)), TotalSize: written, CreatedAt: now,
	}, nil
}

// submitTotalCap 计算本次收集的剩余可写字节。
func (s *Service) submitTotalCap(collection *Collection) (int64, bool, error) {
	activeRemaining, activeUnlimited, err := s.activeQuotaRemaining()
	if err != nil {
		return 0, false, err
	}
	cap, limited := activeRemaining, !activeUnlimited
	if collection.MaxTotalSize != nil {
		remaining := *collection.MaxTotalSize - collection.TotalSize
		if remaining < 0 {
			remaining = 0
		}
		if !limited || remaining < cap {
			cap = remaining
			limited = true
		}
	}
	return cap, limited, nil
}

func collectPayloadRel(publicKey string, submissionID int64, logicalRel string) string {
	base := security.ManagedNamespaceSegment + "/" + ManagedScopeDir + "/" + collectDir + "/" + publicKey
	if submissionID == 0 {
		return base
	}
	base = fmt.Sprintf("%s/%d", base, submissionID)
	if logicalRel == "" {
		return base
	}
	return base + "/" + logicalRel
}

// --- 收件箱（Owner） ---

// ListSubmissions 返回收集任务的收件箱（含文件清单）。
func (s *Service) ListSubmissions(collectionID, ownerUserID int64) ([]*Submission, error) {
	if _, err := s.loadOwnCollection(collectionID, ownerUserID); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT `+submissionColumns+` FROM transfer_submissions
  WHERE collection_id = ? ORDER BY created_at DESC, id DESC LIMIT 500`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Submission{}
	ids := []int64{}
	for rows.Next() {
		sub, err := scanSubmission(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sub)
		ids = append(ids, sub.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	filesBySubmission := map[int64][]SubmissionFile{}
	if len(ids) > 0 {
		fileRows, err := s.db.Query(`SELECT submission_id, id, relative_path, size, mime_type, created_at
  FROM transfer_submission_files WHERE submission_id IN (`+placeholders(len(ids))+`)
  ORDER BY relative_path`, toAny(ids)...)
		if err != nil {
			return nil, err
		}
		defer fileRows.Close()
		for fileRows.Next() {
			var submissionID int64
			var file SubmissionFile
			if err := fileRows.Scan(&submissionID, &file.ID, &file.RelativePath, &file.Size, &file.MimeType, &file.CreatedAt); err != nil {
				return nil, err
			}
			filesBySubmission[submissionID] = append(filesBySubmission[submissionID], file)
		}
		if err := fileRows.Err(); err != nil {
			return nil, err
		}
	}
	for _, sub := range out {
		for _, file := range filesBySubmission[sub.ID] {
			sub.Files = append(sub.Files, file)
		}
	}
	return out, nil
}

// OpenSubmissionFile 供收件箱预览/下载：按台账打开提交文件。
func (s *Service) OpenSubmissionFile(collectionID, ownerUserID, submissionID, fileID int64) (*models.StorageSource, string, *os.File, os.FileInfo, func(), error) {
	if _, err := s.loadOwnCollection(collectionID, ownerUserID); err != nil {
		return nil, "", nil, nil, nil, err
	}
	var publicKey string
	var relativePath string
	err := s.db.QueryRow(`SELECT c.public_key, f.relative_path
  FROM transfer_submissions sub
  JOIN transfer_collections c ON c.id = sub.collection_id
  JOIN transfer_submission_files f ON f.submission_id = sub.id
  WHERE sub.collection_id = ? AND sub.id = ? AND f.id = ?`,
		collectionID, submissionID, fileID).Scan(&publicKey, &relativePath)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, "", nil, nil, nil, ErrNotFound
		}
		return nil, "", nil, nil, nil, err
	}
	row, err := s.getCollectionByID(collectionID)
	if err != nil {
		return nil, "", nil, nil, nil, err
	}
	src, err := s.sources.GetByID(row.sourceID)
	if err != nil {
		return nil, "", nil, nil, nil, err
	}
	f, info, unlock, err := s.files.OpenManagedForRead(src, collectPayloadRel(publicKey, submissionID, relativePath), ManagedScopeDir)
	if err != nil {
		return nil, "", nil, nil, nil, ErrNotFound
	}
	return src, relativePath, f, info, unlock, nil
}

// SaveSubmissionToFiles 把提交文件复制到有写权限的普通目录（复制而非搬移）。
// 目标目录策略授权由 HTTP 层完成；同名文件拒绝覆盖。
func (s *Service) SaveSubmissionToFiles(collectionID, ownerUserID, submissionID int64, targetSourceKey, targetDir string) ([]string, error) {
	if _, err := s.loadOwnCollection(collectionID, ownerUserID); err != nil {
		return nil, err
	}
	targetSrc, err := s.sources.Get(targetSourceKey)
	if err != nil {
		return nil, err
	}
	targetRoot, err := security.NormalizeRelPath(targetDir)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", files.ErrInvalid, err)
	}
	_, src, _, _, unlockAll, err := s.openSubmissionPayload(collectionID, ownerUserID, submissionID)
	if err != nil {
		return nil, err
	}
	defer unlockAll()
	saved := []string{}
	for _, file := range submissionFileList(s.db, submissionID) {
		relPath, err := security.NormalizeRelPath(file.RelativePath)
		if err != nil {
			return saved, err
		}
		target := relPath
		if targetRoot != "" {
			target = targetRoot + "/" + relPath
		}
		if err := s.files.EnsureObjectParents(targetSrc, target); err != nil {
			return saved, err
		}
		dir := filepath.ToSlash(filepath.Dir(target))
		name := filepath.Base(target)
		if dir == "." {
			dir = ""
		}
		f, info, unlock, err := s.files.OpenManagedForRead(src, collectPayloadRel(publicKeyOf(collectionID, submissionID, s.db), submissionID, file.RelativePath), ManagedScopeDir)
		if err != nil {
			return saved, ErrNotFound
		}
		_, _, err = s.files.UploadWithLockTokens(targetSrc, dir, name, f, false, nil, &ownerUserID)
		unlock()
		if err != nil {
			return saved, err
		}
		_ = info
		saved = append(saved, target)
	}
	return saved, nil
}

func publicKeyOf(collectionID, submissionID int64, db *sql.DB) string {
	var publicKey string
	_ = db.QueryRow(`SELECT c.public_key FROM transfer_submissions sub
  JOIN transfer_collections c ON c.id = sub.collection_id WHERE sub.id = ?`, submissionID).Scan(&publicKey)
	_ = collectionID
	return publicKey
}

func submissionFileList(db *sql.DB, submissionID int64) []SubmissionFile {
	rows, err := db.Query(`SELECT id, relative_path, size, mime_type, created_at
  FROM transfer_submission_files WHERE submission_id = ? ORDER BY relative_path`, submissionID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []SubmissionFile{}
	for rows.Next() {
		var file SubmissionFile
		if err := rows.Scan(&file.ID, &file.RelativePath, &file.Size, &file.MimeType, &file.CreatedAt); err != nil {
			return out
		}
		out = append(out, file)
	}
	return out
}

// openSubmissionPayload 打开提交目录并返回源与聚合解锁（复制流程用）。
func (s *Service) openSubmissionPayload(collectionID, ownerUserID, submissionID int64) (string, *models.StorageSource, string, int64, func(), error) {
	if _, err := s.loadOwnCollection(collectionID, ownerUserID); err != nil {
		return "", nil, "", 0, nil, err
	}
	row, err := s.getCollectionByID(collectionID)
	if err != nil {
		return "", nil, "", 0, nil, err
	}
	src, err := s.sources.GetByID(row.sourceID)
	if err != nil {
		return "", nil, "", 0, nil, err
	}
	var publicKey string
	var totalSize int64
	err = s.db.QueryRow(`SELECT c.public_key, sub.total_size FROM transfer_submissions sub
  JOIN transfer_collections c ON c.id = sub.collection_id WHERE sub.id = ?`,
		submissionID).Scan(&publicKey, &totalSize)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil, "", 0, nil, ErrNotFound
	}
	if err != nil {
		return "", nil, "", 0, nil, err
	}
	// 复制期间持有整棵提交目录的读锁语义：这里以目录路径加读锁。
	unlock := s.files.Locks().RLock(locksTransferKey(src.Key, collectPayloadRel(publicKey, submissionID, "")))
	return row.collection.PublicKey, src, publicKey, totalSize, unlock, nil
}

func locksTransferKey(sourceKey, rel string) string {
	return "transfer:" + sourceKey + ":" + rel
}

func placeholders(n int) string {
	out := make([]string, n)
	for i := range out {
		out[i] = "?"
	}
	return strings.Join(out, ",")
}

func toAny(values []int64) []any {
	out := make([]any, len(values))
	for i, value := range values {
		out[i] = value
	}
	return out
}
