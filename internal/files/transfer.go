package files

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

// TransferResult 描述一次复制或跨来源移动的结果。
type TransferResult struct {
	Path      string `json:"path"`
	Files     int64  `json:"files"`
	Bytes     int64  `json:"bytes"`
	SourceKey string `json:"source_key"`
	TargetKey string `json:"target_source_key"`
	WasMove   bool   `json:"was_move"`
}

type transferFile struct {
	sourceRel string
	sourceAbs string
	targetRel string
	targetAbs string
	size      int64
}

type transferPlan struct {
	sourceRel string
	sourceAbs string
	targetRel string
	targetAbs string
	isDir     bool
	dirs      []string
	files     []transferFile
	total     int64
}

// Copy 将文件或目录复制到目标存储源；目标已存在时拒绝，不覆盖。
// 复制产生的新文件归当前执行用户所有。
func (s *Service) Copy(source, target *models.StorageSource, fromInput, toInput string, actorUserID *int64) (*TransferResult, error) {
	return s.transfer(source, target, fromInput, toInput, false, actorUserID)
}

// MoveAcrossSources 将文件或目录移动到另一个存储源，并保留已有文件归属和图床公开链接。
func (s *Service) MoveAcrossSources(source, target *models.StorageSource, fromInput, toInput string, actorUserID *int64) (*TransferResult, error) {
	if source.ID == target.ID {
		newRel, err := s.MoveWithLockTokens(source, fromInput, toInput, nil, actorUserID)
		if err != nil {
			return nil, err
		}
		return &TransferResult{Path: newRel, SourceKey: source.Key, TargetKey: target.Key, WasMove: true}, nil
	}
	return s.transfer(source, target, fromInput, toInput, true, actorUserID)
}

func (s *Service) transfer(source, target *models.StorageSource, fromInput, toInput string, move bool, actorUserID *int64) (*TransferResult, error) {
	fromRel, err := security.NormalizeRelPath(fromInput)
	if err != nil || fromRel == "" {
		return nil, fmt.Errorf("%w: 非法源路径", ErrInvalid)
	}
	toRel, err := security.NormalizeRelPath(toInput)
	if err != nil || toRel == "" {
		return nil, fmt.Errorf("%w: 非法目标路径", ErrInvalid)
	}
	if source.ID == target.ID && (fromRel == toRel || strings.HasPrefix(toRel, fromRel+"/")) {
		return nil, fmt.Errorf("%w: 目标不能是源路径本身或其子目录", ErrInvalid)
	}

	mutations := []locks.SourceMutation{{
		StorageSourceID: target.ID,
		Scopes:          []locks.MutationScope{{Path: toRel, IncludeDescendants: true}},
	}}
	if move {
		mutations = append(mutations, locks.SourceMutation{
			StorageSourceID: source.ID,
			Scopes:          []locks.MutationScope{{Path: fromRel, IncludeDescendants: true}},
		})
	}
	releasePersistent, err := s.persistentLocks.GuardMutations(context.Background(), mutations, nil, actorUserID)
	if err != nil {
		return nil, err
	}
	defer releasePersistent(nil)

	var quotaGuard *QuotaWriteGuard
	if move {
		quotaGuard, err = s.BeginQuotaWrite(target, "")
	} else {
		quotaGuard, err = s.BeginQuotaWriteForUser(target, "", actorUserID)
	}
	if err != nil {
		return nil, err
	}
	defer quotaGuard.Close()

	unlock := s.locks.LockPair(locks.Key(source.Key, fromRel), locks.Key(target.Key, toRel))
	defer unlock()

	plan, err := s.buildTransferPlan(source, target, fromRel, toRel)
	if err != nil {
		return nil, err
	}
	if maxBytes, limited := quotaGuard.MaxBytes(); limited && plan.total > maxBytes {
		return nil, ErrQuotaExceeded
	}
	if err := s.executeTransferCopy(plan); err != nil {
		s.rollbackTransferTarget(target, plan)
		return nil, err
	}
	if err := s.syncTransferRecords(source, target, plan, move, actorUserID); err != nil {
		s.rollbackTransferTarget(target, plan)
		return nil, fmt.Errorf("更新文件台账失败: %w", err)
	}
	if move {
		if err := os.RemoveAll(plan.sourceAbs); err != nil {
			_ = s.rollbackTransferRecords(source, target, plan)
			s.rollbackTransferTarget(target, plan)
			return nil, fmt.Errorf("删除源路径失败: %w", err)
		}
		if err := releasePersistent(map[int64][]string{source.ID: []string{plan.sourceRel}}); err != nil {
			return nil, err
		}
	}
	return &TransferResult{
		Path: plan.targetRel, Files: int64(len(plan.files)), Bytes: plan.total,
		SourceKey: source.Key, TargetKey: target.Key, WasMove: move,
	}, nil
}

func (s *Service) buildTransferPlan(source, target *models.StorageSource, fromRel, toRel string) (*transferPlan, error) {
	fromRel, fromAbs, err := s.prepare(source, fromRel)
	if err != nil {
		return nil, err
	}
	toRel, toAbs, err := s.prepare(target, toRel)
	if err != nil {
		return nil, err
	}
	if _, err := os.Lstat(toAbs); err == nil {
		return nil, ErrAlreadyExists
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	parent, err := os.Lstat(filepath.Dir(toAbs))
	if err != nil || !parent.IsDir() || parent.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("%w: 目标目录不存在或不可用", ErrInvalid)
	}
	rootInfo, err := os.Lstat(fromAbs)
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if rootInfo.Mode()&os.ModeSymlink != 0 || (!rootInfo.IsDir() && !rootInfo.Mode().IsRegular()) {
		return nil, ErrUnsupported
	}

	sourceMatcher, err := s.sources.Matcher(source.ID)
	if err != nil {
		return nil, err
	}
	targetMatcher, err := s.sources.Matcher(target.ID)
	if err != nil {
		return nil, err
	}
	plan := &transferPlan{sourceRel: fromRel, sourceAbs: fromAbs, targetRel: toRel, targetAbs: toAbs, isDir: rootInfo.IsDir()}
	if rootInfo.Mode().IsRegular() {
		plan.files = append(plan.files, transferFile{sourceRel: fromRel, sourceAbs: fromAbs, targetRel: toRel, targetAbs: toAbs, size: rootInfo.Size()})
		plan.total = rootInfo.Size()
		return plan, nil
	}

	err = filepath.WalkDir(fromAbs, func(absPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		suffix, err := filepath.Rel(fromAbs, absPath)
		if err != nil {
			return err
		}
		if suffix == "." {
			suffix = ""
		} else {
			suffix = filepath.ToSlash(suffix)
		}
		sourceChild := fromRel
		targetChild := toRel
		if suffix != "" {
			sourceChild += "/" + suffix
			targetChild += "/" + suffix
		}
		if sourceMatcher.MatchPrefix(sourceChild) || targetMatcher.MatchPrefix(targetChild) {
			return ErrPathExcluded
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) {
			return ErrUnsupported
		}
		if info.IsDir() {
			plan.dirs = append(plan.dirs, filepath.Join(toAbs, filepath.FromSlash(suffix)))
			return nil
		}
		if uploadTempName.MatchString(entry.Name()) {
			return nil
		}
		targetAbs := filepath.Join(toAbs, filepath.FromSlash(suffix))
		plan.files = append(plan.files, transferFile{
			sourceRel: sourceChild, sourceAbs: absPath, targetRel: targetChild, targetAbs: targetAbs, size: info.Size(),
		})
		plan.total += info.Size()
		return nil
	})
	if err != nil {
		return nil, err
	}
	return plan, nil
}

func (s *Service) executeTransferCopy(plan *transferPlan) error {
	if plan.isDir {
		for _, dir := range plan.dirs {
			if err := os.Mkdir(dir, 0o755); err != nil {
				return fmt.Errorf("创建目标目录失败: %w", err)
			}
		}
	}
	for _, item := range plan.files {
		input, err := os.Open(item.sourceAbs)
		if err != nil {
			return fmt.Errorf("读取源文件失败: %w", err)
		}
		_, copyErr := writeViaTemp(filepath.Dir(item.targetAbs), item.targetAbs, input, 0, false)
		closeErr := input.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func (s *Service) rollbackTransferTarget(target *models.StorageSource, plan *transferPlan) {
	_ = os.RemoveAll(plan.targetAbs)
	_ = s.deleteFileRecords(target.ID, plan.targetRel, plan.isDir)
}

type transferRecord struct {
	ownerUserID     sql.NullInt64
	ownerType       string
	createdByUserID sql.NullInt64
	createdAt       time.Time
}

func (s *Service) syncTransferRecords(source, target *models.StorageSource, plan *transferPlan, move bool, actorUserID *int64) error {
	records := make(map[string]transferRecord)
	if move {
		rows, err := s.db.Query(`SELECT relative_path, owner_user_id, owner_type, created_by_user_id, created_at
  FROM file_records WHERE storage_source_id = ? AND record_status = ? AND (relative_path = ? OR relative_path LIKE ?)`,
			source.ID, models.FileRecordActive, plan.sourceRel, plan.sourceRel+"/%")
		if err != nil {
			return err
		}
		for rows.Next() {
			var rel string
			var record transferRecord
			if err := rows.Scan(&rel, &record.ownerUserID, &record.ownerType, &record.createdByUserID, &record.createdAt); err != nil {
				rows.Close()
				return err
			}
			records[rel] = record
		}
		if err := rows.Close(); err != nil {
			return err
		}
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	if _, err := tx.Exec(`DELETE FROM file_records WHERE storage_source_id = ? AND (relative_path = ? OR relative_path LIKE ?)`,
		target.ID, plan.targetRel, plan.targetRel+"/%"); err != nil {
		return err
	}
	for _, item := range plan.files {
		info, err := os.Lstat(item.targetAbs)
		if err != nil {
			return err
		}
		record := records[item.sourceRel]
		if !move {
			record = transferRecord{ownerType: models.FileOwnerUnowned, createdAt: now}
			if actorUserID != nil {
				record.ownerType = models.FileOwnerUser
				record.ownerUserID = sql.NullInt64{Int64: *actorUserID, Valid: true}
				record.createdByUserID = record.ownerUserID
			}
		} else if record.ownerType == "" {
			record.ownerType = models.FileOwnerUnowned
			record.createdAt = now
		}
		if _, err := tx.Exec(`INSERT INTO file_records
  (storage_source_id, relative_path, size, owner_user_id, owner_type, created_by_user_id,
   updated_by_user_id, mtime_unix_nano, record_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, target.ID, item.targetRel, info.Size(), nullableInt(record.ownerUserID),
			record.ownerType, nullableInt(record.createdByUserID), actorUserID, info.ModTime().UnixNano(),
			models.FileRecordActive, record.createdAt, now); err != nil {
			return err
		}
	}
	if move {
		if _, err := tx.Exec(`DELETE FROM file_records WHERE storage_source_id = ? AND (relative_path = ? OR relative_path LIKE ?)`,
			source.ID, plan.sourceRel, plan.sourceRel+"/%"); err != nil {
			return err
		}
		if err := moveImageRecordsTx(tx, source.ID, target.ID, plan.sourceRel, plan.targetRel); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func nullableInt(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}

func moveImageRecordsTx(tx *sql.Tx, sourceID, targetID int64, fromRel, toRel string) error {
	rows, err := tx.Query(`SELECT id, relative_path FROM images
  WHERE storage_source_id = ? AND (relative_path = ? OR relative_path LIKE ?)`, sourceID, fromRel, fromRel+"/%")
	if err != nil {
		return err
	}
	type imagePath struct {
		id  int64
		rel string
	}
	var paths []imagePath
	for rows.Next() {
		var item imagePath
		if err := rows.Scan(&item.id, &item.rel); err != nil {
			rows.Close()
			return err
		}
		paths = append(paths, item)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, item := range paths {
		newRel := toRel + strings.TrimPrefix(item.rel, fromRel)
		if _, err := tx.Exec(`UPDATE images SET storage_source_id = ?, relative_path = ? WHERE id = ?`, targetID, newRel, item.id); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) rollbackTransferRecords(source, target *models.StorageSource, plan *transferPlan) error {
	// 物理删除源失败时恢复图床定位，再用校准恢复源台账并清掉目标台账。
	tx, txErr := s.db.Begin()
	if txErr == nil {
		_ = moveImageRecordsTx(tx, target.ID, source.ID, plan.targetRel, plan.sourceRel)
		_, _ = tx.Exec(`DELETE FROM file_records WHERE storage_source_id = ? AND (relative_path = ? OR relative_path LIKE ?)`,
			target.ID, plan.targetRel, plan.targetRel+"/%")
		txErr = tx.Commit()
	}
	_, err := s.ReconcileSource(source)
	if txErr != nil {
		return txErr
	}
	return err
}
