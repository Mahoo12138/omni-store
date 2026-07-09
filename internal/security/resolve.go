package security

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ErrSymlink 表示路径中存在符号链接。
var ErrSymlink = fmt.Errorf("路径包含符号链接")

// ResolveInSource 将规范化相对路径解析为存储源内的绝对路径，
// 并逐段检查符号链接（README §10.7：任何路径段解析到 symlink 直接拒绝）。
// relPath 必须是 NormalizeRelPath 的输出；"" 表示存储源根目录。
// 不要求目标存在（用于上传/创建场景），但已存在的每一段都不能是 symlink。
func ResolveInSource(rootPath, relPath string) (string, error) {
	abs := rootPath
	if relPath != "" {
		abs = filepath.Join(rootPath, filepath.FromSlash(relPath))
	}

	// 双保险：解析后必须仍在存储源根目录内。
	cleanRoot := filepath.Clean(rootPath)
	if abs != cleanRoot && !strings.HasPrefix(abs, cleanRoot+string(filepath.Separator)) {
		return "", fmt.Errorf("路径逃出存储源根目录")
	}

	// 逐段 Lstat 检查 symlink。段不存在时停止（后续段必然不存在）。
	if relPath != "" {
		cur := cleanRoot
		for _, seg := range strings.Split(relPath, "/") {
			cur = filepath.Join(cur, seg)
			info, err := os.Lstat(cur)
			if err != nil {
				if os.IsNotExist(err) {
					break
				}
				return "", fmt.Errorf("检查路径失败: %w", err)
			}
			if info.Mode()&os.ModeSymlink != 0 {
				return "", ErrSymlink
			}
		}
	}
	return abs, nil
}
