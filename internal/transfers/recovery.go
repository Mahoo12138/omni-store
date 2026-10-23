package transfers

import (
	"database/sql"
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

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

// 上传崩溃日志：与图床上传恢复同一边界 —— 任何"无法证明归属"的状态阻止启动。
type uploadOperation struct {
	Version         int    `json:"version"`
	OperationID     string `json:"operation_id"`
	Kind            string `json:"kind"` // send-file | submission-file (legacy) | submission-batch
	StorageSourceID int64  `json:"storage_source_id"`
	TransferID      int64  `json:"transfer_id"`
	SubmissionID    int64  `json:"submission_id"`
	CollectionID    int64  `json:"collection_id,omitempty"`
	TempRelPath     string `json:"temp_rel_path,omitempty"`
	FinalRelPath    string `json:"final_rel_path"` // 托管命名空间内的物理相对路径
}

const uploadOperationVersion = 1

func (s *Service) uploadOperationsDir() string {
	return filepath.Join(s.dataDir, "operations", "transfer-uploads")
}

func (s *Service) uploadOperationPath(operationID string) string {
	return filepath.Join(s.uploadOperationsDir(), operationID+".json")
}

func (s *Service) newUploadOperation(kind string, storageSourceID, transferID, submissionID int64, finalRel string) uploadOperation {
	return uploadOperation{
		Version:         uploadOperationVersion,
		OperationID:     auth.NewRandomToken("tup-", 12),
		Kind:            kind,
		StorageSourceID: storageSourceID,
		TransferID:      transferID,
		SubmissionID:    submissionID,
		FinalRelPath:    finalRel,
	}
}

// writeUploadOperation 原子写入操作日志（temp + link + remove）。
func (s *Service) writeUploadOperation(op uploadOperation) error {
	dir := s.uploadOperationsDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tempPath := filepath.Join(dir, ".operation-"+op.OperationID+".tmp")
	target := s.uploadOperationPath(op.OperationID)
	keepTemp := true
	defer func() {
		if keepTemp {
			_ = os.Remove(tempPath)
		}
	}()
	temp, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(temp).Encode(op); err != nil {
		temp.Close()
		return fmt.Errorf("写入流转上传日志失败: %w", err)
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return fmt.Errorf("同步流转上传日志失败: %w", err)
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Link(tempPath, target); err != nil {
		return fmt.Errorf("提交流转上传日志失败: %w", err)
	}
	if err := os.Remove(tempPath); err != nil {
		return err
	}
	keepTemp = false
	return syncUploadDirectory(dir)
}

func (s *Service) removeUploadOperation(operationID string) error {
	err := os.Remove(s.uploadOperationPath(operationID))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return syncUploadDirectory(s.uploadOperationsDir())
}

func syncUploadDirectory(dir string) error {
	handle, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer handle.Close()
	return handle.Sync()
}

func decodeUploadOperation(handle io.Reader) (uploadOperation, error) {
	var op uploadOperation
	decoder := json.NewDecoder(handle)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&op); err != nil {
		return op, err
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return op, fmt.Errorf("流转上传日志包含多余数据")
	}
	token, err := hex.DecodeString(strings.TrimPrefix(op.OperationID, "tup-"))
	if op.Version != uploadOperationVersion || !strings.HasPrefix(op.OperationID, "tup-") || err != nil || len(token) != 12 || op.StorageSourceID <= 0 {
		return op, fmt.Errorf("流转上传日志字段不完整")
	}
	normalized, err := security.NormalizeRelPath(op.FinalRelPath)
	if err != nil || normalized == "" || normalized != op.FinalRelPath {
		return op, fmt.Errorf("流转上传日志路径非法")
	}
	return op, nil
}

// committedUpload 同时证明源/任务/路径归属，任何不一致均保留日志并阻止恢复。
// Collect 的预插提交行不是提交凭证；文件清单与批次统计须在同一事务完成。
func (s *Service) committedUpload(op uploadOperation) (bool, error) {
	if op.TempRelPath != "" {
		normalized, err := security.NormalizeRelPath(op.TempRelPath)
		name := filepath.Base(filepath.FromSlash(op.TempRelPath))
		token, tokenErr := hex.DecodeString(strings.TrimSuffix(strings.TrimPrefix(name, ".omnistore-upload-"), ".tmp"))
		if op.Kind != "send-file" || err != nil || normalized != op.TempRelPath ||
			!strings.HasPrefix(name, ".omnistore-upload-") || !strings.HasSuffix(name, ".tmp") || tokenErr != nil || len(token) != 8 ||
			filepath.Dir(op.TempRelPath) != filepath.Dir(op.FinalRelPath) {
			return false, fmt.Errorf("流转上传临时路径非法")
		}
	}
	var publicKey string
	var sourceID int64
	switch op.Kind {
	case "send-file":
		if op.TransferID <= 0 || op.SubmissionID != 0 || op.CollectionID != 0 {
			return false, fmt.Errorf("非法发送上传身份")
		}
		if err := s.db.QueryRow(`SELECT public_key, storage_source_id FROM transfers WHERE id = ?`, op.TransferID).Scan(&publicKey, &sourceID); err != nil {
			return false, err
		}
		prefix := sendPayloadRel(publicKey, "") + "/"
		if sourceID != op.StorageSourceID || !strings.HasPrefix(op.FinalRelPath, prefix) {
			return false, fmt.Errorf("发送上传源或路径与任务不一致")
		}
		rel := strings.TrimPrefix(op.FinalRelPath, prefix)
		if rel == "" || security.ValidateUserRelPath(rel) != nil {
			return false, fmt.Errorf("发送上传文件路径非法")
		}
		var one int
		err := s.db.QueryRow(`SELECT 1 FROM transfer_files WHERE transfer_id = ? AND relative_path = ?`, op.TransferID, rel).Scan(&one)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return err == nil, err
	case "submission-batch", "submission-file":
		if op.SubmissionID <= 0 || op.TransferID != 0 {
			return false, fmt.Errorf("非法收集上传身份")
		}
		collectionID := op.CollectionID
		if op.Kind == "submission-file" && collectionID == 0 {
			if err := s.db.QueryRow(`SELECT collection_id FROM transfer_submissions WHERE id = ?`, op.SubmissionID).Scan(&collectionID); err != nil {
				return false, err
			}
		}
		if err := s.db.QueryRow(`SELECT public_key, storage_source_id FROM transfer_collections WHERE id = ?`, collectionID).Scan(&publicKey, &sourceID); err != nil {
			return false, err
		}
		batchRel := collectPayloadRel(publicKey, op.SubmissionID, "")
		if sourceID != op.StorageSourceID || (op.Kind == "submission-batch" && op.FinalRelPath != batchRel) ||
			(op.Kind == "submission-file" && !strings.HasPrefix(op.FinalRelPath, batchRel+"/")) {
			return false, fmt.Errorf("收集上传源或路径与任务不一致")
		}
		var actualCollectionID, fileCount, totalSize, ledgerCount, ledgerSize int64
		err := s.db.QueryRow(`SELECT sub.collection_id, sub.file_count, sub.total_size,
  (SELECT COUNT(*) FROM transfer_submission_files WHERE submission_id = sub.id),
  (SELECT COALESCE(SUM(size), 0) FROM transfer_submission_files WHERE submission_id = sub.id)
  FROM transfer_submissions sub WHERE sub.id = ?`, op.SubmissionID).Scan(&actualCollectionID, &fileCount, &totalSize, &ledgerCount, &ledgerSize)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if actualCollectionID != collectionID || fileCount != ledgerCount || totalSize != ledgerSize {
			return false, fmt.Errorf("收集上传提交与文件台账不一致")
		}
		if op.Kind == "submission-file" {
			var one int
			err := s.db.QueryRow(`SELECT 1 FROM transfer_submission_files WHERE submission_id = ? AND relative_path = ?`, op.SubmissionID, strings.TrimPrefix(op.FinalRelPath, batchRel+"/")).Scan(&one)
			if errors.Is(err, sql.ErrNoRows) {
				return false, nil
			}
			return err == nil, err
		}
		return fileCount > 0, nil
	default:
		return false, fmt.Errorf("流转上传日志类型非法: %s", op.Kind)
	}
}

// rollbackUpload 先删未提交载荷，成功后才删空占位行；清理失败保留日志以供重试。
func (s *Service) rollbackUpload(op uploadOperation, src *models.StorageSource) error {
	if err := s.managedRoots.Ensure(src); err != nil {
		return err
	}
	if op.TempRelPath != "" {
		if err := s.files.DeleteManaged(src, op.TempRelPath, ManagedScopeDir); err != nil && !errors.Is(err, files.ErrNotFound) {
			return err
		}
	}
	if err := s.files.DeleteManaged(src, op.FinalRelPath, ManagedScopeDir); err != nil && !errors.Is(err, files.ErrNotFound) {
		return err
	}
	if op.Kind == "submission-batch" {
		_, err := s.db.Exec(`DELETE FROM transfer_submissions WHERE id = ? AND collection_id = ? AND file_count = 0
  AND NOT EXISTS (SELECT 1 FROM transfer_submission_files WHERE submission_id = ?)`, op.SubmissionID, op.CollectionID, op.SubmissionID)
		return err
	}
	return nil
}

// RecoverUploadOperations 在监听前收敛中断上传：
// 台账已提交 → 只清理日志；未提交 → 删除托管内的最终文件并清理日志。
// 无法解析的日志阻止启动（与文件上传/图床恢复一致）。
func (s *Service) RecoverUploadOperations() (int, error) {
	dir := s.uploadOperationsDir()
	entries, err := os.ReadDir(dir)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return 0, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	recovered := 0
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), ".operation-") && strings.HasSuffix(entry.Name(), ".tmp") {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return recovered, err
			}
			continue
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		handle, err := os.Open(filepath.Join(dir, entry.Name()))
		if err != nil {
			return recovered, err
		}
		op, decodeErr := decodeUploadOperation(handle)
		closeErr := handle.Close()
		if decodeErr != nil {
			return recovered, fmt.Errorf("读取流转上传日志 %s 失败: %w", entry.Name(), decodeErr)
		}
		if closeErr != nil {
			return recovered, closeErr
		}
		if entry.Name() != op.OperationID+".json" {
			return recovered, fmt.Errorf("流转上传日志名称与操作 ID 不一致")
		}
		committed, err := s.committedUpload(op)
		if err != nil {
			return recovered, fmt.Errorf("校验流转上传 %s 失败: %w", op.OperationID, err)
		}
		src, err := s.sources.GetByID(op.StorageSourceID)
		if err != nil {
			return recovered, fmt.Errorf("流转上传 %s 的存储源缺失", op.OperationID)
		}
		if err := s.managedRoots.Ensure(src); err != nil {
			return recovered, fmt.Errorf("校验流转上传 %s 的托管根失败: %w", op.OperationID, err)
		}
		if committed {
			if op.TempRelPath != "" {
				if err := s.files.DeleteManaged(src, op.TempRelPath, ManagedScopeDir); err != nil && !errors.Is(err, files.ErrNotFound) {
					return recovered, err
				}
			}
			recovered++
		} else if err := s.rollbackUpload(op, src); err != nil {
			return recovered, fmt.Errorf("清理未提交流转文件 %s 失败: %w", op.FinalRelPath, err)
		}
		if err := s.removeUploadOperation(op.OperationID); err != nil {
			return recovered, err
		}
	}
	if err := s.recoverEmptySubmissions(); err != nil {
		return recovered, err
	}
	return recovered, nil
}

// recoverEmptySubmissions 仅在启动恢复期间调用，覆盖预插提交行后、日志落盘前的中断窗口。
// 监听前没有活跃上传，因此不使用运行时 GC 的延迟阈值。DB 关联和托管根共同证明删除归属。
func (s *Service) recoverEmptySubmissions() error {
	rows, err := s.db.Query(`SELECT sub.id, c.id, c.public_key, c.storage_source_id
  FROM transfer_submissions sub JOIN transfer_collections c ON c.id = sub.collection_id
  WHERE sub.file_count = 0 AND sub.total_size = 0
    AND NOT EXISTS (SELECT 1 FROM transfer_submission_files f WHERE f.submission_id = sub.id)`)
	if err != nil {
		return err
	}
	var pending []uploadOperation
	for rows.Next() {
		var submissionID, collectionID, sourceID int64
		var publicKey string
		if err := rows.Scan(&submissionID, &collectionID, &publicKey, &sourceID); err != nil {
			rows.Close()
			return err
		}
		op := s.newUploadOperation("submission-batch", sourceID, 0, submissionID, collectPayloadRel(publicKey, submissionID, ""))
		op.CollectionID = collectionID
		pending = append(pending, op)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, op := range pending {
		src, err := s.sources.GetByID(op.StorageSourceID)
		if err != nil {
			return err
		}
		if err := s.rollbackUpload(op, src); err != nil {
			return fmt.Errorf("恢复空收集批次 %d 失败: %w", op.SubmissionID, err)
		}
	}
	return nil
}

// pendingUploadOperations 为运行时 GC 提供仍需保留的恢复证据。
// 不恢复或删除日志：日志可能属于正在接收数据的活跃请求。
func (s *Service) pendingUploadOperations() ([]uploadOperation, error) {
	entries, err := os.ReadDir(s.uploadOperationsDir())
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var operations []uploadOperation
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		handle, err := os.Open(filepath.Join(s.uploadOperationsDir(), entry.Name()))
		if errors.Is(err, fs.ErrNotExist) {
			continue // 活跃请求刚刚清理了自己的日志。
		}
		if err != nil {
			return nil, err
		}
		op, decodeErr := decodeUploadOperation(handle)
		closeErr := handle.Close()
		if decodeErr != nil || closeErr != nil {
			return nil, errors.Join(decodeErr, closeErr)
		}
		if entry.Name() != op.OperationID+".json" {
			return nil, fmt.Errorf("流转上传日志名称与操作 ID 不一致")
		}
		operations = append(operations, op)
	}
	return operations, nil
}
