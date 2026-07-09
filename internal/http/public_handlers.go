package httpserver

import (
	"errors"
	"mime"
	"net/http"
	"path"
	"strconv"

	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/publicdisk"
)

// --- 公开网盘（README §12，匿名可访问，无需登录） ---

func (s *Server) handlePublicMounts(w http.ResponseWriter, r *http.Request) {
	mounts, err := s.public.ListMounts()
	if err != nil {
		WriteError(w, r, CodeInternalError, "查询公开挂载失败", nil)
		return
	}
	WriteData(w, r, ListData{Items: mounts, Total: int64(len(mounts))})
}

func (s *Server) handlePublicBrowse(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	pageSize, _ := strconv.Atoi(q.Get("page_size"))

	result, err := s.public.List(q.Get("path"), files.ListOptions{
		Page: page, PageSize: pageSize,
		Sort: q.Get("sort"), Order: q.Get("order"),
	})
	if err != nil {
		if errors.Is(err, publicdisk.ErrNotFound) {
			WriteError(w, r, CodeFileNotFound, "公开路径不存在", nil)
			return
		}
		writeFileError(w, r, err)
		return
	}
	WriteData(w, r, result)
}

// handlePublicRaw 处理 GET /raw/*：公开文件原始访问（README §12.5）。
// 默认 inline，?download=1 强制下载；缓存 5 分钟（README §13.10/§13.11）。
func (s *Server) handlePublicRaw(w http.ResponseWriter, r *http.Request) {
	virtualPath := r.PathValue("virtual_path")

	src, inner, err := s.public.Resolve(virtualPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	f, info, unlock, err := s.public.Files().OpenForRead(src, inner)
	if err != nil {
		// 公开侧不区分错误类型，统一 404，避免泄露内部信息。
		http.NotFound(w, r)
		return
	}
	defer unlock()
	defer f.Close()

	filename := sanitizeFilename(path.Base("/" + inner))
	disposition := "inline"
	if r.URL.Query().Get("download") == "1" {
		disposition = "attachment"
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": filename}))
	w.Header().Set("Cache-Control", "public, max-age=300")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}
