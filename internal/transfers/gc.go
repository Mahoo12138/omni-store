package transfers

import (
	"errors"
	"fmt"
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
	now = now.UTC()
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
	// 无日志的旧临时文件/未知目录无法证明归属，保留供运维核查；
	// 精确上传残留由启动恢复处理，不能在运行时猜测删除活跃上传。
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
  WHERE status IN ('active', 'closed') AND expires_at IS NOT NULL AND expires_at <= ?`, now)
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
		if err := s.removeStaleDraft(ref, now, result); err != nil {
			return err
		}
	}
	return nil
}

func transferDraftLockKey(id int64) string {
	return fmt.Sprintf("transfer-draft:%d", id)
}

func (s *Service) removeStaleDraft(ref payloadRef, now time.Time, result *GCResult) error {
	unlock := s.files.Locks().Lock(transferDraftLockKey(ref.id))
	defer unlock()
	operations, err := s.pendingUploadOperations()
	if err != nil {
		return err
	}
	for _, op := range operations {
		if op.TransferID == ref.id {
			return nil // 日志清理失败时保留证明其归属的任务台账，等待启动恢复。
		}
	}
	var stale int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM transfers WHERE id = ? AND status = 'draft' AND updated_at < ?`, ref.id, now.Add(-draftStaleAfter)).Scan(&stale); err != nil {
		return err
	}
	if stale == 0 {
		return nil
	}
	if err := s.deletePayloadDir(ref.storageSourceID, sendPayloadRel(ref.publicKey, "")); err != nil {
		return fmt.Errorf("清理超时草稿 %s 失败: %w", ref.publicKey, err)
	}
	if _, err := s.db.Exec(`DELETE FROM transfers WHERE id = ? AND status = 'draft'`, ref.id); err != nil {
		return err
	}
	result.DraftsRemoved++
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

	collectionRows, err := s.db.Query(`SELECT id, public_key, storage_source_id FROM transfer_collections WHERE status IN ('revoked', 'expired')`)
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
		if err := s.managedRoots.Ensure(src); err != nil {
			return err
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
  WHERE sub.created_at < ? AND sub.file_count = 0 AND sub.total_size = 0
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
	operations, err := s.pendingUploadOperations()
	if err != nil {
		return err
	}
	pending := make(map[int64]bool, len(operations))
	for _, op := range operations {
		pending[op.SubmissionID] = true
	}
	for _, ref := range refs {
		if pending[ref.id] {
			continue
		}
		var committedFiles int
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM transfer_submission_files WHERE submission_id = ?`, ref.id).Scan(&committedFiles); err != nil {
			return err
		}
		if committedFiles > 0 {
			continue
		}
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
	// 先验证托管根归属，不能把未知或外来根下的“载荷不存在”视为可忽略。
	if err := s.managedRoots.Ensure(src); err != nil {
		return err
	}
	if err := s.files.DeleteManaged(src, managedRel, ManagedScopeDir); err != nil && !errors.Is(err, files.ErrNotFound) {
		return err
	}
	return nil
}
