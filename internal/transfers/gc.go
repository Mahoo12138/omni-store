package transfers

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
)

// GCResult 汇总一次清理。
type GCResult struct {
	TransfersExpired   int `json:"transfers_expired"`
	TransfersSwept     int `json:"transfers_swept"`
	DraftsRemoved      int `json:"drafts_removed"`
	CollectionsExpired int `json:"collections_expired"`
	CollectionsSwept   int `json:"collections_swept"`
	EmptySubmissions   int `json:"empty_submissions"`
	OrphanDirsRemoved  int `json:"orphan_dirs_removed"`
	OrphanTempRemoved  int `json:"orphan_temp_removed"`
	SessionsRemoved    int `json:"sessions_removed"`
}

// RunGC 执行过期/撤销载荷回收、孤儿清理与会话清理。
// 只处理自己的台账与托管目录；普通文件与 .omnistore 之外的路径绝不触碰。
func (s *Service) RunGC(now time.Time) (*GCResult, error) {
	result := &GCResult{}
	if err := s.expireTransfers(now, result); err != nil {
		return nil, err
	}
	if err := s.expireCollections(now, result); err != nil {
		return nil, err
	}
	if err := s.removeStaleDrafts(now, result); err != nil {
		return nil, err
	}
	if err := s.sweepLeftoverPayloads(result); err != nil {
		return nil, err
	}
	if err := s.removeEmptySubmissions(now, result); err != nil {
		return nil, err
	}
	if err := s.sweepOrphanCollectDirs(now, result); err != nil {
		return nil, err
	}
	removed, err := s.sweepOrphanTempFiles(now)
	if err != nil {
		return nil, err
	}
	result.OrphanTempRemoved = removed
	if err := s.removeExpiredSessions(now, result); err != nil {
		return nil, err
	}
	return result, nil
}

type payloadRef struct {
	id              int64
	publicKey       string
	storageSourceID int64
}

func (s *Service) expireTransfers(now time.Time, result *GCResult) error {
	rows, err := s.db.Query(`SELECT id, public_key, storage_source_id FROM transfers
  WHERE status IN ('active', 'draft') AND expires_at IS NOT NULL AND expires_at <= ?`, now)
	if err != nil {
		return err
	}
	defer rows.Close()
	var refs []payloadRef
	for rows.Next() {
		var ref payloadRef
		if err := rows.Scan(&ref.id, &ref.publicKey, &ref.storageSourceID); err != nil {
			return err
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, ref := range refs {
		if err := s.deletePayloadDir(ref.storageSourceID, sendPayloadRel(ref.publicKey, "")); err != nil {
			return fmt.Errorf("清理过期发件包 %s 失败: %w", ref.publicKey, err)
		}
		if _, err := s.db.Exec(`UPDATE transfers SET status = 'expired', updated_at = ? WHERE id = ?`, now, ref.id); err != nil {
			return err
		}
		result.TransfersExpired++
	}
	return nil
}

func (s *Service) expireCollections(now time.Time, result *GCResult) error {
	rows, err := s.db.Query(`SELECT id, public_key, storage_source_id FROM transfer_collections
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?`, now)
	if err != nil {
		return err
	}
	defer rows.Close()
	var refs []payloadRef
	for rows.Next() {
		var ref payloadRef
		if err := rows.Scan(&ref.id, &ref.publicKey, &ref.storageSourceID); err != nil {
			return err
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, ref := range refs {
		if err := s.deletePayloadDir(ref.storageSourceID, collectPayloadRel(ref.publicKey, 0, "")); err != nil {
			return fmt.Errorf("清理过期收集任务 %s 失败: %w", ref.publicKey, err)
		}
		if _, err := s.db.Exec(`UPDATE transfer_collections SET status = 'expired', closed_at = ?, updated_at = ? WHERE id = ?`,
			now, now, ref.id); err != nil {
			return err
		}
		result.CollectionsExpired++
	}
	return nil
}

// removeStaleDrafts 清理长期未定稿的草稿（台账级联删除文件清单）。
func (s *Service) removeStaleDrafts(now time.Time, result *GCResult) error {
	rows, err := s.db.Query(`SELECT id, public_key, storage_source_id FROM transfers
  WHERE status = 'draft' AND updated_at < ?`, now.Add(-draftStaleAfter))
	if err != nil {
		return err
	}
	defer rows.Close()
	var refs []payloadRef
	for rows.Next() {
		var ref payloadRef
		if err := rows.Scan(&ref.id, &ref.publicKey, &ref.storageSourceID); err != nil {
			return err
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, ref := range refs {
		if err := s.deletePayloadDir(ref.storageSourceID, sendPayloadRel(ref.publicKey, "")); err != nil {
			return fmt.Errorf("清理超时草稿 %s 失败: %w", ref.publicKey, err)
		}
		if _, err := s.db.Exec(`DELETE FROM transfers WHERE id = ? AND status = 'draft'`, ref.id); err != nil {
			return err
		}
		result.DraftsRemoved++
	}
	return nil
}

// sweepLeftoverPayloads 清理已撤销/已过期任务仍残留的载荷目录（崩溃残余，幂等）。
func (s *Service) sweepLeftoverPayloads(result *GCResult) error {
	transferRows, err := s.db.Query(`SELECT id, public_key, storage_source_id FROM transfers WHERE status IN ('revoked', 'expired')`)
	if err != nil {
		return err
	}
	defer transferRows.Close()
	type sweepTarget struct {
		publicKey string
		sourceID  int64
		rel       string
	}
	var targets []sweepTarget
	for transferRows.Next() {
		var ref payloadRef
		if err := transferRows.Scan(&ref.id, &ref.publicKey, &ref.storageSourceID); err != nil {
			return err
		}
		targets = append(targets, sweepTarget{publicKey: ref.publicKey, sourceID: ref.storageSourceID, rel: sendPayloadRel(ref.publicKey, "")})
	}
	if err := transferRows.Err(); err != nil {
		return err
	}
	transferRows.Close()

	collectionRows, err := s.db.Query(`SELECT id, public_key, storage_source_id FROM transfer_collections WHERE status IN ('closed', 'revoked', 'expired')`)
	if err != nil {
		return err
	}
	defer collectionRows.Close()
	for collectionRows.Next() {
		var ref payloadRef
		if err := collectionRows.Scan(&ref.id, &ref.publicKey, &ref.storageSourceID); err != nil {
			return err
		}
		targets = append(targets, sweepTarget{publicKey: ref.publicKey, sourceID: ref.storageSourceID, rel: collectPayloadRel(ref.publicKey, 0, "")})
	}
	if err := collectionRows.Err(); err != nil {
		return err
	}
	collectionRows.Close()

	seenSources := map[int64]*models.StorageSource{}
	for _, target := range targets {
		src, ok := seenSources[target.sourceID]
		if !ok {
			loaded, err := s.sources.GetByID(target.sourceID)
			if err != nil {
				continue // 源已删除：载荷随源消失
			}
			src = loaded
			seenSources[target.sourceID] = src
		}
		if err := s.files.DeleteManaged(src, target.rel, ManagedScopeDir); err != nil && !errors.Is(err, files.ErrNotFound) {
			return fmt.Errorf("清理残留载荷 %s 失败: %w", target.publicKey, err)
		}
		if strings.Contains(target.rel, "/"+sendDir+"/") {
			result.TransfersSwept++
		} else {
			result.CollectionsSwept++
		}
	}
	return nil
}

// removeEmptySubmissions 清理没有任何台账文件的提交（写入中断）。
func (s *Service) removeEmptySubmissions(now time.Time, result *GCResult) error {
	rows, err := s.db.Query(`SELECT sub.id, c.public_key, c.storage_source_id
  FROM transfer_submissions sub
  JOIN transfer_collections c ON c.id = sub.collection_id
  WHERE sub.created_at < ?
    AND NOT EXISTS (SELECT 1 FROM transfer_submission_files f WHERE f.submission_id = sub.id)`,
		now.Add(-orphanDirAfter))
	if err != nil {
		return err
	}
	defer rows.Close()
	var refs []payloadRef
	for rows.Next() {
		var ref payloadRef
		if err := rows.Scan(&ref.id, &ref.publicKey, &ref.storageSourceID); err != nil {
			return err
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, ref := range refs {
		if err := s.deletePayloadDir(ref.storageSourceID, collectPayloadRel(ref.publicKey, ref.id, "")); err != nil {
			return err
		}
		if _, err := s.db.Exec(`DELETE FROM transfer_submissions WHERE id = ?`, ref.id); err != nil {
			return err
		}
		result.EmptySubmissions++
	}
	return nil
}

// sweepOrphanCollectDirs 删除没有对应提交台账的收集目录（提交写入中断的残余）。
func (s *Service) sweepOrphanCollectDirs(now time.Time, result *GCResult) error {
	rows, err := s.db.Query(`SELECT c.public_key, c.storage_source_id FROM transfer_collections c`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type collectionSource struct {
		publicKey string
		sourceID  int64
	}
	var collections []collectionSource
	for rows.Next() {
		var item collectionSource
		if err := rows.Scan(&item.publicKey, &item.sourceID); err != nil {
			return err
		}
		collections = append(collections, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, item := range collections {
		src, err := s.sources.GetByID(item.sourceID)
		if err != nil {
			continue
		}
		collectRoot, err := managedRootAbs(src)
		if err != nil {
			continue
		}
		collectDirAbs := filepath.Join(collectRoot, ManagedScopeDir, collectDir, item.publicKey)
		entries, err := os.ReadDir(collectDirAbs)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			return err
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			var submissionID int64
			if _, err := fmt.Sscanf(entry.Name(), "%d", &submissionID); err != nil || submissionID <= 0 {
				// 非数字目录名不是提交载荷，不触碰。
				continue
			}
			// 有台账文件的提交不是孤儿；空提交行由 removeEmptySubmissions 处理。
			var one int
			err := s.db.QueryRow(`SELECT 1 FROM transfer_submission_files WHERE submission_id = ?`,
				submissionID).Scan(&one)
			if err == nil {
				continue
			}
			info, infoErr := entry.Info()
			if infoErr != nil || now.Sub(info.ModTime()) <= orphanDirAfter {
				continue
			}
			if err := os.RemoveAll(filepath.Join(collectDirAbs, entry.Name())); err == nil {
				result.OrphanDirsRemoved++
			}
		}
	}
	return nil
}

func (s *Service) removeExpiredSessions(now time.Time, result *GCResult) error {
	res, err := s.db.Exec(`DELETE FROM transfer_access_sessions WHERE expires_at <= ?`, now)
	if err != nil {
		return err
	}
	removed, _ := res.RowsAffected()
	result.SessionsRemoved = int(removed)
	return nil
}

func (s *Service) deletePayloadDir(storageSourceID int64, managedRel string) error {
	src, err := s.sources.GetByID(storageSourceID)
	if err != nil {
		// 源已删除：载荷随源消失，不再清理。
		if errors.Is(err, sources.ErrNotFound) {
			return nil
		}
		return err
	}
	if err := s.files.DeleteManaged(src, managedRel, ManagedScopeDir); err != nil && !errors.Is(err, files.ErrNotFound) {
		return err
	}
	return nil
}
