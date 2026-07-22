package sources

import (
	"os"
	"path/filepath"

	"github.com/omni-store/omnistore/internal/security"
)

const preflightEntryLimit = 20

// PreflightInput 是已有目录导入预检的输入。
type PreflightInput struct {
	RootPath        string
	ExcludePatterns []string
	// HasPatterns 为 false 时使用新建存储源的默认排除规则。
	HasPatterns bool
}

// DirectoryPreviewEntry 描述目录首层的一个可见条目。
type DirectoryPreviewEntry struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}

// DirectoryPreviewSummary 汇总目录首层内容。分类计数不包含已排除条目。
type DirectoryPreviewSummary struct {
	TotalEntries       int `json:"total_entries"`
	VisibleEntries     int `json:"visible_entries"`
	Files              int `json:"files"`
	Directories        int `json:"directories"`
	Symlinks           int `json:"symlinks"`
	UnsupportedEntries int `json:"unsupported_entries"`
	ExcludedEntries    int `json:"excluded_entries"`
}

// DirectoryPreview 是管理员确认创建存储源前看到的安全预检结果。
// 它只读取目录首层，不扫描或索引已有文件。
type DirectoryPreview struct {
	RootPath        string                  `json:"root_path"`
	IsEmpty         bool                    `json:"is_empty"`
	Summary         DirectoryPreviewSummary `json:"summary"`
	Entries         []DirectoryPreviewEntry `json:"entries"`
	SampleTruncated bool                    `json:"sample_truncated"`
	ExcludePatterns []string                `json:"exclude_patterns"`
	Warnings        []string                `json:"warnings"`
}

// Preflight 对已有目录执行与 Create 相同的路径安全和读写校验，并生成首层预览。
func (s *Service) Preflight(in PreflightInput) (*DirectoryPreview, error) {
	existing, err := s.allRootPaths()
	if err != nil {
		return nil, err
	}
	realPath, err := ValidateRootPath(in.RootPath, s.dataDir, existing)
	if err != nil {
		return nil, err
	}

	patterns := append([]string(nil), in.ExcludePatterns...)
	if !in.HasPatterns {
		patterns = append([]string(nil), DefaultExcludePatterns...)
	}
	return previewDirectory(realPath, patterns)
}

func previewDirectory(rootPath string, patterns []string) (*DirectoryPreview, error) {
	items, err := os.ReadDir(rootPath)
	if err != nil {
		return nil, err
	}

	preview := &DirectoryPreview{
		RootPath:        filepath.Clean(rootPath),
		IsEmpty:         len(items) == 0,
		Entries:         []DirectoryPreviewEntry{},
		ExcludePatterns: append([]string(nil), patterns...),
		Warnings:        []string{},
	}
	preview.Summary.TotalEntries = len(items)
	matcher := security.NewExcludeMatcher(patterns)

	for _, item := range items {
		name := filepath.ToSlash(item.Name())
		if matcher.MatchPrefix(name) {
			preview.Summary.ExcludedEntries++
			continue
		}

		preview.Summary.VisibleEntries++
		kind := "unsupported"
		switch {
		case item.Type()&os.ModeSymlink != 0:
			kind = "symlink"
			preview.Summary.Symlinks++
		case item.IsDir():
			kind = "directory"
			preview.Summary.Directories++
		case item.Type().IsRegular():
			kind = "file"
			preview.Summary.Files++
		default:
			preview.Summary.UnsupportedEntries++
		}

		if len(preview.Entries) < preflightEntryLimit {
			preview.Entries = append(preview.Entries, DirectoryPreviewEntry{Name: item.Name(), Kind: kind})
		}
	}

	preview.SampleTruncated = preview.Summary.VisibleEntries > len(preview.Entries)
	if !preview.IsEmpty {
		preview.Warnings = append(preview.Warnings, "该目录已有内容；创建后会直接作为存储源显示，文件不会被移动、复制或写入索引。")
	}
	if preview.Summary.ExcludedEntries > 0 {
		preview.Warnings = append(preview.Warnings, "命中排除规则的条目不会在 OmniStore 各入口中显示或访问。")
	}
	if preview.Summary.Symlinks > 0 {
		preview.Warnings = append(preview.Warnings, "符号链接仅标记为不支持，OmniStore 不会跟随或访问其目标。")
	}
	if preview.Summary.UnsupportedEntries > 0 {
		preview.Warnings = append(preview.Warnings, "特殊文件等不支持条目不会作为普通文件访问。")
	}
	if preview.SampleTruncated {
		preview.Warnings = append(preview.Warnings, "预览仅展示按名称排序后的前 20 个可见首层条目。")
	}
	return preview, nil
}
