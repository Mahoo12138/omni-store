package files

import (
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
	"github.com/omni-store/omnistore/internal/security"
)

const transferOperationVersion = 1

type transferOperation struct {
	Version               int    `json:"version"`
	OperationID           string `json:"operation_id"`
	SourceStorageSourceID int64  `json:"source_storage_source_id"`
	TargetStorageSourceID int64  `json:"target_storage_source_id"`
	SourceRelativePath    string `json:"source_relative_path"`
	TargetRelativePath    string `json:"target_relative_path"`
	IsDirectory           bool   `json:"is_directory"`
}

// TransferRecoveryResult 描述启动时恢复的中断跨来源移动。
type TransferRecoveryResult struct {
	CompletedMoves  int `json:"completed_moves"`
	RolledBackMoves int `json:"rolled_back_moves"`
}

func (s *Service) transferOperationsDir() string {
	return filepath.Join(s.sources.DataDir(), "operations", "transfers")
}

func (s *Service) transferOperationPath(operationID string) string {
	return filepath.Join(s.transferOperationsDir(), operationID+".json")
}

func (s *Service) transferTargetReadyPath(operationID string) string {
	return filepath.Join(s.transferOperationsDir(), operationID+".target-ready")
}

func (s *Service) transferDatabaseReadyPath(operationID string) string {
	return filepath.Join(s.transferOperationsDir(), operationID+".database-ready")
}

func validTransferOperationID(operationID string) bool {
	if !strings.HasPrefix(operationID, "trf-") || len(operationID) != len("trf-")+24 {
		return false
	}
	_, err := hex.DecodeString(strings.TrimPrefix(operationID, "trf-"))
	return err == nil
}

func validateTransferOperation(op transferOperation) error {
	if op.Version != transferOperationVersion || !validTransferOperationID(op.OperationID) ||
		op.SourceStorageSourceID <= 0 || op.TargetStorageSourceID <= 0 ||
		op.SourceStorageSourceID == op.TargetStorageSourceID {
		return fmt.Errorf("非法跨来源移动操作日志")
	}
	for label, value := range map[string]string{
		"源":  op.SourceRelativePath,
		"目标": op.TargetRelativePath,
	} {
		normalized, err := security.NormalizeRelPath(value)
		if err != nil || normalized == "" || normalized != value {
			return fmt.Errorf("非法跨来源移动%s路径", label)
		}
	}
	return nil
}

func (s *Service) newTransferOperation(sourceID, targetID int64, sourceRel, targetRel string, isDir bool) transferOperation {
	return transferOperation{
		Version: transferOperationVersion, OperationID: auth.NewRandomToken("trf-", 12),
		SourceStorageSourceID: sourceID, TargetStorageSourceID: targetID,
		SourceRelativePath: sourceRel, TargetRelativePath: targetRel, IsDirectory: isDir,
	}
}

// writeTransferOperation 在复制目标数据前持久化移动意图。完整同步后通过硬链接
// 提交 JSON，避免崩溃留下可见的半截日志。
func (s *Service) writeTransferOperation(op transferOperation) error {
	if err := validateTransferOperation(op); err != nil {
		return err
	}
	dir := s.transferOperationsDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("创建跨来源移动日志目录失败: %w", err)
	}
	if _, err := os.Lstat(s.transferOperationPath(op.OperationID)); err == nil {
		return fmt.Errorf("跨来源移动 %s 尚未恢复", op.OperationID)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	for _, marker := range []string{s.transferTargetReadyPath(op.OperationID), s.transferDatabaseReadyPath(op.OperationID)} {
		if err := os.Remove(marker); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	temp, err := os.CreateTemp(dir, ".operation-*.tmp")
	if err != nil {
		return fmt.Errorf("创建跨来源移动日志失败: %w", err)
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
		return fmt.Errorf("写入跨来源移动日志失败: %w", err)
	}
	if err := temp.Sync(); err != nil {
		return fmt.Errorf("同步跨来源移动日志失败: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("关闭跨来源移动日志失败: %w", err)
	}
	if err := os.Link(tempPath, s.transferOperationPath(op.OperationID)); err != nil {
		return fmt.Errorf("提交跨来源移动日志失败: %w", err)
	}
	if err := os.Remove(tempPath); err != nil {
		return fmt.Errorf("清理跨来源移动临时日志失败: %w", err)
	}
	keepTemp = false
	return syncDirectory(dir)
}

func (s *Service) createTransferMarker(path string) error {
	handle, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
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
	return syncDirectory(s.transferOperationsDir())
}

func (s *Service) markTransferTargetReady(operationID string) error {
	return s.createTransferMarker(s.transferTargetReadyPath(operationID))
}

func (s *Service) markTransferDatabaseReady(operationID string) error {
	return s.createTransferMarker(s.transferDatabaseReadyPath(operationID))
}

func (s *Service) removeTransferOperation(operationID string) error {
	for _, path := range []string{
		s.transferOperationPath(operationID),
		s.transferTargetReadyPath(operationID),
		s.transferDatabaseReadyPath(operationID),
	} {
		if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	return syncDirectory(s.transferOperationsDir())
}

func (s *Service) transferRecoveryPaths(op transferOperation) (sourceAbs, targetAbs string, err error) {
	source, err := s.sources.GetByID(op.SourceStorageSourceID)
	if err != nil {
		return "", "", err
	}
	target, err := s.sources.GetByID(op.TargetStorageSourceID)
	if err != nil {
		return "", "", err
	}
	sourceAbs, err = security.ResolveInSource(source.RootPath, op.SourceRelativePath)
	if err != nil {
		return "", "", err
	}
	targetAbs, err = security.ResolveInSource(target.RootPath, op.TargetRelativePath)
	return sourceAbs, targetAbs, err
}

func (s *Service) transferRecoveryPlan(op transferOperation, sourceAbs, targetAbs string) *transferPlan {
	return &transferPlan{
		sourceRel: op.SourceRelativePath, sourceAbs: sourceAbs,
		targetRel: op.TargetRelativePath, targetAbs: targetAbs, isDir: op.IsDirectory,
	}
}

func (s *Service) cleanupTransferRecoveryArtifacts(entries []os.DirEntry) error {
	dir := s.transferOperationsDir()
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".operation-") && strings.HasSuffix(name, ".tmp") {
			if err := os.Remove(filepath.Join(dir, name)); err != nil {
				return fmt.Errorf("清理未提交的跨来源移动临时日志 %s 失败: %w", name, err)
			}
			continue
		}
		for _, suffix := range []string{".target-ready", ".database-ready"} {
			if !strings.HasSuffix(name, suffix) {
				continue
			}
			operationID := strings.TrimSuffix(name, suffix)
			if _, err := os.Stat(s.transferOperationPath(operationID)); errors.Is(err, fs.ErrNotExist) {
				if err := os.Remove(filepath.Join(dir, name)); err != nil && !errors.Is(err, fs.ErrNotExist) {
					return fmt.Errorf("清理孤立跨来源移动阶段标记 %s 失败: %w", name, err)
				}
			} else if err != nil {
				return fmt.Errorf("检查跨来源移动操作日志 %s 失败: %w", operationID, err)
			}
		}
	}
	return nil
}

func decodeTransferOperation(handle io.Reader) (transferOperation, error) {
	var op transferOperation
	decoder := json.NewDecoder(handle)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&op); err != nil {
		return transferOperation{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return transferOperation{}, fmt.Errorf("操作日志包含额外 JSON 值")
		}
		return transferOperation{}, err
	}
	return op, nil
}

func transferMarkerExists(path string) (bool, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.Mode().IsRegular() {
		return false, fmt.Errorf("跨来源移动阶段标记 %s 不是普通文件", filepath.Base(path))
	}
	return true, nil
}

// SourceTransferOperationCount 返回仍依赖该存储源的中断移动数量。管理员删除
// 存储源前必须为 0，否则会破坏下一次启动恢复所需的路径与数据库定位。
func (s *Service) SourceTransferOperationCount(storageSourceID int64) (int, error) {
	dir := s.transferOperationsDir()
	entries, err := os.ReadDir(dir)
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
			return 0, fmt.Errorf("跨来源移动操作日志 %s 不能是符号链接", entry.Name())
		}
		handle, err := os.Open(filepath.Join(dir, entry.Name()))
		if err != nil {
			return 0, err
		}
		op, decodeErr := decodeTransferOperation(handle)
		closeErr := handle.Close()
		if decodeErr != nil {
			return 0, fmt.Errorf("读取跨来源移动操作日志 %s 失败: %w", entry.Name(), decodeErr)
		}
		if closeErr != nil {
			return 0, closeErr
		}
		if err := validateTransferOperation(op); err != nil || entry.Name() != op.OperationID+".json" {
			return 0, fmt.Errorf("跨来源移动操作日志 %s 非法", entry.Name())
		}
		if op.SourceStorageSourceID == storageSourceID || op.TargetStorageSourceID == storageSourceID {
			count++
		}
	}
	return count, nil
}

// RecoverTransferOperations 在服务监听前恢复中断的跨来源移动。
// database-ready 是提交边界：此前源数据仍完整，因此统一回滚目标副本和数据库定位；
// 此后数据库已指向目标，统一完成源路径删除。无法证明唯一完整副本时停止启动。
func (s *Service) RecoverTransferOperations() (TransferRecoveryResult, error) {
	result := TransferRecoveryResult{}
	dir := s.transferOperationsDir()
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	if err := s.cleanupTransferRecoveryArtifacts(entries); err != nil {
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
			return result, fmt.Errorf("跨来源移动操作日志 %s 不能是符号链接", entry.Name())
		}
		journalPath := filepath.Join(dir, entry.Name())
		handle, err := os.Open(journalPath)
		if err != nil {
			return result, err
		}
		op, decodeErr := decodeTransferOperation(handle)
		closeErr := handle.Close()
		if decodeErr != nil {
			return result, fmt.Errorf("读取跨来源移动操作日志 %s 失败: %w", entry.Name(), decodeErr)
		}
		if closeErr != nil {
			return result, closeErr
		}
		if err := validateTransferOperation(op); err != nil {
			return result, fmt.Errorf("跨来源移动操作日志 %s 非法: %w", entry.Name(), err)
		}
		if entry.Name() != op.OperationID+".json" {
			return result, fmt.Errorf("跨来源移动操作日志文件名 %s 与 operation_id 不一致", entry.Name())
		}
		sourceAbs, targetAbs, err := s.transferRecoveryPaths(op)
		if err != nil {
			return result, fmt.Errorf("解析跨来源移动 %s 路径失败: %w", op.OperationID, err)
		}
		sourceExists, err := pathExists(sourceAbs)
		if err != nil {
			return result, err
		}
		targetExists, err := pathExists(targetAbs)
		if err != nil {
			return result, err
		}
		targetReady, err := transferMarkerExists(s.transferTargetReadyPath(op.OperationID))
		if err != nil {
			return result, err
		}
		databaseReady, err := transferMarkerExists(s.transferDatabaseReadyPath(op.OperationID))
		if err != nil {
			return result, err
		}
		if databaseReady && !targetReady {
			return result, fmt.Errorf("跨来源移动 %s 的数据库阶段缺少目标完成标记", op.OperationID)
		}

		if databaseReady {
			if !targetExists {
				return result, fmt.Errorf("跨来源移动 %s 的数据库已提交但目标数据不存在", op.OperationID)
			}
			if sourceExists {
				if err := os.RemoveAll(sourceAbs); err != nil {
					return result, fmt.Errorf("完成跨来源移动 %s 删除源路径失败: %w", op.OperationID, err)
				}
				if err := syncDirectory(filepath.Dir(sourceAbs)); err != nil {
					return result, fmt.Errorf("同步跨来源移动 %s 源目录失败: %w", op.OperationID, err)
				}
			}
			if err := s.removeSourcePersistentLocks(op.SourceStorageSourceID, op.SourceRelativePath); err != nil {
				return result, fmt.Errorf("清理跨来源移动 %s 持久锁失败: %w", op.OperationID, err)
			}
			if err := s.removeTransferOperation(op.OperationID); err != nil {
				return result, err
			}
			result.CompletedMoves++
			continue
		}

		if !sourceExists {
			return result, fmt.Errorf("跨来源移动 %s 尚未提交但源数据不存在", op.OperationID)
		}
		source, err := s.sources.GetByID(op.SourceStorageSourceID)
		if err != nil {
			return result, err
		}
		target, err := s.sources.GetByID(op.TargetStorageSourceID)
		if err != nil {
			return result, err
		}
		plan := s.transferRecoveryPlan(op, sourceAbs, targetAbs)
		// 即使目标副本被外部删除，也必须回滚可能已经提交、但尚未来得及写
		// database-ready 标记的数据库定位。
		if err := s.rollbackTransferRecords(source, target, plan); err != nil {
			return result, fmt.Errorf("回滚跨来源移动 %s 数据库定位失败: %w", op.OperationID, err)
		}
		if targetExists {
			if err := os.RemoveAll(targetAbs); err != nil {
				return result, fmt.Errorf("回滚跨来源移动 %s 目标副本失败: %w", op.OperationID, err)
			}
			if err := syncDirectory(filepath.Dir(targetAbs)); err != nil {
				return result, fmt.Errorf("同步跨来源移动 %s 目标目录失败: %w", op.OperationID, err)
			}
		}
		if err := s.removeTransferOperation(op.OperationID); err != nil {
			return result, err
		}
		result.RolledBackMoves++
	}
	return result, nil
}

func (s *Service) removeSourcePersistentLocks(storageSourceID int64, relPath string) error {
	_, err := s.db.Exec(`DELETE FROM webdav_locks
  WHERE storage_source_id = ? AND (relative_path = ? OR substr(relative_path, 1, length(?) + 1) = ? || '/')`,
		storageSourceID, relPath, relPath, relPath)
	return err
}
