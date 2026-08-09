package files

import (
	"errors"
	"fmt"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
)

var ErrSearchQuery = errors.New("搜索关键字必须为 2 到 128 个字符")

// SearchOptions 控制登录用户的全局 active 文件搜索。
type SearchOptions struct {
	Query     string
	SourceKey string
	Page      int
	PageSize  int
}

type searchCandidate struct {
	sourceID   int64
	sourceKey  string
	sourceName string
	relPath    string
	size       int64
	mtimeNano  int64
}

// SearchFiles 使用 FTS5 文件台账索引搜索，并在返回前再次执行来源授权和排除规则检查。
func (s *Service) SearchFiles(user *models.User, opts SearchOptions) (*models.FileSearchResult, error) {
	query := strings.TrimSpace(opts.Query)
	queryRunes := utf8.RuneCountInString(query)
	if queryRunes < 2 || queryRunes > 128 {
		return nil, ErrSearchQuery
	}
	if opts.Page < 1 {
		opts.Page = 1
	}
	if opts.PageSize < 1 {
		opts.PageSize = 20
	}
	if opts.PageSize > 100 {
		opts.PageSize = 100
	}

	views, err := s.sources.ListForUser(user)
	if err != nil {
		return nil, err
	}
	allowedKeys := make(map[string]struct{}, len(views))
	for _, view := range views {
		allowedKeys[view.Key] = struct{}{}
	}
	allSources, err := s.sources.List()
	if err != nil {
		return nil, err
	}
	var sourceIDs []int64
	for _, source := range allSources {
		if source.IsDisabled {
			continue
		}
		if _, allowed := allowedKeys[source.Key]; !allowed {
			continue
		}
		if opts.SourceKey != "" && source.Key != opts.SourceKey {
			continue
		}
		sourceIDs = append(sourceIDs, source.ID)
	}
	result := &models.FileSearchResult{Page: opts.Page, PageSize: opts.PageSize, Items: []*models.FileSearchItem{}}
	if len(sourceIDs) == 0 {
		return result, nil
	}

	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(sourceIDs)), ",")
	args := make([]any, 0, len(sourceIDs)+2)
	var searchClause, orderClause string
	if queryRunes >= 3 {
		searchClause = `file_search_index MATCH ?`
		args = append(args, `"`+strings.ReplaceAll(query, `"`, `""`)+`"`)
		orderClause = `bm25(file_search_index), lower(f.relative_path), f.id`
	} else {
		// trigram 不索引少于三个字符的词，短中文关键字使用精确字面包含查询。
		searchClause = `instr(lower(f.relative_path), lower(?)) > 0`
		args = append(args, query)
		orderClause = `lower(f.relative_path), f.id`
	}
	for _, sourceID := range sourceIDs {
		args = append(args, sourceID)
	}
	rows, err := s.db.Query(fmt.Sprintf(`SELECT f.storage_source_id, s.key, s.name, f.relative_path, f.size, f.mtime_unix_nano
  FROM file_search_index
  JOIN file_records f ON f.id = file_search_index.rowid
  JOIN storage_sources s ON s.id = f.storage_source_id
  WHERE %s AND f.record_status = 'active' AND f.storage_source_id IN (%s)
  ORDER BY %s`, searchClause, placeholders, orderClause), args...)
	if err != nil {
		return nil, fmt.Errorf("查询文件索引失败: %w", err)
	}
	var candidates []searchCandidate
	for rows.Next() {
		var item searchCandidate
		if err := rows.Scan(&item.sourceID, &item.sourceKey, &item.sourceName, &item.relPath, &item.size, &item.mtimeNano); err != nil {
			rows.Close()
			return nil, err
		}
		candidates = append(candidates, item)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	matchers := make(map[int64]*security.ExcludeMatcher, len(sourceIDs))
	start := (opts.Page - 1) * opts.PageSize
	end := start + opts.PageSize
	for _, candidate := range candidates {
		matcher := matchers[candidate.sourceID]
		if matcher == nil {
			matcher, err = s.sources.Matcher(candidate.sourceID)
			if err != nil {
				return nil, err
			}
			matchers[candidate.sourceID] = matcher
		}
		if matcher.MatchPrefix(candidate.relPath) {
			continue
		}
		visibleIndex := int(result.Total)
		result.Total++
		if visibleIndex < start || visibleIndex >= end {
			continue
		}
		parent := path.Dir(candidate.relPath)
		if parent == "." {
			parent = ""
		}
		result.Items = append(result.Items, &models.FileSearchItem{
			SourceKey: candidate.sourceKey, SourceName: candidate.sourceName,
			Path: candidate.relPath, ParentPath: parent, Name: path.Base(candidate.relPath),
			Size: candidate.size, ModifiedAt: time.Unix(0, candidate.mtimeNano).UTC(),
		})
	}
	result.HasNext = int64(opts.Page*opts.PageSize) < result.Total
	return result, nil
}
