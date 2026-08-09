package httpserver

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

const userContentCSP = "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'"

// setUserContentHeaders isolates files supplied by users from the application
// origin. Active document types are always downloaded, even when callers ask
// for an inline response.
func setUserContentHeaders(w http.ResponseWriter, content io.ReadSeeker, filename string, download bool) error {
	contentType, err := detectUserContentType(content, filename)
	if err != nil {
		return err
	}

	disposition := "inline"
	if download || isActiveContentType(contentType) {
		disposition = "attachment"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": filename}))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", userContentCSP)
	return nil
}

func detectUserContentType(content io.ReadSeeker, filename string) (string, error) {
	if contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(filename))); contentType != "" {
		return contentType, nil
	}

	position, err := content.Seek(0, io.SeekCurrent)
	if err != nil {
		return "", fmt.Errorf("读取文件位置: %w", err)
	}
	buffer := make([]byte, 512)
	n, readErr := content.Read(buffer)
	if readErr != nil && readErr != io.EOF {
		return "", fmt.Errorf("检测文件类型: %w", readErr)
	}
	if _, err := content.Seek(position, io.SeekStart); err != nil {
		return "", fmt.Errorf("恢复文件位置: %w", err)
	}
	return http.DetectContentType(buffer[:n]), nil
}

func isActiveContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.TrimSpace(strings.ToLower(strings.Split(contentType, ";")[0]))
	} else {
		mediaType = strings.ToLower(mediaType)
	}

	if strings.HasSuffix(mediaType, "+xml") {
		return true
	}
	switch mediaType {
	case "text/html",
		"application/xhtml+xml",
		"image/svg+xml",
		"text/xml",
		"application/xml",
		"text/javascript",
		"application/javascript",
		"application/ecmascript",
		"text/ecmascript":
		return true
	default:
		return false
	}
}
