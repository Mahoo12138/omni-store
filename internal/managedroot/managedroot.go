// Package managedroot 实现 `.omnistore/` 托管根的所有权登记与核验。
// 目录名本身不能证明归属：首次初始化写入受限权限标识文件并在数据库登记
// （源 ID、实例标识、随机 nonce）；发现无法核验的同名目录时拒绝接管、
// 不删除，由管理员人工处理（design/managed-namespace.md §6）。
package managedroot

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

const (
	// markerFileName 是托管根内的所有权标识文件，权限收紧为 0600。
	markerFileName = "managed-root.json"
	// SettingInstanceID 是实例持久标识的 system_settings key。
	SettingInstanceID = "instance_id"
)

var (
	// ErrUnknownRoot 表示存在无法核验的同名 .omnistore 目录：
	// 不接管、不修改、不删除，需要管理员确认后处理。
	ErrUnknownRoot = errors.New("发现未知 .omnistore 目录：不能接管或删除，请人工确认后处理")
	// ErrOwnershipMismatch 表示登记与标识文件不一致，托管根可能被篡改或损坏。
	ErrOwnershipMismatch = errors.New(".omnistore 所有权核验失败：登记与标识文件不一致")
)

// markerFile 是标识文件的磁盘表示。
type markerFile struct {
	Version         int       `json:"version"`
	InstanceID      string    `json:"instance_id"`
	Nonce           string    `json:"nonce"`
	StorageSourceID int64     `json:"storage_source_id"`
	CreatedAt       time.Time `json:"created_at"`
}

// Service 提供托管根登记核验。
type Service struct {
	db *sql.DB
}

// NewService 创建托管根服务。
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) instanceID() (string, error) {
	var id string
	err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = ?`, SettingInstanceID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	id = auth.NewRandomToken("inst-", 12)
	_, err = s.db.Exec(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO NOTHING`, SettingInstanceID, id, time.Now().UTC())
	if err != nil {
		return "", err
	}
	if err := s.db.QueryRow(`SELECT value FROM system_settings WHERE key = ?`, SettingInstanceID).Scan(&id); err != nil {
		return "", err
	}
	return id, nil
}

type registration struct {
	nonce      string
	instanceID string
}

func (s *Service) loadRegistration(storageSourceID int64) (*registration, error) {
	var reg registration
	err := s.db.QueryRow(`SELECT ownership_nonce, instance_id FROM managed_root_registrations
  WHERE storage_source_id = ?`, storageSourceID).Scan(&reg.nonce, &reg.instanceID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &reg, nil
}

// Ensure 校验（必要时初始化）源根上的托管根，供受信任服务写入前调用。
// 任何无法核验的情况都返回错误：调用方必须停止写入托管命名空间。
func (s *Service) Ensure(src *models.StorageSource) error {
	root, err := security.ResolveInSource(src.RootPath, security.ManagedNamespaceSegment)
	if err != nil {
		return err
	}
	info, statErr := os.Lstat(root)
	reg, err := s.loadRegistration(src.ID)
	if err != nil {
		return err
	}

	switch {
	case statErr != nil && !os.IsNotExist(statErr):
		return statErr
	case os.IsNotExist(statErr):
		if reg != nil {
			// 登记仍在而目录被宿主机删除：旧登记作废，重新初始化。
			if _, err := s.db.Exec(`DELETE FROM managed_root_registrations WHERE storage_source_id = ?`, src.ID); err != nil {
				return err
			}
			reg = nil
		}
		return s.initialize(src, root)
	case !info.IsDir() || info.Mode()&os.ModeSymlink != 0:
		return fmt.Errorf("%w：%s 不是目录", ErrUnknownRoot, security.ManagedNamespaceSegment)
	case reg == nil:
		// 目录存在但没有登记。崩溃恢复：若标识文件是本实例写入的完整格式，
		// 视为初始化中断并采纳；否则视为未知目录，拒绝接管。
		return s.adoptOrReject(src, root)
	default:
		marker, err := readMarker(root)
		if err != nil {
			return errors.Join(ErrOwnershipMismatch, err)
		}
		if marker.Nonce != reg.nonce || marker.InstanceID != reg.instanceID || marker.StorageSourceID != src.ID {
			return ErrOwnershipMismatch
		}
		return nil
	}
}

func (s *Service) initialize(src *models.StorageSource, root string) error {
	instanceID, err := s.instanceID()
	if err != nil {
		return err
	}
	nonce := auth.NewRandomToken("", 24)
	marker := markerFile{
		Version: 1, InstanceID: instanceID, Nonce: nonce,
		StorageSourceID: src.ID, CreatedAt: time.Now().UTC(),
	}
	content, err := json.MarshalIndent(marker, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("创建托管根失败: %w", err)
	}
	markerPath := filepath.Join(root, markerFileName)
	handle, err := os.OpenFile(markerPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			// 并发初始化竞争：赢家已写入标识，按已有登记重新核验。
			return s.Ensure(src)
		}
		return fmt.Errorf("写入托管根标识失败: %w", err)
	}
	if _, err := handle.Write(content); err != nil {
		handle.Close()
		return fmt.Errorf("写入托管根标识失败: %w", err)
	}
	if err := handle.Sync(); err != nil {
		handle.Close()
		return fmt.Errorf("同步托管根标识失败: %w", err)
	}
	if err := handle.Close(); err != nil {
		return fmt.Errorf("关闭托管根标识失败: %w", err)
	}
	if _, err := s.db.Exec(`INSERT INTO managed_root_registrations
  (storage_source_id, ownership_nonce, instance_id, registered_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(storage_source_id) DO NOTHING`,
		src.ID, nonce, instanceID, time.Now().UTC()); err != nil {
		return err
	}
	return s.Ensure(src)
}

// adoptOrReject 处理"标识文件存在但登记缺失"的崩溃间隙。
func (s *Service) adoptOrReject(src *models.StorageSource, root string) error {
	marker, err := readMarker(root)
	if err != nil {
		return errors.Join(ErrUnknownRoot, err)
	}
	if marker.StorageSourceID != src.ID || marker.InstanceID == "" || marker.Nonce == "" {
		return ErrUnknownRoot
	}
	instanceID, err := s.instanceID()
	if err != nil {
		return err
	}
	if marker.InstanceID != instanceID {
		// 标识文件属于其他实例（例如备份恢复到新实例），需要显式重新登记。
		return ErrUnknownRoot
	}
	if _, err := s.db.Exec(`INSERT INTO managed_root_registrations
  (storage_source_id, ownership_nonce, instance_id, registered_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(storage_source_id) DO NOTHING`,
		src.ID, marker.Nonce, marker.InstanceID, time.Now().UTC()); err != nil {
		return err
	}
	return nil
}

func readMarker(root string) (markerFile, error) {
	var marker markerFile
	handle, err := os.Open(filepath.Join(root, markerFileName))
	if err != nil {
		return marker, err
	}
	defer handle.Close()
	decoder := json.NewDecoder(handle)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&marker); err != nil {
		return marker, fmt.Errorf("解析托管根标识失败: %w", err)
	}
	if marker.Version != 1 {
		return marker, fmt.Errorf("托管根标识版本不支持: %d", marker.Version)
	}
	return marker, nil
}
