package imagebed

import (
	"bytes"
	"errors"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/omni-store/omnistore/internal/capabilities"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

func TestUserAndAnonymousImageLifecycle(t *testing.T) {
	service, sourceService, source, user, otherUser, root := newImageLifecycleFixture(t)
	// 绑定图床能力后登录用户可直接上传，无需选择 Source。
	imageRecord, err := service.UploadForUser(user, "actual-image.txt", bytes.NewReader(testPNGBytes(t)))
	if err != nil {
		t.Fatal(err)
	}
	if imageRecord.OwnerType != models.ImageOwnerUser || imageRecord.OwnerUserID == nil || *imageRecord.OwnerUserID != user.ID ||
		imageRecord.Ext != "png" || imageRecord.MimeType != "image/png" || imageRecord.OriginalFilename != "actual-image.txt" ||
		!strings.HasSuffix(imageRecord.PublicURL, "/i/"+imageRecord.ImageID+".png") || imageRecord.ThumbnailURL == "" {
		t.Fatalf("unexpected uploaded image: %+v", imageRecord)
	}
	physicalPath := filepath.Join(root, filepath.FromSlash(imageRecord.RelativePath))
	if _, err := os.Stat(physicalPath); err != nil {
		t.Fatalf("uploaded file missing: %v", err)
	}

	opened, file, info, unlock, err := service.OpenImage(imageRecord.ImageID, "png")
	if err != nil || opened.ImageID != imageRecord.ImageID || info.Size() <= 0 {
		t.Fatalf("OpenImage() image=%+v info=%+v err=%v", opened, info, err)
	}
	header := make([]byte, 8)
	if _, err := io.ReadFull(file, header); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	unlock()
	if !bytes.Equal(header, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}) {
		t.Fatalf("unexpected image header: %x", header)
	}
	if _, _, _, _, err := service.OpenImage(imageRecord.ImageID, "jpg"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("wrong extension error=%v", err)
	}
	images, total, err := service.ListForOwner(&user.ID, 0, 0)
	if err != nil || total != 1 || len(images) != 1 || images[0].ImageID != imageRecord.ImageID {
		t.Fatalf("ListForOwner()=%+v total=%d err=%v", images, total, err)
	}
	if err := service.DeleteByUser(otherUser, imageRecord.ImageID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign delete error=%v", err)
	}
	if err := service.DeleteByUser(user, imageRecord.ImageID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(physicalPath); !os.IsNotExist(err) {
		t.Fatalf("deleted image remained on disk: %v", err)
	}
	if _, err := service.Get(imageRecord.ImageID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted image record error=%v", err)
	}

	if _, err := service.UploadAnonymous("disabled.png", bytes.NewReader(testPNGBytes(t))); !errors.Is(err, ErrAnonymousDisabled) {
		t.Fatalf("disabled anonymous upload error=%v", err)
	}
	if err := service.SetAnonymousSettings(true); err != nil {
		t.Fatal(err)
	}
	settings, err := service.GetAnonymousSettings()
	if err != nil || !settings.Enabled || settings.Key != source.Key {
		t.Fatalf("anonymous settings=%+v err=%v", settings, err)
	}
	anonymous, err := service.UploadAnonymous("anonymous.png", bytes.NewReader(testPNGBytes(t)))
	if err != nil || anonymous.OwnerType != models.ImageOwnerAnonymous || anonymous.OwnerUserID != nil {
		t.Fatalf("anonymous upload=%+v err=%v", anonymous, err)
	}
	anonymousImages, total, err := service.ListForOwner(nil, 1, 20)
	if err != nil || total != 1 || len(anonymousImages) != 1 || anonymousImages[0].ImageID != anonymous.ImageID {
		t.Fatalf("anonymous ListForOwner()=%+v total=%d err=%v", anonymousImages, total, err)
	}
	if err := service.DeleteByAdmin(anonymous.ImageID); err != nil {
		t.Fatal(err)
	}
	if err := service.SetAnonymousSettings(false); err != nil {
		t.Fatal(err)
	}
	settings, err = service.GetAnonymousSettings()
	if err != nil || settings.Enabled {
		t.Fatalf("disabled anonymous settings=%+v err=%v", settings, err)
	}

	// 禁用源后图床整体不可用。
	if err := sourceService.SetDisabled(source.Key, true); err != nil {
		t.Fatal(err)
	}
	if _, err := service.UploadForUser(user, "while-disabled.png", bytes.NewReader(testPNGBytes(t))); !errors.Is(err, ErrNoTarget) {
		t.Fatalf("disabled source upload error=%v, want ErrNoTarget", err)
	}
}

func TestImageUploadRejectsReservedTargetPath(t *testing.T) {
	service, _, source, user, _, _ := newImageLifecycleFixture(t)
	_, err := service.upload(
		source,
		"images/.omnistore-upload-0123456789abcdef.tmp/nested",
		"image.png",
		models.ImageOwnerUser,
		&user.ID,
		bytes.NewReader(testPNGBytes(t)),
	)
	if !errors.Is(err, files.ErrInvalid) {
		t.Fatalf("reserved image target error=%v, want ErrInvalid", err)
	}
}

func newImageLifecycleFixture(t *testing.T) (*Service, *sources.Service, *models.StorageSource, *models.User, *models.User, string) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	conn, err := db.Open(filepath.Join(dataDir, "omnistore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	userService := users.NewService(conn)
	user, err := userService.Create("image-user", "Image User", "test-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	otherUser, err := userService.Create("other-user", "Other User", "test-password", models.RoleUser)
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(base, "source")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	sourceService := sources.NewService(conn, dataDir)
	source, err := sourceService.Create(sources.CreateInput{Name: "Images", RootPath: root})
	if err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	capabilityService := capabilities.NewService(conn, sourceService)
	enabled := true
	if _, err := capabilityService.UpdateBinding(capabilities.CapabilityImageBed, capabilities.UpdateInput{
		Enabled: &enabled, StorageSourceKey: &source.Key,
	}); err != nil {
		t.Fatal(err)
	}
	service, err := NewService(conn, "https://store.example.test/", filepath.Join(dataDir, "cache", "thumbnails"), sourceService, capabilityService, fileService)
	if err != nil {
		t.Fatal(err)
	}
	return service, sourceService, source, user, otherUser, root
}

func testPNGBytes(t *testing.T) []byte {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, testImage(2, 2)); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}
