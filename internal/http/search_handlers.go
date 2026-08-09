package httpserver

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/omni-store/omnistore/internal/files"
)

func (s *Server) handleSearchFiles(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	page, _ := strconv.Atoi(query.Get("page"))
	pageSize, _ := strconv.Atoi(query.Get("page_size"))
	result, err := s.files.SearchFiles(CurrentUser(r.Context()), files.SearchOptions{
		Query: strings.TrimSpace(query.Get("q")), SourceKey: strings.TrimSpace(query.Get("source_key")),
		Page: page, PageSize: pageSize,
	})
	if errors.Is(err, files.ErrSearchQuery) {
		WriteError(w, r, CodeValidationError, err.Error(), nil)
		return
	}
	if err != nil {
		WriteError(w, r, CodeInternalError, "搜索文件失败", nil)
		return
	}
	WriteData(w, r, result)
}
