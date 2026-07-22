package httpserver

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/omni-store/omnistore/internal/audit"
)

// handleAdminAuditLogs 返回可筛选、可分页的审计日志。
func (s *Server) handleAdminAuditLogs(w http.ResponseWriter, r *http.Request) {
	opts, err := parseAuditQuery(r)
	if err != nil {
		WriteError(w, r, CodeValidationError, err.Error(), nil)
		return
	}
	entries, total, err := s.audit.Query(opts)
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询审计日志失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: entries, Total: total})
}

func parseAuditQuery(r *http.Request) (audit.QueryOptions, error) {
	query := r.URL.Query()
	page, err := positiveIntQuery(query.Get("page"), 1, 0)
	if err != nil {
		return audit.QueryOptions{}, fmt.Errorf("page 必须是正整数")
	}
	pageSize, err := positiveIntQuery(query.Get("page_size"), 50, 200)
	if err != nil {
		return audit.QueryOptions{}, fmt.Errorf("page_size 必须是 1-200 的整数")
	}

	actorType := strings.TrimSpace(query.Get("actor_type"))
	if !oneOf(actorType, "", audit.ActorUser, audit.ActorAnonymous, audit.ActorSystem) {
		return audit.QueryOptions{}, fmt.Errorf("actor_type 无效")
	}
	entryType := strings.TrimSpace(query.Get("entry_type"))
	if !oneOf(entryType, "", audit.EntryWeb, audit.EntryWebDAV, audit.EntryImageBed,
		audit.EntryAnonymousImageBed, audit.EntryAdmin, audit.EntryCLI) {
		return audit.QueryOptions{}, fmt.Errorf("entry_type 无效")
	}
	status := strings.TrimSpace(query.Get("status"))
	if !oneOf(status, "", audit.StatusSuccess, audit.StatusFailed) {
		return audit.QueryOptions{}, fmt.Errorf("status 无效")
	}
	searchText := strings.TrimSpace(query.Get("q"))
	if len([]rune(searchText)) > 128 {
		return audit.QueryOptions{}, fmt.Errorf("q 最多 128 个字符")
	}

	return audit.QueryOptions{
		Page: page, PageSize: pageSize, ActorType: actorType,
		EntryType: entryType, Status: status, SearchText: searchText,
	}, nil
}

func positiveIntQuery(raw string, fallback, max int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 || (max > 0 && n > max) {
		return 0, fmt.Errorf("invalid positive integer")
	}
	return n, nil
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
