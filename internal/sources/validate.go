// Package sources 负责存储源管理、路径安全校验和排除规则。
package sources

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/omni-store/omnistore/internal/auth"
)

var sourceIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`)

// ValidateSourceID 校验 source_id 命名（README §10.2，兼容 S3 Bucket 命名）。
func ValidateSourceID(id string) error {
	if !sourceIDRe.MatchString(id) {
		return fmt.Errorf("source_id 只允许小写字母、数字、短横线，长度 3-63，首尾必须是字母或数字")
	}
	if strings.Contains(id, "--") {
		return fmt.Errorf("source_id 不允许连续两个短横线")
	}
	if net.ParseIP(id) != nil {
		return fmt.Errorf("source_id 不允许是 IP 地址格式")
	}
	return nil
}

// Linux 敏感目录黑名单（README §10.5）。
var sensitiveDirs = []string{
	"/etc", "/boot", "/proc", "/sys", "/dev", "/run",
	"/var", "/usr", "/bin", "/sbin", "/lib", "/lib64",
}

// pathContains 判断 child 是否等于 parent 或位于 parent 之下。
// Windows 开发环境下忽略大小写。
func pathContains(parent, child string) bool {
	p := filepath.Clean(parent)
	c := filepath.Clean(child)
	if runtime.GOOS == "windows" {
		p = strings.ToLower(p)
		c = strings.ToLower(c)
	}
	if p == c {
		return true
	}
	return strings.HasPrefix(c, p+string(filepath.Separator))
}

// ValidateRootPath 执行新建存储源的全部路径安全校验（README §10.5）。
// 返回解析符号链接后的真实绝对路径。
// existingRoots 是已有存储源的 root_path 列表，用于防重叠。
func ValidateRootPath(input, dataDir string, existingRoots []string) (string, error) {
	if strings.TrimSpace(input) == "" {
		return "", fmt.Errorf("root_path 不能为空")
	}

	abs, err := filepath.Abs(input)
	if err != nil {
		return "", fmt.Errorf("解析绝对路径失败: %w", err)
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("路径不存在或无法解析: %s", input)
	}

	info, err := os.Stat(real)
	if err != nil {
		return "", fmt.Errorf("路径不存在: %s", input)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("路径不是目录: %s", input)
	}

	// 禁止挂载根目录。
	if real == "/" || real == filepath.VolumeName(real)+string(filepath.Separator) {
		return "", fmt.Errorf("禁止挂载根目录")
	}

	// 禁止挂载系统敏感目录（本身或其子目录）。
	slashReal := filepath.ToSlash(real)
	for _, s := range sensitiveDirs {
		if slashReal == s || strings.HasPrefix(slashReal, s+"/") {
			return "", fmt.Errorf("禁止挂载系统敏感目录: %s", s)
		}
	}

	// 禁止与系统数据目录本身、父目录或子目录重叠（README §5.2）。
	realDataDir := dataDir
	if r, err := filepath.EvalSymlinks(dataDir); err == nil {
		realDataDir = r
	}
	if pathContains(realDataDir, real) || pathContains(real, realDataDir) {
		return "", fmt.Errorf("禁止挂载 OmniStore 系统数据目录及其父/子目录")
	}

	// 禁止与已有存储源重叠。
	for _, existing := range existingRoots {
		if pathContains(existing, real) || pathContains(real, existing) {
			return "", fmt.Errorf("与已有存储源路径重叠: %s", existing)
		}
	}

	// 读写权限预检。
	if err := writePrecheck(real); err != nil {
		return "", err
	}
	return real, nil
}

// writePrecheck 执行读写预检（README §10.5）：
// 列目录 -> 创建隐藏测试文件 -> 写 1 字节 -> 删除。
func writePrecheck(dir string) error {
	if _, err := os.ReadDir(dir); err != nil {
		return fmt.Errorf("目录不可读: %w", err)
	}
	testFile := filepath.Join(dir, ".omnistore-write-test-"+auth.NewRandomToken("", 6))
	f, err := os.OpenFile(testFile, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("目录不可写: %w", err)
	}
	_, werr := f.Write([]byte{0})
	cerr := f.Close()
	rerr := os.Remove(testFile)
	if werr != nil || cerr != nil || rerr != nil {
		return fmt.Errorf("写入预检失败")
	}
	return nil
}

var mountPathRe = regexp.MustCompile(`^/[a-z0-9_/-]+$`)

// NormalizeMountPath 校验并规范化公开挂载路径（README §12.3）。
// existing 是其他存储源已占用的挂载路径，用于唯一性和互相包含检查。
func NormalizeMountPath(input string, existing []string) (string, error) {
	p := strings.TrimRight(strings.TrimSpace(input), "/")
	if p == "" || p == "/" {
		return "", fmt.Errorf("公开挂载路径不能为空或 /")
	}
	if !mountPathRe.MatchString(p) {
		return "", fmt.Errorf("公开挂载路径必须以 / 开头，只允许小写字母、数字、短横线、下划线和 /")
	}
	for _, seg := range strings.Split(strings.TrimPrefix(p, "/"), "/") {
		if seg == "" {
			return "", fmt.Errorf("公开挂载路径不允许连续斜杠")
		}
	}
	for _, e := range existing {
		if e == p || strings.HasPrefix(e, p+"/") || strings.HasPrefix(p, e+"/") {
			return "", fmt.Errorf("公开挂载路径与已有路径 %s 冲突或互相包含", e)
		}
	}
	return p, nil
}
