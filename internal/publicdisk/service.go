// Package publicdisk 实现公开网盘：虚拟挂载解析、公开目录浏览、raw 文件访问（README §12）。
package publicdisk

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

// ErrNotFound 虚拟路径未命中任何公开挂载。
var ErrNotFound = errors.New("公开路径不存在")

// Mount 是公开网盘首页展示的挂载入口。
type Mount struct {
	MountPath   string `json:"mount_path"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Service 提供公开网盘能力。复用核心文件服务，不绕过任何安全检查。
type Service struct {
	db      *sql.DB
	sources *sources.Service
	files   *files.Service
}

// NewService 创建公开网盘服务。
func NewService(db *sql.DB, srcSvc *sources.Service, fileSvc *files.Service) *Service {
	return &Service{db: db, sources: srcSvc, files: fileSvc}
}

// ListMounts 返回全部可用公开挂载（未禁用且已公开）。
func (s *Service) ListMounts() ([]*Mount, error) {
	rows, err := s.db.Query(`SELECT public_mount_path, name, COALESCE(description, '')
  FROM storage_sources
  WHERE is_disabled = 0 AND public_read_enabled = 1 AND public_mount_path IS NOT NULL
  ORDER BY public_mount_path`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*Mount{}
	for rows.Next() {
		var m Mount
		if err := rows.Scan(&m.MountPath, &m.Name, &m.Description); err != nil {
			return nil, err
		}
		out = append(out, &m)
	}
	return out, rows.Err()
}

// Resolve 将公开虚拟路径解析为存储源和源内相对路径。
// 挂载路径互不包含（README §12.3），最多命中一个。
// 检查链路：挂载存在 -> 存储源未禁用 -> public_read_enabled。
func (s *Service) Resolve(virtualPath string) (*models.StorageSource, string, error) {
	rel, err := security.NormalizeRelPath(virtualPath)
	if err != nil || rel == "" {
		return nil, "", ErrNotFound
	}

	mounts, err := s.ListMounts()
	if err != nil {
		return nil, "", err
	}
	for _, m := range mounts {
		mount := strings.TrimPrefix(m.MountPath, "/")
		var inner string
		switch {
		case rel == mount:
			inner = ""
		case strings.HasPrefix(rel, mount+"/"):
			inner = rel[len(mount)+1:]
		default:
			continue
		}

		var sourceID string
		err := s.db.QueryRow(`SELECT source_id FROM storage_sources WHERE public_mount_path = ?`,
			m.MountPath).Scan(&sourceID)
		if err != nil {
			return nil, "", ErrNotFound
		}
		src, err := s.sources.Get(sourceID)
		if err != nil {
			return nil, "", ErrNotFound
		}
		if src.IsDisabled || !src.PublicReadEnabled {
			return nil, "", ErrNotFound
		}
		return src, inner, nil
	}
	return nil, "", ErrNotFound
}

// List 浏览公开目录。公开侧隐藏 symlink（README §10.7）。
func (s *Service) List(virtualPath string, opts files.ListOptions) (*files.ListResult, error) {
	src, inner, err := s.Resolve(virtualPath)
	if err != nil {
		return nil, err
	}
	return s.files.List(src, inner, opts, false)
}

// Files 暴露核心文件服务（raw 下载入口使用）。
func (s *Service) Files() *files.Service {
	return s.files
}
