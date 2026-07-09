package security

import (
	"fmt"
	"strings"
)

// NormalizeRelPath 规范化存储源内部相对路径（README §10.8 / §28）。
// 输入形如 "/2026/travel" 或 "2026/travel"，输出统一为不带前导斜杠、
// 以 "/" 分隔的相对路径；根目录返回 ""。
// 拒绝：路径穿越、空字节、控制字符、单段内的 "." / ".."、仅空白的文件名。
func NormalizeRelPath(input string) (string, error) {
	p := strings.ReplaceAll(input, "\\", "/")
	p = strings.Trim(p, "/")
	if p == "" {
		return "", nil
	}

	for _, r := range p {
		if r == 0 || (r < 32 && r != 0) {
			return "", fmt.Errorf("路径包含非法控制字符")
		}
	}

	segs := strings.Split(p, "/")
	out := make([]string, 0, len(segs))
	for _, seg := range segs {
		if seg == "" {
			continue // 折叠连续斜杠
		}
		if seg == "." || seg == ".." {
			return "", fmt.Errorf("路径不允许包含 . 或 ..")
		}
		if strings.TrimSpace(seg) == "" {
			return "", fmt.Errorf("文件名不能仅由空白组成")
		}
		out = append(out, seg)
	}
	return strings.Join(out, "/"), nil
}

// ValidateFileName 校验单个文件/目录名（README §10.8）。
func ValidateFileName(name string) error {
	if name == "" || strings.TrimSpace(name) == "" {
		return fmt.Errorf("文件名不能为空")
	}
	if name == "." || name == ".." {
		return fmt.Errorf("文件名不能是 . 或 ..")
	}
	if strings.ContainsAny(name, "/\\") {
		return fmt.Errorf("文件名不能包含斜杠")
	}
	for _, r := range name {
		if r < 32 {
			return fmt.Errorf("文件名包含非法控制字符")
		}
	}
	return nil
}
