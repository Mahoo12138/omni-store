package files

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

type scannedFile struct {
	rel       string
	size      int64
	mtimeNano int64
}

// ReconcileSource 扫描真实普通文件并校准 active 台账；新发现文件标记为 unowned。
func (s *Service) ReconcileSource(src *models.StorageSource) (*models.ReconcileResult, error) {
	root, err := security.ResolveInSource(src.RootPath, "")
	if err != nil {
		return nil, err
	}
	filesOnDisk := make(map[string]scannedFile)
	result := &models.ReconcileResult{}
	err = filepath.WalkDir(root, func(absPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return nil
			}
			return walkErr
		}
		if absPath == root || entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || uploadTempName.MatchString(entry.Name()) {
			return nil
		}
		rel, err := filepath.Rel(root, absPath)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		filesOnDisk[rel] = scannedFile{rel: rel, size: info.Size(), mtimeNano: info.ModTime().UnixNano()}
		result.ScannedFiles++
		result.UsageBytes += info.Size()
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("扫描存储源失败: %w", err)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	existing := make(map[string]scannedFile)
	rows, err := tx.Query(`SELECT relative_path, size, mtime_unix_nano FROM file_records
  WHERE storage_source_id = ? AND record_status = ?`, src.ID, models.FileRecordActive)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var item scannedFile
		if err := rows.Scan(&item.rel, &item.size, &item.mtimeNano); err != nil {
			rows.Close()
			return nil, err
		}
		existing[item.rel] = item
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	for rel, item := range filesOnDisk {
		old, found := existing[rel]
		if !found {
			if _, err := tx.Exec(`INSERT INTO file_records
  (storage_source_id, relative_path, size, owner_type, mtime_unix_nano, record_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, src.ID, rel, item.size, models.FileOwnerUnowned,
				item.mtimeNano, models.FileRecordActive, now, now); err != nil {
				return nil, err
			}
			result.Added++
			continue
		}
		delete(existing, rel)
		if old.size != item.size || old.mtimeNano != item.mtimeNano {
			if _, err := tx.Exec(`UPDATE file_records SET size = ?, mtime_unix_nano = ?, updated_at = ?
  WHERE storage_source_id = ? AND relative_path = ?`, item.size, item.mtimeNano, now, src.ID, rel); err != nil {
				return nil, err
			}
			result.Updated++
		}
	}
	for rel := range existing {
		if _, err := tx.Exec(`DELETE FROM file_records WHERE storage_source_id = ? AND relative_path = ?`, src.ID, rel); err != nil {
			return nil, err
		}
		result.Removed++
	}
	if err := tx.QueryRow(`SELECT COUNT(*) FROM file_records
  WHERE storage_source_id = ? AND record_status = ? AND owner_type = ?`,
		src.ID, models.FileRecordActive, models.FileOwnerUnowned).Scan(&result.Unowned); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

// RecordFile 对最终普通文件执行 upsert；覆盖写会把所有权转移给本次写入主体。
func (s *Service) RecordFile(src *models.StorageSource, relInput, ownerType string, ownerUserID, actorUserID *int64) error {
	relPath, absPath, err := s.prepare(src, relInput)
	if err != nil {
		return err
	}
	info, err := os.Lstat(absPath)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return ErrUnsupported
	}
	if ownerType != models.FileOwnerUser && ownerType != models.FileOwnerAnonymous &&
		ownerType != models.FileOwnerSystem && ownerType != models.FileOwnerUnowned {
		return fmt.Errorf("非法文件所有者类型: %s", ownerType)
	}
	if ownerType != models.FileOwnerUser {
		ownerUserID = nil
	}
	now := time.Now().UTC()
	_, err = s.db.Exec(`INSERT INTO file_records
  (storage_source_id, relative_path, size, owner_user_id, owner_type, created_by_user_id,
   updated_by_user_id, mtime_unix_nano, record_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(storage_source_id, relative_path) DO UPDATE SET
    size = excluded.size,
    owner_user_id = excluded.owner_user_id,
    owner_type = excluded.owner_type,
    updated_by_user_id = excluded.updated_by_user_id,
    mtime_unix_nano = excluded.mtime_unix_nano,
    record_status = excluded.record_status,
    updated_at = excluded.updated_at`,
		src.ID, relPath, info.Size(), ownerUserID, ownerType, actorUserID, actorUserID,
		info.ModTime().UnixNano(), models.FileRecordActive, now, now)
	return err
}

func (s *Service) deleteFileRecords(storageSourceID int64, relPath string, isDir bool) error {
	if isDir {
		_, err := s.db.Exec(`DELETE FROM file_records
  WHERE storage_source_id = ? AND (relative_path = ? OR relative_path LIKE ?)`,
			storageSourceID, relPath, relPath+"/%")
		return err
	}
	_, err := s.db.Exec(`DELETE FROM file_records WHERE storage_source_id = ? AND relative_path = ?`, storageSourceID, relPath)
	return err
}

func (s *Service) moveFileRecords(storageSourceID int64, fromRel, toRel string, isDir bool, actorUserID *int64) error {
	rows, err := s.db.Query(`SELECT id, relative_path FROM file_records
  WHERE storage_source_id = ? AND record_status = ? AND (relative_path = ? OR relative_path LIKE ?)`,
		storageSourceID, models.FileRecordActive, fromRel, fromRel+"/%")
	if err != nil {
		return err
	}
	type recordPath struct {
		id  int64
		rel string
	}
	var records []recordPath
	for rows.Next() {
		var record recordPath
		if err := rows.Scan(&record.id, &record.rel); err != nil {
			rows.Close()
			return err
		}
		records = append(records, record)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if !isDir && len(records) == 0 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, record := range records {
		newRel := toRel
		if isDir {
			newRel += strings.TrimPrefix(record.rel, fromRel)
		}
		if _, err := tx.Exec(`UPDATE file_records SET relative_path = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`,
			newRel, actorUserID, time.Now().UTC(), record.id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// UserUsage 返回用户拥有的文件总字节数；回收站仍占用户配额，永久清理后才释放。
func (s *Service) UserUsage(userID int64) (int64, error) {
	var usage sql.NullInt64
	err := s.db.QueryRow(`SELECT SUM(size) FROM file_records WHERE owner_user_id = ? AND owner_type = ?`,
		userID, models.FileOwnerUser).Scan(&usage)
	return usage.Int64, err
}

// UserQuota 返回用户拥有文件的台账用量和硬配额。
func (s *Service) UserQuota(user *models.User) (*models.UserQuota, error) {
	usage, err := s.UserUsage(user.ID)
	if err != nil {
		return nil, err
	}
	quota := &models.UserQuota{
		UsageBytes: usage,
		QuotaBytes: user.QuotaBytes,
		Unlimited:  user.QuotaBytes == 0,
	}
	if !quota.Unlimited {
		quota.RemainingBytes = user.QuotaBytes - usage
		if quota.RemainingBytes < 0 {
			quota.RemainingBytes = 0
		}
	}
	return quota, nil
}

// LedgerSourceUsage 返回台账中的存储源 active 文件总字节数。
func (s *Service) LedgerSourceUsage(storageSourceID int64) (int64, error) {
	var usage sql.NullInt64
	err := s.db.QueryRow(`SELECT SUM(size) FROM file_records WHERE storage_source_id = ? AND record_status = ?`,
		storageSourceID, models.FileRecordActive).Scan(&usage)
	return usage.Int64, err
}
