package security

import (
	"path"
	"strings"
)

// 系统强制排除规则，永远生效，管理员不能关闭（README §11.2）。
var forcedExcludePatterns = []string{
	".omnistore-upload-*",
	"**/.omnistore-upload-*",
}

// ExcludeMatcher 按简单 glob 语法匹配排除路径（README §11.1）。
// 支持 ** 跨目录通配；不支持正则、否定规则。
type ExcludeMatcher struct {
	patterns [][]string
}

// NewExcludeMatcher 编译排除规则（自动附加系统强制规则）。
func NewExcludeMatcher(patterns []string) *ExcludeMatcher {
	m := &ExcludeMatcher{}
	for _, p := range append(append([]string{}, forcedExcludePatterns...), patterns...) {
		p = strings.Trim(strings.TrimSpace(strings.ReplaceAll(p, "\\", "/")), "/")
		if p == "" {
			continue
		}
		m.patterns = append(m.patterns, strings.Split(p, "/"))
	}
	return m
}

// Match 判断相对路径是否命中任一排除规则。
// relPath 必须是 NormalizeRelPath 的输出。
func (m *ExcludeMatcher) Match(relPath string) bool {
	if relPath == "" {
		return false
	}
	segs := strings.Split(relPath, "/")
	for _, pat := range m.patterns {
		if matchSegments(pat, segs) {
			return true
		}
	}
	return false
}

// matchSegments 递归匹配模式段与路径段。
// "**" 匹配零个或多个路径段；其余段使用 path.Match 单段匹配。
func matchSegments(pattern, segs []string) bool {
	if len(pattern) == 0 {
		return len(segs) == 0
	}
	if pattern[0] == "**" {
		// ** 匹配零段或吞掉一段后继续。
		if matchSegments(pattern[1:], segs) {
			return true
		}
		if len(segs) > 0 {
			return matchSegments(pattern, segs[1:])
		}
		return false
	}
	if len(segs) == 0 {
		return false
	}
	ok, err := path.Match(pattern[0], segs[0])
	if err != nil || !ok {
		return false
	}
	return matchSegments(pattern[1:], segs[1:])
}

// MatchPrefix 判断路径本身或其任一父级目录是否命中排除规则。
// 用于阻止访问被排除目录内部的内容（例如规则 private/**
// 时，private/a/b.txt 的父级 private/a 已命中）。
func (m *ExcludeMatcher) MatchPrefix(relPath string) bool {
	if relPath == "" {
		return false
	}
	segs := strings.Split(relPath, "/")
	for i := 1; i <= len(segs); i++ {
		if m.Match(strings.Join(segs[:i], "/")) {
			return true
		}
	}
	return false
}
