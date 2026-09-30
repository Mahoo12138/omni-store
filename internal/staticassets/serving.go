package staticassets

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/security"
)

// AllowedType 是第一批公开允许的静态类型（public-content-http §2）：
// 扩展名与服务端签名必须同时匹配；不因扩展名自动允许新格式。
type AllowedType struct {
	Extensions []string
	MimeType   string
	Signature  func(header []byte) bool
}

// allowedTypes 是唯一公开类型白名单；HTML/JS/CSS/XML/SVG/脚本/配置/备份不在其中。
var allowedTypes = []AllowedType{
	{Extensions: []string{".jpg", ".jpeg"}, MimeType: "image/jpeg", Signature: isJPEG},
	{Extensions: []string{".png"}, MimeType: "image/png", Signature: isPNG},
	{Extensions: []string{".gif"}, MimeType: "image/gif", Signature: isGIF},
	{Extensions: []string{".webp"}, MimeType: "image/webp", Signature: isWebP},
	{Extensions: []string{".mp4"}, MimeType: "video/mp4", Signature: isMP4},
	{Extensions: []string{".webm"}, MimeType: "video/webm", Signature: isWebM},
}

// signatureReadBytes 是类型判断读取的最大字节数；不为检测读取整个文件。
const signatureReadBytes = 64

// AllowedTypeExtensions 返回白名单扩展名（预检展示用）。
func AllowedTypeExtensions() []string {
	out := []string{}
	for _, t := range allowedTypes {
		out = append(out, t.Extensions...)
	}
	return out
}

func isJPEG(header []byte) bool {
	return len(header) >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF
}

func isPNG(header []byte) bool {
	return len(header) >= 8 && string(header[:8]) == "\x89PNG\r\n\x1a\n"
}

func isGIF(header []byte) bool {
	return len(header) >= 6 && (string(header[:6]) == "GIF87a" || string(header[:6]) == "GIF89a")
}

func isWebP(header []byte) bool {
	return len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WEBP"
}

func isMP4(header []byte) bool {
	// ISO BMFF：偏移 4-7 为 'ftyp' 主要品牌盒。
	return len(header) >= 8 && string(header[4:8]) == "ftyp"
}

func isWebM(header []byte) bool {
	return len(header) >= 4 && header[0] == 0x1A && header[1] == 0x45 && header[2] == 0xDF && header[3] == 0xA3
}

// classify 验证扩展名与服务端受限读取的签名；矛盾或无法判断一律拒绝。
func classify(name string, header []byte) (string, bool) {
	ext := strings.ToLower(filepath.Ext(name))
	for _, t := range allowedTypes {
		for _, candidate := range t.Extensions {
			if ext != candidate {
				continue
			}
			if t.Signature(header) {
				return t.MimeType, true
			}
			// 扩展名匹配但签名不匹配：类型矛盾，不公开。
			return "", false
		}
	}
	return "", false
}

// snapshotHeader 读取文件头部用于类型判断；不把大文件读进内存。
func snapshotHeader(f *os.File) ([]byte, error) {
	header := make([]byte, signatureReadBytes)
	n, err := f.ReadAt(header, 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	return header[:n], nil
}

// Resolved 是一次公开读取的解析结果；调用方负责 Close 与 unlock。
type Resolved struct {
	MimeType     string
	CacheControl string
	CORP         bool
	File         *os.File
	Info         os.FileInfo
	Unlock       func()
}

// Open 按 /assets/{assetID}/{relativePath} 解析并打开公开文件。
// 全链路：配置快照 → enabled/源状态 → 路径安全（含托管段/越界/排除）→
// 普通文件 + 类型白名单 → 打开。任何失败都以 ErrNotFound 语义返回，
// 不区分“不存在”与“不允许”，也不回退到其他公开入口。
func (s *Service) Open(assetID, relativePath string) (*Resolved, error) {
	snap, err := s.loadSnapshot()
	if err != nil {
		return nil, err
	}
	if !snap.enabled || snap.sourceID == nil || snap.publicAssetID == "" {
		return nil, files.ErrNotFound
	}
	if assetID != snap.publicAssetID {
		return nil, files.ErrNotFound
	}
	src, err := s.sources.GetByID(*snap.sourceID)
	if err != nil || src.IsDisabled {
		return nil, files.ErrNotFound
	}

	// 用户可控的 relativePath：执行与通用入口一致的路径安全规则。
	relPath, err := security.NormalizeRelPath(relativePath)
	if err != nil {
		return nil, files.ErrNotFound
	}
	if err := security.ValidateUserRelPath(relPath); err != nil {
		return nil, files.ErrNotFound
	}
	if relPath == "" {
		// 发布根本身（目录）不提供内容。
		return nil, files.ErrNotFound
	}
	fullRel := snap.publishRoot
	if fullRel != "" {
		fullRel = fullRel + "/" + relPath
	} else {
		fullRel = relPath
	}
	matcher, err := s.sources.Matcher(src.ID)
	if err != nil {
		return nil, files.ErrNotFound
	}
	if matcher.MatchPrefix(fullRel) {
		return nil, files.ErrNotFound
	}
	// 打开与检查共用 files 层的路径锁与软链接安全规则；
	// 长下载持有已打开的安全文件直到结束，不在分块间重新解析配置。
	f, info, unlock, err := s.files.OpenForRead(src, fullRel)
	if err != nil {
		return nil, files.ErrNotFound
	}

	header, err := snapshotHeader(f)
	if err != nil {
		unlock()
		f.Close()
		return nil, files.ErrNotFound
	}
	mimeType, ok := classify(relPath, header)
	if !ok {
		unlock()
		f.Close()
		return nil, files.ErrNotFound
	}

	return &Resolved{
		MimeType:     mimeType,
		CacheControl: cacheControlFor(snap.cacheMode),
		CORP:         true,
		File:         f,
		Info:         info,
		Unlock:       unlock,
	}, nil
}

// cacheControlFor 映射缓存档位（public-content-http §3）。
func cacheControlFor(mode string) string {
	switch mode {
	case CacheNoCache:
		return "no-cache"
	case CacheLong:
		return "public, max-age=31536000, immutable"
	default:
		return "public, max-age=300"
	}
}

// ResolvedETag 返回当前表示的弱验证器：明确标注 W/ 前缀，
// 不把 size+mtime 伪装成强 ETag（public-content-http §3）。
func ResolvedETag(info os.FileInfo) string {
	return fmt.Sprintf(`W/"%d-%d"`, info.Size(), info.ModTime().UnixNano())
}

// ModTime 暴露给条件请求处理。
func (r *Resolved) ModTime() time.Time {
	return r.Info.ModTime()
}
