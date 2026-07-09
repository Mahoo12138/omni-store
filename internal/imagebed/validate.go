package imagebed

import (
	"errors"
	"fmt"
	"image"
	"os"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

// ErrUnsupportedFormat 图片格式不在允许列表（README §17.7）。
var ErrUnsupportedFormat = errors.New("图片格式不支持，仅允许 jpg / jpeg / png / webp / gif")

// ImageInfo 是服务端识别出的图片真实信息。
type ImageInfo struct {
	Ext      string // 服务端识别结果决定最终扩展名
	MimeType string
	Width    int
	Height   int
}

// formatMeta 将 Go 图片库识别的格式名映射到扩展名和 MIME。
var formatMeta = map[string]ImageInfo{
	"jpeg": {Ext: "jpg", MimeType: "image/jpeg"},
	"png":  {Ext: "png", MimeType: "image/png"},
	"gif":  {Ext: "gif", MimeType: "image/gif"},
	"webp": {Ext: "webp", MimeType: "image/webp"},
}

// ValidateImageFile 校验磁盘上的图片文件：
// 不相信扩展名和 Content-Type，用图片库 DecodeConfig 判定真实格式和宽高（README §17.7）。
func ValidateImageFile(path string) (*ImageInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开临时文件失败: %w", err)
	}
	defer f.Close()

	cfg, format, err := image.DecodeConfig(f)
	if err != nil {
		return nil, ErrUnsupportedFormat
	}
	meta, ok := formatMeta[format]
	if !ok {
		return nil, ErrUnsupportedFormat
	}
	return &ImageInfo{
		Ext:      meta.Ext,
		MimeType: meta.MimeType,
		Width:    cfg.Width,
		Height:   cfg.Height,
	}, nil
}
