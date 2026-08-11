// Package datadir 管理 OmniStore 系统数据目录的基础安全属性。
package datadir

import (
	"fmt"
	"os"
	"path/filepath"
)

const privateDirectoryMode = 0o700

var privateSubdirectories = []string{"keys", "cache", "tmp", "operations", "trash"}

// Prepare 创建系统数据目录，并收紧已有目录的权限。
func Prepare(root string) error {
	if root == "" {
		return fmt.Errorf("系统数据目录不能为空")
	}
	if err := validateDedicatedRoot(root); err != nil {
		return err
	}
	paths := make([]string, 0, len(privateSubdirectories)+1)
	paths = append(paths, root)
	for _, name := range privateSubdirectories {
		paths = append(paths, filepath.Join(root, name))
	}
	for _, path := range paths {
		if err := ensurePrivateDirectory(path); err != nil {
			return err
		}
	}
	return nil
}

func validateDedicatedRoot(root string) error {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("解析系统数据目录失败: %w", err)
	}
	volumeRoot := filepath.VolumeName(absRoot) + string(os.PathSeparator)
	if absRoot == volumeRoot {
		return fmt.Errorf("系统数据目录不能使用文件系统根目录")
	}
	if cwd, err := os.Getwd(); err == nil {
		if absCWD, err := filepath.Abs(cwd); err == nil && absRoot == absCWD {
			return fmt.Errorf("系统数据目录必须使用独立子目录，不能直接使用当前工作目录")
		}
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		if absHome, err := filepath.Abs(home); err == nil && absRoot == absHome {
			return fmt.Errorf("系统数据目录必须使用独立子目录，不能直接使用用户主目录")
		}
	}
	return nil
}

func ensurePrivateDirectory(path string) error {
	if err := os.MkdirAll(path, privateDirectoryMode); err != nil {
		return fmt.Errorf("创建系统数据目录 %s 失败: %w", path, err)
	}
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("检查系统数据目录 %s 失败: %w", path, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("系统数据目录 %s 必须是普通目录且不能是符号链接", path)
	}
	if err := os.Chmod(path, privateDirectoryMode); err != nil {
		return fmt.Errorf("收紧系统数据目录 %s 权限失败: %w", path, err)
	}
	return nil
}
