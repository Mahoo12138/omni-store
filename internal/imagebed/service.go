package imagebed

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/security"
	"github.com/omni-store/omnistore/internal/sources"
)

var (
	// ErrNoTarget 用户没有可用的图床目标。
	ErrNoTarget = errors.New("没有可用的图床目标，请先在设置中选择")
	// ErrTargetInvalid 目标存储源不可用（禁用/未开图床/无读写权限）。
	ErrTargetInvalid = errors.New("图床目标不可用")
	// ErrNotFound 图片不存在。
	ErrNotFound = errors.New("图片不存在")
	// ErrAnonymousDisabled 匿名图床未开启。
	ErrAnonymousDisabled = errors.New("匿名公共图床未开启")
)

// 系统设置 key（README §22.9）。
const (
	SettingAnonymousEnabled         = "anonymous_image_bed_enabled"
	SettingAnonymousStorageSourceID = "anonymous_image_bed_storage_source_id"
)

// Service 提供图床能力。
type Service struct {
	db             *sql.DB
	rootRel        string // image_bed.root_path 规范化后的源内相对路径，例如 "images"
	publicURL      string
	thumbnailCache string
	sources        *sources.Service
	files          *files.Service
	locks          *locks.Manager
	thumbnailLocks *locks.Manager
	thumbnailSlot  chan struct{}
}

// NewService 创建图床服务。
func NewService(db *sql.DB, rootPath, publicURL, thumbnailCache string, srcSvc *sources.Service, fileSvc *files.Service) (*Service, error) {
	rootRel, err := security.NormalizeRelPath(rootPath)
	if err != nil || rootRel == "" {
		return nil, fmt.Errorf("image_bed.root_path 非法: %s", rootPath)
	}
	if thumbnailCache == "" {
		return nil, errors.New("缩略图缓存目录不能为空")
	}
	if err := os.MkdirAll(thumbnailCache, 0o755); err != nil {
		return nil, fmt.Errorf("创建缩略图缓存目录失败: %w", err)
	}
	return &Service{
		db: db, rootRel: rootRel, publicURL: strings.TrimRight(publicURL, "/"), thumbnailCache: thumbnailCache,
		sources: srcSvc, files: fileSvc, locks: fileSvc.Locks(), thumbnailLocks: locks.NewManager(),
		thumbnailSlot: make(chan struct{}, 1),
	}, nil
}

// --- 图床目标（README §17.3） ---

// Targets 返回用户当前图床目录可写且已启用图床的存储源。
func (s *Service) Targets(user *models.User) ([]*models.UserSourceView, error) {
	list, err := s.sources.ListForUser(user)
	if err != nil {
		return nil, err
	}
	out := []*models.UserSourceView{}
	for _, v := range list {
		if !v.ImageBedEnabled {
			continue
		}
		allowed, err := s.sources.CanWritePath(user, v.Key, s.userImageRelDir(user, time.Now().UTC()))
		if err != nil {
			return nil, err
		}
		if allowed {
			v.Permission = models.PermissionReadWrite
			out = append(out, v)
		}
	}
	return out, nil
}

// DefaultTarget 返回用户默认图床目标的不透明 key，可能为空。
func (s *Service) DefaultTarget(userID int64) (string, error) {
	var target sql.NullString
	err := s.db.QueryRow(`SELECT s.key FROM user_preferences p
  JOIN storage_sources s ON s.id = p.default_image_bed_storage_source_id WHERE p.user_id = ?`,
		userID).Scan(&target)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return target.String, nil
}

// SetDefaultTarget 设置用户默认图床目标。
func (s *Service) SetDefaultTarget(user *models.User, sourceKey string) error {
	src, err := s.checkTarget(user, sourceKey, s.userImageRelDir(user, time.Now().UTC()))
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO user_preferences (user_id, default_image_bed_storage_source_id, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET default_image_bed_storage_source_id = excluded.default_image_bed_storage_source_id,
    updated_at = excluded.updated_at`,
		user.ID, src.ID, time.Now().UTC())
	return err
}

// checkTarget 校验存储源可作为该用户的图床目标。
func (s *Service) checkTarget(user *models.User, sourceKey, relPath string) (*models.StorageSource, error) {
	src, err := s.sources.Get(sourceKey)
	if err != nil {
		return nil, ErrTargetInvalid
	}
	if src.IsDisabled || !src.ImageBedEnabled {
		return nil, ErrTargetInvalid
	}
	ok, err := s.sources.CanWritePath(user, sourceKey, relPath)
	if err != nil || !ok {
		return nil, ErrTargetInvalid
	}
	return src, nil
}

func (s *Service) userImageRelDir(user *models.User, now time.Time) string {
	return fmt.Sprintf("%s/users/%s/%04d/%02d", s.rootRel, user.UserPublicID, now.Year(), int(now.Month()))
}

// --- 上传 ---

// UploadForUser 登录用户上传图片。source key 为空时使用默认图床目标（README §17.3）。
func (s *Service) UploadForUser(user *models.User, sourceKey, originalFilename string, body io.Reader) (*models.Image, error) {
	if sourceKey == "" {
		var err error
		sourceKey, err = s.DefaultTarget(user.ID)
		if err != nil {
			return nil, err
		}
		if sourceKey == "" {
			return nil, ErrNoTarget
		}
	}
	now := time.Now().UTC()
	relDir := s.userImageRelDir(user, now)
	src, err := s.checkTarget(user, sourceKey, relDir)
	if err != nil {
		return nil, ErrTargetInvalid
	}
	return s.upload(src, relDir, originalFilename, models.ImageOwnerUser, &user.ID, body)
}

// AnonymousSettings 是匿名图床配置。
type AnonymousSettings struct {
	Enabled bool   `json:"enabled"`
	Key     string `json:"key"`
}

// GetAnonymousSettings 读取匿名图床配置（README §17.5，默认关闭）。
func (s *Service) GetAnonymousSettings() (*AnonymousSettings, error) {
	out := &AnonymousSettings{}
	rows, err := s.db.Query(`SELECT key, value FROM system_settings WHERE key IN (?, ?)`,
		SettingAnonymousEnabled, SettingAnonymousStorageSourceID)
	if err != nil {
		return nil, err
	}
	var storageSourceID int64
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			rows.Close()
			return nil, err
		}
		switch k {
		case SettingAnonymousEnabled:
			out.Enabled = v == "true"
		case SettingAnonymousStorageSourceID:
			if id, parseErr := strconv.ParseInt(v, 10, 64); parseErr == nil {
				storageSourceID = id
			}
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	// db.Open 采用单连接；必须在关闭 rows 后再查询存储源，避免连接自等待。
	if storageSourceID > 0 {
		if src, getErr := s.sources.GetByID(storageSourceID); getErr == nil {
			out.Key = src.Key
		}
	}
	return out, nil
}

// SetAnonymousSettings 更新匿名图床配置（仅超级管理员入口调用）。
func (s *Service) SetAnonymousSettings(enabled bool, sourceKey string) error {
	var storageSourceID int64
	if enabled {
		src, err := s.sources.Get(sourceKey)
		if err != nil {
			return ErrTargetInvalid
		}
		// 目标必须未禁用且开启图床（README §17.5）。
		if src.IsDisabled || !src.ImageBedEnabled {
			return ErrTargetInvalid
		}
		storageSourceID = src.ID
	}
	now := time.Now().UTC()
	set := func(k, v string) error {
		_, err := s.db.Exec(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, k, v, now)
		return err
	}
	enabledStr := "false"
	if enabled {
		enabledStr = "true"
	}
	if err := set(SettingAnonymousEnabled, enabledStr); err != nil {
		return err
	}
	return set(SettingAnonymousStorageSourceID, strconv.FormatInt(storageSourceID, 10))
}

// UploadAnonymous 匿名上传图片（README §17.5）。调用方负责限流。
func (s *Service) UploadAnonymous(originalFilename string, body io.Reader) (*models.Image, error) {
	settings, err := s.GetAnonymousSettings()
	if err != nil {
		return nil, err
	}
	if !settings.Enabled || settings.Key == "" {
		return nil, ErrAnonymousDisabled
	}
	src, err := s.sources.Get(settings.Key)
	if err != nil {
		return nil, ErrAnonymousDisabled
	}
	if src.IsDisabled || !src.ImageBedEnabled {
		return nil, ErrAnonymousDisabled
	}

	now := time.Now().UTC()
	relDir := fmt.Sprintf("%s/anonymous/%04d/%02d", s.rootRel, now.Year(), int(now.Month()))
	return s.upload(src, relDir, originalFilename, models.ImageOwnerAnonymous, nil, body)
}

// upload 是公共上传流程（README §17.7）：
// 临时文件 -> 真实格式校验 -> 以服务端识别结果决定扩展名 -> 原子重命名 -> 写 Images 表。
func (s *Service) upload(src *models.StorageSource, relDir, originalFilename, ownerType string, ownerUserID *int64, body io.Reader) (*models.Image, error) {
	relDir, err := security.NormalizeRelPath(relDir)
	if err != nil {
		return nil, err
	}
	quotaGuard, err := s.files.BeginQuotaWrite(src, "")
	if err != nil {
		return nil, err
	}
	defer quotaGuard.Close()

	// 排除规则检查（README §11.4 图床上传）。
	matcher, err := s.sources.Matcher(src.ID)
	if err != nil {
		return nil, err
	}
	if matcher.MatchPrefix(relDir) {
		return nil, files.ErrPathExcluded
	}

	absDir, err := security.ResolveInSource(src.RootPath, relDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		return nil, fmt.Errorf("创建图床目录失败: %w", err)
	}

	// 写临时文件（README §14.3 同目录临时文件）。
	tmpPath := filepath.Join(absDir, ".omnistore-upload-"+auth.NewRandomToken("", 8)+".tmp")
	tmp, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, fmt.Errorf("创建临时文件失败: %w", err)
	}
	reader := body
	maxBytes, limited := quotaGuard.MaxBytes()
	const maxInt64 = int64(^uint64(0) >> 1)
	if limited && maxBytes < maxInt64 {
		reader = io.LimitReader(body, maxBytes+1)
	}
	size, err := io.Copy(tmp, reader)
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmpPath)
		return nil, fmt.Errorf("写入失败: %w", err)
	}
	if limited && size > maxBytes {
		os.Remove(tmpPath)
		return nil, files.ErrQuotaExceeded
	}

	// 真实格式校验。
	info, err := ValidateImageFile(tmpPath)
	if err != nil {
		os.Remove(tmpPath)
		return nil, err
	}

	// image_id 与文件名使用不可预测随机数（README §17.9，128-bit）。
	// 先写数据库记录（唯一索引冲突时换随机数重试），再把临时文件改名到最终路径。
	for range 5 {
		random := auth.NewRandomToken("", 16)
		imageID := "img_" + random
		filename := random + "." + info.Ext
		relPath := relDir + "/" + filename
		publicURL := fmt.Sprintf("%s/i/%s.%s", s.publicURL, imageID, info.Ext)

		res, err := s.db.Exec(`INSERT INTO images
  (image_id, owner_type, owner_user_id, storage_source_id, relative_path, original_filename,
   public_url, size, mime_type, width, height, ext, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			imageID, ownerType, ownerUserID, src.ID, relPath, originalFilename,
			publicURL, size, info.MimeType, info.Width, info.Height, info.Ext, time.Now().UTC())
		if err != nil {
			if strings.Contains(err.Error(), "images.image_id") {
				continue // image_id 撞车，换随机数重试
			}
			os.Remove(tmpPath)
			return nil, fmt.Errorf("写入图片记录失败: %w", err)
		}
		rowID, _ := res.LastInsertId()

		unlock := s.locks.Lock(locks.Key(src.Key, relPath))
		absPath := filepath.Join(absDir, filename)
		if _, statErr := os.Lstat(absPath); statErr == nil {
			unlock()
			_, _ = s.db.Exec(`DELETE FROM images WHERE id = ?`, rowID)
			continue // 文件名撞车，重新生成
		}
		if err := os.Rename(tmpPath, absPath); err != nil {
			unlock()
			_, _ = s.db.Exec(`DELETE FROM images WHERE id = ?`, rowID)
			os.Remove(tmpPath)
			return nil, fmt.Errorf("落盘失败: %w", err)
		}
		unlock()
		return s.getByRowID(rowID)
	}
	os.Remove(tmpPath)
	return nil, fmt.Errorf("生成 image_id 失败")
}

// --- 查询 / 访问 ---

const imageColumns = `id, image_id, owner_type, owner_user_id, storage_source_id, relative_path,
  COALESCE(original_filename, ''), public_url, size, mime_type, width, height, ext, created_at`

func scanImage(row interface{ Scan(...any) error }) (*models.Image, error) {
	var m models.Image
	err := row.Scan(&m.ID, &m.ImageID, &m.OwnerType, &m.OwnerUserID, &m.StorageSourceID, &m.RelativePath,
		&m.OriginalFilename, &m.PublicURL, &m.Size, &m.MimeType, &m.Width, &m.Height, &m.Ext, &m.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Service) getByRowID(id int64) (*models.Image, error) {
	img, err := scanImage(s.db.QueryRow(`SELECT `+imageColumns+` FROM images WHERE id = ?`, id))
	return s.decorateImage(img, err)
}

// Get 按 image_id 查询图片记录。
func (s *Service) Get(imageID string) (*models.Image, error) {
	img, err := scanImage(s.db.QueryRow(`SELECT `+imageColumns+` FROM images WHERE image_id = ?`, imageID))
	return s.decorateImage(img, err)
}

func (s *Service) decorateImage(img *models.Image, err error) (*models.Image, error) {
	if err != nil {
		return nil, err
	}
	img.ThumbnailURL = fmt.Sprintf("%s/t/%s.jpg", s.publicURL, img.ImageID)
	return img, nil
}

// OpenImage 打开图片文件用于公开访问（README §17.8）。
// ext 必须与记录一致，存储源禁用时返回 ErrNotFound（README §17.13）。
func (s *Service) OpenImage(imageID, ext string) (*models.Image, *os.File, os.FileInfo, func(), error) {
	img, err := s.Get(imageID)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	if img.Ext != ext {
		return nil, nil, nil, nil, ErrNotFound
	}
	src, err := s.sources.GetByID(img.StorageSourceID)
	if err != nil || src.IsDisabled {
		return nil, nil, nil, nil, ErrNotFound
	}

	f, info, unlock, err := s.files.OpenForRead(src, img.RelativePath)
	if err != nil {
		return nil, nil, nil, nil, ErrNotFound
	}
	return img, f, info, unlock, nil
}

// ListForOwner 返回历史墙（按用户隔离，README §17.11）。
// ownerUserID 为 nil 时返回匿名图片（管理员入口）。
func (s *Service) ListForOwner(ownerUserID *int64, page, pageSize int) ([]*models.Image, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	where := `owner_type = 'anonymous'`
	args := []any{}
	if ownerUserID != nil {
		where = `owner_type = 'user' AND owner_user_id = ?`
		args = append(args, *ownerUserID)
	}

	var total int64
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM images WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `SELECT ` + imageColumns + ` FROM images WHERE ` + where + ` ORDER BY id DESC LIMIT ? OFFSET ?`
	rows, err := s.db.Query(query, append(args, pageSize, (page-1)*pageSize)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []*models.Image{}
	for rows.Next() {
		img, err := scanImage(rows)
		if err != nil {
			return nil, 0, err
		}
		img, err = s.decorateImage(img, nil)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, img)
	}
	return out, total, rows.Err()
}

// DeleteByUser 用户删除自己的图片（README §17.12）。
func (s *Service) DeleteByUser(user *models.User, imageID string) error {
	img, err := s.Get(imageID)
	if err != nil {
		return err
	}
	if img.OwnerType != models.ImageOwnerUser || img.OwnerUserID == nil || *img.OwnerUserID != user.ID {
		return ErrNotFound // 不暴露他人图片存在性
	}
	// 检查用户当前是否仍对该存储源有读写权限。
	src, err := s.sources.GetByID(img.StorageSourceID)
	if err != nil {
		return ErrTargetInvalid
	}
	ok, err := s.sources.CanWritePath(user, src.Key, img.RelativePath)
	if err != nil || !ok {
		return ErrTargetInvalid
	}
	return s.deletePhysicalAndRecord(img)
}

// DeleteByAdmin 管理员删除匿名图片（README §17.11）。
func (s *Service) DeleteByAdmin(imageID string) error {
	img, err := s.Get(imageID)
	if err != nil {
		return err
	}
	return s.deletePhysicalAndRecord(img)
}

func (s *Service) deletePhysicalAndRecord(img *models.Image) error {
	src, err := s.sources.GetByID(img.StorageSourceID)
	if err == nil && !src.IsDisabled {
		// files.Delete 同时清理 images 记录；物理文件不存在时按已删除处理（README §17.12）。
		if delErr := s.files.Delete(src, img.RelativePath); delErr != nil &&
			!errors.Is(delErr, files.ErrNotFound) && !errors.Is(delErr, files.ErrPathExcluded) {
			return delErr
		}
	}
	_, err = s.db.Exec(`DELETE FROM images WHERE id = ?`, img.ID)
	if err == nil {
		s.removeThumbnailFiles(img.ImageID)
	}
	return err
}
