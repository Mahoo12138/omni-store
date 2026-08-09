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

	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

func TestUserAndAnonymousImageLifecycle(t *testing.T) {
	service, sourceService, source, user, otherUser, root := newImageLifecycleFixture(t)
	if _, err := service.UploadForUser(user, "", "before-default.png", bytes.NewReader(testPNGBytes(t))); !errors.Is(err, ErrNoTarget) {
		t.Fatalf("upload without default error=%v", err)
	}
	targets, err := service.Targets(user)
	if err != nil || len(targets) != 1 || targets[0].Key != source.Key || targets[0].Permission != models.PermissionReadWrite {
		t.Fatalf("Targets()=%+v, %v", targets, err)
	}
	if target, err := service.DefaultTarget(user.ID); err != nil || target != "" {
		t.Fatalf("initial DefaultTarget()=%q, %v", target, err)
	}
	if err := service.SetDefaultTarget(user, source.Key); err != nil {
		t.Fatal(err)
	}
	if target, err := service.DefaultTarget(user.ID); err != nil || target != source.Key {
		t.Fatalf("DefaultTarget()=%q, %v", target, err)
	}

	imageRecord, err := service.UploadForUser(user, "", "actual-image.txt", bytes.NewReader(testPNGBytes(t)))
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
	if err := service.SetAnonymousSettings(true, source.Key); err != nil {
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
	if err := service.SetAnonymousSettings(false, ""); err != nil {
		t.Fatal(err)
	}
	settings, err = service.GetAnonymousSettings()
	if err != nil || settings.Enabled || settings.Key != "" {
		t.Fatalf("disabled anonymous settings=%+v err=%v", settings, err)
	}

	if err := sourceService.SetDisabled(source.Key, true); err != nil {
		t.Fatal(err)
	}
	if err := service.SetDefaultTarget(user, source.Key); !errors.Is(err, ErrTargetInvalid) {
		t.Fatalf("disabled target error=%v", err)
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
	enabled := true
	source, err = sourceService.Update(source.Key, sources.UpdateInput{ImageBedEnabled: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sourceService.CreatePolicy(sources.PolicyInput{
		Name: "Image writers", UserIDs: []int64{user.ID},
		Sources: []sources.PolicySourceInput{{SourceKey: source.Key, Permission: models.PermissionReadWrite}},
	}); err != nil {
		t.Fatal(err)
	}
	fileService := files.NewService(conn, sourceService, locks.NewManager())
	service, err := NewService(conn, "/images", "https://store.example.test/", filepath.Join(dataDir, "cache", "thumbnails"), sourceService, fileService)
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
