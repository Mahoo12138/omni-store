// Package publicdisk 实现公开网盘：全站单 Source 绑定、公开目录浏览、raw 文件访问。
// 2.0 起 /public/* 固定映射 Site Public Drive 绑定的存储源，不再存在多源挂载。
package publicdisk

import (
	"errors"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

// ErrNotFound 公开盘未开启、未绑定或路径不存在。对外一律按不存在处理。
var ErrNotFound = errors.New("公开路径不存在")

// Summary 是公开盘首页展示的摘要。
type Summary struct {
	Enabled    bool   `json:"enabled"`
	SourceKey  string `json:"source_key,omitempty"`
	SourceName string `json:"source_name,omitempty"`
}

// capabilitiesLookup 是公开盘需要的 Site Capability 窄接口。
type capabilitiesLookup interface {
	ResolveSource(capability string) (*models.StorageSource, error)
}

// Service 提供公开网盘能力。复用核心文件服务，不绕过任何安全检查。
type Service struct {
	files        *files.Service
	capabilities capabilitiesLookup
}

// NewService 创建公开网盘服务。
func NewService(fileSvc *files.Service, capabilities capabilitiesLookup) *Service {
	return &Service{files: fileSvc, capabilities: capabilities}
}

// Resolve 将公开路径解析为绑定的存储源和源内相对路径。
// 未开启、未绑定或源不可用时返回 ErrNotFound，与路径不存在不可区分。
func (s *Service) Resolve(virtualPath string) (*models.StorageSource, string, error) {
	rel, err := security.NormalizeRelPath(virtualPath)
	if err != nil {
		return nil, "", ErrNotFound
	}
	src, err := s.capabilities.ResolveSource("public_drive")
	if err != nil {
		return nil, "", ErrNotFound
	}
	return src, rel, nil
}

// Summary 返回公开盘当前状态。
func (s *Service) Summary() (*Summary, error) {
	src, err := s.capabilities.ResolveSource("public_drive")
	if err != nil {
		return &Summary{Enabled: false}, nil
	}
	return &Summary{Enabled: true, SourceKey: src.Key, SourceName: src.Name}, nil
}

// List 浏览公开目录。公开侧隐藏 symlink（README §10.7）。
func (s *Service) List(virtualPath string, opts files.ListOptions) (*files.ListResult, error) {
	src, rel, err := s.Resolve(virtualPath)
	if err != nil {
		return nil, err
	}
	return s.files.List(src, rel, opts, false)
}

// Files 暴露核心文件服务（raw 下载入口使用）。
func (s *Service) Files() *files.Service {
	return s.files
}
