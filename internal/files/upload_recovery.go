package files

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

const uploadOperationVersion = 1

type uploadOperation struct {
	Version            int       `json:"version"`
	OperationID        string    `json:"operation_id"`
	StorageSourceID    int64     `json:"storage_source_id"`
	TempRelativePath   string    `json:"temp_relative_path"`
	FinalRelativePath  string    `json:"final_relative_path"`
	BackupRelativePath string    `json:"backup_relative_path,omitempty"`
	ReplacedExisting   bool      `json:"replaced_existing"`
	Size               int64     `json:"size"`
	ContentSHA256      string    `json:"content_sha256"`
	MTimeUnixNano      int64     `json:"mtime_unix_nano"`
	OwnerType          string    `json:"owner_type"`
	OwnerUserID        *int64    `json:"owner_user_id,omitempty"`
	ActorUserID        *int64    `json:"actor_user_id,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
}

// FileUploadRecoveryResult 描述启动时完成或回滚的普通文件上传。
type FileUploadRecoveryResult struct {
	CompletedUploads  int `json:"completed_uploads"`
	RolledBackUploads int `json:"rolled_back_uploads"`
}

func (s *Service) uploadOperationsDir() string {
	return filepath.Join(s.sources.DataDir(), "operations", "file-uploads")
}

func (s *Service) uploadOperationPath(operationID string) string {
	return filepath.Join(s.uploadOperationsDir(), operationID+".json")
}

func (s *Service) uploadDatabaseReadyPath(operationID string) string {
	return filepath.Join(s.uploadOperationsDir(), operationID+".database-ready")
}

func validUploadOperationID(value string) bool {
	if !strings.HasPrefix(value, "upl-") || len(value) != len("upl-")+24 {
		return false
	}
	_, err := hex.DecodeString(strings.TrimPrefix(value, "upl-"))
	return err == nil
}

func validUploadBackupName(value string) bool {
	const prefix = ".omnistore-upload-"
	const suffix = ".backup"
	if !strings.HasPrefix(value, prefix) || !strings.HasSuffix(value, suffix) {
		return false
	}
	token := strings.TrimSuffix(strings.TrimPrefix(value, prefix), suffix)
	if len(token) != 24 {
		return false
	}
	_, err := hex.DecodeString(token)
	return err == nil
}

func validateUploadOperation(op uploadOperation) error {
	if op.Version != uploadOperationVersion || !validUploadOperationID(op.OperationID) ||
		op.StorageSourceID <= 0 || op.Size < 0 || op.MTimeUnixNano <= 0 || op.CreatedAt.IsZero() ||
		len(op.ContentSHA256) != sha256.Size*2 {
		return fmt.Errorf("非法普通上传操作日志")
	}
	if _, err := hex.DecodeString(op.ContentSHA256); err != nil {
		return fmt.Errorf("非法普通上传内容摘要")
	}
	if op.OwnerType == models.FileOwnerUser {
		if op.OwnerUserID == nil || *op.OwnerUserID <= 0 {
			return fmt.Errorf("用户上传缺少所有者")
		}
	} else if op.OwnerType != models.FileOwnerUnowned || op.OwnerUserID != nil {
		return fmt.Errorf("非法普通上传所有者")
	}
	if op.ActorUserID != nil && *op.ActorUserID <= 0 {
		return fmt.Errorf("非法普通上传操作者")
	}
	for label, value := range map[string]string{
		"临时": op.TempRelativePath, "最终": op.FinalRelativePath,
	} {
		normalized, err := security.NormalizeRelPath(value)
		if err != nil || normalized == "" || normalized != value {
			return fmt.Errorf("非法普通上传%s路径", label)
		}
	}
	finalDir := filepath.ToSlash(filepath.Dir(filepath.FromSlash(op.FinalRelativePath)))
	if filepath.ToSlash(filepath.Dir(filepath.FromSlash(op.TempRelativePath))) != finalDir ||
		!uploadTempName.MatchString(filepath.Base(filepath.FromSlash(op.TempRelativePath))) {
		return fmt.Errorf("普通上传临时文件不在最终目录")
	}
	if op.ReplacedExisting {
		normalized, err := security.NormalizeRelPath(op.BackupRelativePath)
		if err != nil || normalized == "" || normalized != op.BackupRelativePath ||
			filepath.ToSlash(filepath.Dir(filepath.FromSlash(op.BackupRelativePath))) != finalDir ||
			!validUploadBackupName(filepath.Base(filepath.FromSlash(op.BackupRelativePath))) {
			return fmt.Errorf("非法普通上传备份路径")
		}
	} else if op.BackupRelativePath != "" {
		return fmt.Errorf("新建上传不能包含备份路径")
	}
	return nil
}

func (s *Service) newUploadOperation(src *models.StorageSource, finalRel, tempAbs string,
	replaced bool, size int64, contentSHA256, ownerType string, ownerUserID, actorUserID *int64) (uploadOperation, error) {
	tempRel, err := filepath.Rel(src.RootPath, tempAbs)
	if err != nil {
		return uploadOperation{}, err
	}
	tempRel = filepath.ToSlash(tempRel)
	info, err := os.Lstat(tempAbs)
	if err != nil {
		return uploadOperation{}, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() != size {
		return uploadOperation{}, ErrUnsupported
	}
	op := uploadOperation{
		Version: uploadOperationVersion, OperationID: auth.NewRandomToken("upl-", 12),
		StorageSourceID: src.ID, TempRelativePath: tempRel, FinalRelativePath: finalRel,
		ReplacedExisting: replaced, Size: size, ContentSHA256: contentSHA256,
		MTimeUnixNano: info.ModTime().UnixNano(),
		OwnerType:     ownerType, OwnerUserID: ownerUserID, ActorUserID: actorUserID,
		CreatedAt: time.Now().UTC(),
	}
	if replaced {
		backupName := ".omnistore-upload-" + strings.TrimPrefix(op.OperationID, "upl-") + ".backup"
		dir := filepath.ToSlash(filepath.Dir(filepath.FromSlash(finalRel)))
		if dir == "." {
			op.BackupRelativePath = backupName
		} else {
			op.BackupRelativePath = dir + "/" + backupName
		}
	}
	if err := validateUploadOperation(op); err != nil {
		return uploadOperation{}, err
	}
	return op, nil
}

func (s *Service) writeUploadOperation(op uploadOperation) error {
	if err := validateUploadOperation(op); err != nil {
		return err
	}
	dir := s.uploadOperationsDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("创建普通上传日志目录失败: %w", err)
	}
	if _, err := os.Lstat(s.uploadOperationPath(op.OperationID)); err == nil {
		return fmt.Errorf("普通上传 %s 尚未恢复", op.OperationID)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if err := os.Remove(s.uploadDatabaseReadyPath(op.OperationID)); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	temp, err := os.CreateTemp(dir, ".operation-*.tmp")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	keepTemp := true
	defer func() {
		_ = temp.Close()
		if keepTemp {
			_ = os.Remove(tempPath)
		}
	}()
	if err := temp.Chmod(0o600); err != nil {
		return err
	}
	if err := json.NewEncoder(temp).Encode(op); err != nil {
		return err
	}
	if err := temp.Sync(); err != nil {
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Link(tempPath, s.uploadOperationPath(op.OperationID)); err != nil {
		return fmt.Errorf("提交普通上传日志失败: %w", err)
	}
	if err := os.Remove(tempPath); err != nil {
		return err
	}
	keepTemp = false
	return syncDirectory(dir)
}

func createUploadMarker(path, dir string) error {
	handle, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if errors.Is(err, fs.ErrExist) {
		exists, checkErr := uploadMarkerExists(path)
		if checkErr != nil {
			return checkErr
		}
		if !exists {
			return fmt.Errorf("普通上传阶段标记不存在")
		}
		return nil
	}
	if err != nil {
		return err
	}
	if err := handle.Sync(); err != nil {
		_ = handle.Close()
		_ = os.Remove(path)
		return err
	}
	if err := handle.Close(); err != nil {
		_ = os.Remove(path)
		return err
	}
	return syncDirectory(dir)
}

func (s *Service) markUploadDatabaseReady(operationID string) error {
	return createUploadMarker(s.uploadDatabaseReadyPath(operationID), s.uploadOperationsDir())
}

func uploadMarkerExists(path string) (bool, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return false, fmt.Errorf("普通上传阶段标记 %s 不是普通文件", filepath.Base(path))
	}
	return true, nil
}

func (s *Service) uploadPaths(op uploadOperation, src *models.StorageSource) (tempAbs, finalAbs, backupAbs string, err error) {
	tempAbs, err = security.ResolveInSource(src.RootPath, op.TempRelativePath)
	if err != nil {
		return "", "", "", err
	}
	finalAbs, err = security.ResolveInSource(src.RootPath, op.FinalRelativePath)
	if err != nil {
		return "", "", "", err
	}
	if op.BackupRelativePath != "" {
		backupAbs, err = security.ResolveInSource(src.RootPath, op.BackupRelativePath)
	}
	return tempAbs, finalAbs, backupAbs, err
}

func checkedUploadFile(absPath, relPath string) (bool, os.FileInfo, error) {
	info, err := os.Lstat(absPath)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil, nil
	}
	if err != nil {
		return false, nil, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return false, nil, fmt.Errorf("普通上传恢复路径 %s 不是普通文件", relPath)
	}
	return true, info, nil
}

func uploadFileMatches(absPath string, info os.FileInfo, op uploadOperation) (bool, error) {
	if info == nil || info.Size() != op.Size || info.ModTime().UnixNano() != op.MTimeUnixNano {
		return false, nil
	}
	handle, err := os.Open(absPath)
	if err != nil {
		return false, err
	}
	hasher := sha256.New()
	_, copyErr := io.Copy(hasher, handle)
	closeErr := handle.Close()
	if copyErr != nil || closeErr != nil {
		return false, errors.Join(copyErr, closeErr)
	}
	return fmt.Sprintf("%x", hasher.Sum(nil)) == op.ContentSHA256, nil
}

func (s *Service) installUploadedFile(op uploadOperation, tempAbs, finalAbs string) error {
	if op.ReplacedExisting {
		backupAbs := filepath.Join(filepath.Dir(finalAbs), filepath.Base(filepath.FromSlash(op.BackupRelativePath)))
		if err := os.Rename(finalAbs, backupAbs); err != nil {
			return fmt.Errorf("保留被覆盖文件失败: %w", err)
		}
		if err := syncDirectory(filepath.Dir(finalAbs)); err != nil {
			return fmt.Errorf("同步上传备份目录失败: %w", err)
		}
	}
	if err := os.Rename(tempAbs, finalAbs); err != nil {
		return fmt.Errorf("提交上传文件失败: %w", err)
	}
	if err := syncDirectory(filepath.Dir(finalAbs)); err != nil {
		return fmt.Errorf("同步上传目标目录失败: %w", err)
	}
	return nil
}

func (s *Service) removeUploadJournal(operationID string) error {
	for _, item := range []string{s.uploadOperationPath(operationID), s.uploadDatabaseReadyPath(operationID)} {
		if err := os.Remove(item); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	return syncDirectory(s.uploadOperationsDir())
}

func (s *Service) finishUploadOperation(op uploadOperation, src *models.StorageSource) error {
	tempAbs, _, backupAbs, err := s.uploadPaths(op, src)
	if err != nil {
		return err
	}
	for _, item := range []string{tempAbs, backupAbs} {
		if item == "" {
			continue
		}
		if err := os.Remove(item); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	if err := syncDirectory(filepath.Dir(tempAbs)); err != nil {
		return err
	}
	return s.removeUploadJournal(op.OperationID)
}

func (s *Service) rollbackUploadOperation(op uploadOperation, src *models.StorageSource) error {
	tempAbs, finalAbs, backupAbs, err := s.uploadPaths(op, src)
	if err != nil {
		return err
	}
	tempExists, _, err := checkedUploadFile(tempAbs, op.TempRelativePath)
	if err != nil {
		return err
	}
	finalExists, finalInfo, err := checkedUploadFile(finalAbs, op.FinalRelativePath)
	if err != nil {
		return err
	}
	backupExists := false
	if backupAbs != "" {
		backupExists, _, err = checkedUploadFile(backupAbs, op.BackupRelativePath)
		if err != nil {
			return err
		}
	}
	finalMatches := false
	if finalExists {
		finalMatches, err = uploadFileMatches(finalAbs, finalInfo, op)
		if err != nil {
			return err
		}
	}
	if op.ReplacedExisting {
		if backupExists && finalExists && !finalMatches {
			return fmt.Errorf("普通上传 %s 的目标已被外部修改，不能安全回滚", op.OperationID)
		}
		if !backupExists && !finalExists {
			return fmt.Errorf("普通上传 %s 的目标与旧文件备份均不存在", op.OperationID)
		}
		if !backupExists && finalExists && finalMatches && !tempExists {
			return fmt.Errorf("普通上传 %s 的旧文件备份不存在，不能安全回滚", op.OperationID)
		}
	} else if finalExists && !finalMatches {
		return fmt.Errorf("普通上传 %s 的目标已被外部修改，不能安全回滚", op.OperationID)
	}
	if tempExists {
		if err := os.Remove(tempAbs); err != nil {
			return err
		}
	}
	if op.ReplacedExisting {
		if backupExists {
			if finalExists {
				if err := os.Remove(finalAbs); err != nil {
					return err
				}
			}
			if err := os.Rename(backupAbs, finalAbs); err != nil {
				return err
			}
		}
	} else if finalExists {
		if err := os.Remove(finalAbs); err != nil {
			return err
		}
	}
	if err := syncDirectory(filepath.Dir(finalAbs)); err != nil {
		return err
	}
	return s.removeUploadJournal(op.OperationID)
}

func decodeUploadOperation(handle io.Reader) (uploadOperation, error) {
	var op uploadOperation
	decoder := json.NewDecoder(handle)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&op); err != nil {
		return uploadOperation{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return uploadOperation{}, fmt.Errorf("操作日志包含额外 JSON 值")
		}
		return uploadOperation{}, err
	}
	return op, nil
}

// SourceFileUploadOperationCount 返回仍依赖该存储源的普通上传数量。
func (s *Service) SourceFileUploadOperationCount(storageSourceID int64) (int, error) {
	entries, err := os.ReadDir(s.uploadOperationsDir())
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return 0, fmt.Errorf("普通上传操作日志 %s 不能是符号链接", entry.Name())
		}
		handle, err := os.Open(filepath.Join(s.uploadOperationsDir(), entry.Name()))
		if err != nil {
			return 0, err
		}
		op, decodeErr := decodeUploadOperation(handle)
		closeErr := handle.Close()
		if decodeErr != nil {
			return 0, fmt.Errorf("读取普通上传操作日志 %s 失败: %w", entry.Name(), decodeErr)
		}
		if closeErr != nil {
			return 0, closeErr
		}
		if err := validateUploadOperation(op); err != nil || entry.Name() != op.OperationID+".json" {
			return 0, fmt.Errorf("普通上传操作日志 %s 非法", entry.Name())
		}
		if op.StorageSourceID == storageSourceID {
			count++
		}
	}
	return count, nil
}

func (s *Service) cleanupUploadRecoveryArtifacts(entries []os.DirEntry) error {
	dir := s.uploadOperationsDir()
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".operation-") && strings.HasSuffix(name, ".tmp") {
			if err := os.Remove(filepath.Join(dir, name)); err != nil {
				return err
			}
			continue
		}
		if strings.HasSuffix(name, ".database-ready") {
			operationID := strings.TrimSuffix(name, ".database-ready")
			if _, err := os.Stat(s.uploadOperationPath(operationID)); errors.Is(err, fs.ErrNotExist) {
				if err := os.Remove(filepath.Join(dir, name)); err != nil && !errors.Is(err, fs.ErrNotExist) {
					return err
				}
			} else if err != nil {
				return err
			}
		}
	}
	return nil
}

// RecoverFileUploadOperations 在监听服务前恢复普通 REST、WebDAV 与 S3 共用上传。
func (s *Service) RecoverFileUploadOperations() (FileUploadRecoveryResult, error) {
	result := FileUploadRecoveryResult{}
	dir := s.uploadOperationsDir()
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	if err := s.cleanupUploadRecoveryArtifacts(entries); err != nil {
		return result, err
	}
	entries, err = os.ReadDir(dir)
	if err != nil {
		return result, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return result, fmt.Errorf("普通上传操作日志 %s 不能是符号链接", entry.Name())
		}
		handle, err := os.Open(filepath.Join(dir, entry.Name()))
		if err != nil {
			return result, err
		}
		op, decodeErr := decodeUploadOperation(handle)
		closeErr := handle.Close()
		if decodeErr != nil {
			return result, fmt.Errorf("读取普通上传操作日志 %s 失败: %w", entry.Name(), decodeErr)
		}
		if closeErr != nil {
			return result, closeErr
		}
		if err := validateUploadOperation(op); err != nil {
			return result, fmt.Errorf("普通上传操作日志 %s 非法: %w", entry.Name(), err)
		}
		if entry.Name() != op.OperationID+".json" {
			return result, fmt.Errorf("普通上传操作日志文件名 %s 与 operation_id 不一致", entry.Name())
		}
		src, err := s.sources.GetByID(op.StorageSourceID)
		if err != nil {
			return result, fmt.Errorf("普通上传 %s 的存储源不存在: %w", op.OperationID, err)
		}
		databaseReady, err := uploadMarkerExists(s.uploadDatabaseReadyPath(op.OperationID))
		if err != nil {
			return result, err
		}
		if databaseReady {
			if err := s.finishUploadOperation(op, src); err != nil {
				return result, err
			}
			result.CompletedUploads++
			continue
		}

		tempAbs, finalAbs, backupAbs, err := s.uploadPaths(op, src)
		if err != nil {
			return result, err
		}
		tempExists, _, err := checkedUploadFile(tempAbs, op.TempRelativePath)
		if err != nil {
			return result, err
		}
		finalExists, finalInfo, err := checkedUploadFile(finalAbs, op.FinalRelativePath)
		if err != nil {
			return result, err
		}
		backupExists := false
		if backupAbs != "" {
			backupExists, _, err = checkedUploadFile(backupAbs, op.BackupRelativePath)
			if err != nil {
				return result, err
			}
		}
		finalMatches := false
		if finalExists {
			finalMatches, err = uploadFileMatches(finalAbs, finalInfo, op)
			if err != nil {
				return result, err
			}
		}
		canComplete := !tempExists && finalExists && finalMatches
		if canComplete {
			if err := s.RecordFile(src, op.FinalRelativePath, op.OwnerType, op.OwnerUserID, op.ActorUserID); err != nil {
				return result, fmt.Errorf("完成普通上传 %s 台账失败: %w", op.OperationID, err)
			}
			if err := s.markUploadDatabaseReady(op.OperationID); err != nil {
				return result, err
			}
			if err := s.finishUploadOperation(op, src); err != nil {
				return result, err
			}
			result.CompletedUploads++
			continue
		}
		canRollback := (!op.ReplacedExisting && tempExists && !finalExists) ||
			(op.ReplacedExisting && ((tempExists && finalExists && !backupExists) ||
				(tempExists && !finalExists && backupExists) || (!tempExists && !finalExists && backupExists) ||
				(!tempExists && finalExists && !backupExists && !finalMatches)))
		if canRollback {
			if err := s.rollbackUploadOperation(op, src); err != nil {
				return result, err
			}
			result.RolledBackUploads++
			continue
		}
		return result, fmt.Errorf("普通上传 %s 处于歧义状态（temp=%t final=%t backup=%t），已保留现场",
			op.OperationID, tempExists, finalExists, backupExists)
	}
	return result, nil
}
