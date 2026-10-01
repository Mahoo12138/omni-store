package transfers

import (
	"database/sql"
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
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

// 上传崩溃日志：与图床上传恢复同一边界 —— 任何"无法证明归属"的状态阻止启动。
type uploadOperation struct {
	Version         int    `json:"version"`
	OperationID     string `json:"operation_id"`
	Kind            string `json:"kind"` // send-file | submission-file
	StorageSourceID int64  `json:"storage_source_id"`
	TransferID      int64  `json:"transfer_id"`
	SubmissionID    int64  `json:"submission_id"`
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
	keepTemp = false
	return os.Remove(tempPath)
}

func (s *Service) removeUploadOperation(operationID string) error {
	err := os.Remove(s.uploadOperationPath(operationID))
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

func decodeUploadOperation(handle io.Reader) (uploadOperation, error) {
	var op uploadOperation
	decoder := json.NewDecoder(handle)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&op); err != nil {
		return op, err
	}
	if op.Version != uploadOperationVersion || op.OperationID == "" || op.StorageSourceID == 0 || op.FinalRelPath == "" {
		return op, fmt.Errorf("流转上传日志字段不完整")
	}
	return op, nil
}

// committedUpload 判断台账是否已包含该文件。
func (s *Service) committedUpload(op uploadOperation) (bool, error) {
	var one int
	var err error
	switch op.Kind {
	case "send-file":
		err = s.db.QueryRow(`SELECT 1 FROM transfer_files WHERE transfer_id = ? AND relative_path = ?`,
			op.TransferID, managedToLogicalSend(op.FinalRelPath)).Scan(&one)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
	case "submission-file":
		// 台账行与提交台账在同一事务提交；提交台账存在即已提交。
		err = s.db.QueryRow(`SELECT 1 FROM transfer_submissions WHERE id = ?`, op.SubmissionID).Scan(&one)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
	default:
		return false, fmt.Errorf("流转上传日志类型非法: %s", op.Kind)
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// managedToLogicalSend 由物理路径反推发件包内逻辑路径。
func managedToLogicalSend(finalRel string) string {
	marker := "/" + sendDir + "/"
	index := strings.Index(finalRel, marker)
	if index < 0 {
		return finalRel
	}
	rest := finalRel[index+len(marker):]
	// 去掉 public_key 段。
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return rest
}

// RecoverUploadOperations 在监听前收敛中断上传：
// 台账已提交 → 只清理日志；未提交 → 删除托管内的最终文件并清理日志。
// 无法解析的日志阻止启动（与文件上传/图床恢复一致）。
func (s *Service) RecoverUploadOperations() (int, error) {
	dir := s.uploadOperationsDir()
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
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
		committed, err := s.committedUpload(op)
		if err != nil {
			return recovered, fmt.Errorf("校验流转上传 %s 失败: %w", op.OperationID, err)
		}
		src, err := s.sources.GetByID(op.StorageSourceID)
		if err != nil {
			return recovered, fmt.Errorf("流转上传 %s 的存储源缺失", op.OperationID)
		}
		if committed {
			recovered++
		} else if err := s.files.DeleteManaged(src, op.FinalRelPath, ManagedScopeDir); err != nil && !errors.Is(err, files.ErrNotFound) {
			return recovered, fmt.Errorf("清理未提交流转文件 %s 失败: %w", op.FinalRelPath, err)
		}
		if err := s.removeUploadOperation(op.OperationID); err != nil {
			return recovered, err
		}
	}
	return recovered, nil
}

// managedRootAbs 解析源根上的托管根绝对路径。
func managedRootAbs(src *models.StorageSource) (string, error) {
	return security.ResolveInSource(src.RootPath, security.ManagedNamespaceSegment)
}

// sweepOrphanTempFiles 清理托管目录内残留的临时上传文件（崩溃或写入中断）。
func (s *Service) sweepOrphanTempFiles(now time.Time) (int, error) {
	removed := 0
	rows, err := s.db.Query(`SELECT id FROM storage_sources`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var sourceIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return removed, err
		}
		sourceIDs = append(sourceIDs, id)
	}
	if err := rows.Err(); err != nil {
		return removed, err
	}
	for _, id := range sourceIDs {
		src, err := s.sources.GetByID(id)
		if err != nil {
			continue
		}
		base, err := managedRootAbs(src)
		if err != nil {
			continue
		}
		transferDir := filepath.Join(base, ManagedScopeDir)
		err = filepath.WalkDir(transferDir, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				if errors.Is(walkErr, fs.ErrNotExist) {
					return nil
				}
				return walkErr
			}
			if !entry.IsDir() && strings.HasPrefix(entry.Name(), ".omnistore-upload-") && strings.HasSuffix(entry.Name(), ".tmp") {
				info, err := entry.Info()
				if err == nil && now.Sub(info.ModTime()) > orphanDirAfter {
					if err := os.Remove(path); err == nil {
						removed++
					}
				}
			}
			return nil
		})
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return removed, err
		}
	}
	return removed, nil
}
