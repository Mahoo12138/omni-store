package models

import "time"

// 图片归属类型。
const (
	ImageOwnerUser      = "user"
	ImageOwnerAnonymous = "anonymous"
)

// Image 对应 images 表（README §17.10）。
type Image struct {
	ID               int64     `json:"id"`
	ImageID          string    `json:"image_id"`
	OwnerType        string    `json:"owner_type"`
	OwnerUserID      *int64    `json:"owner_user_id"`
	SourceID         string    `json:"source_id"`
	RelativePath     string    `json:"relative_path"`
	OriginalFilename string    `json:"original_filename"`
	PublicURL        string    `json:"public_url"`
	Size             int64     `json:"size"`
	MimeType         string    `json:"mime_type"`
	Width            int       `json:"width"`
	Height           int       `json:"height"`
	Ext              string    `json:"ext"`
	CreatedAt        time.Time `json:"created_at"`
}
