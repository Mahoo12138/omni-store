// Command testenv prepares deterministic local data for development, demos and E2E tests.
// It is intentionally separate from the production omnistore binary.
package main

import (
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/omni-store/omnistore/internal/auth"
	"github.com/omni-store/omnistore/internal/config"
	"github.com/omni-store/omnistore/internal/db"
	"github.com/omni-store/omnistore/internal/files"
	"github.com/omni-store/omnistore/internal/imagebed"
	"github.com/omni-store/omnistore/internal/locks"
	"github.com/omni-store/omnistore/internal/models"
	"github.com/omni-store/omnistore/internal/sources"
	"github.com/omni-store/omnistore/internal/users"
)

const (
	adminUsername = "admin"
	adminPassword = "OmniStore-Test-Admin!"
	demoUsername  = "demo"
	demoPassword  = "OmniStore-Test-Demo!"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "seed" {
		fmt.Fprintln(os.Stderr, "用法: go run ./cmd/testenv seed [--config config.test.yaml] [--fixtures ./.testdata/sources]")
		os.Exit(2)
	}
	fs := flag.NewFlagSet("seed", flag.ExitOnError)
	configFile := fs.String("config", "config.test.yaml", "测试环境配置文件")
	fixtureRoot := fs.String("fixtures", "./.testdata/sources", "测试存储源根目录")
	if err := fs.Parse(os.Args[2:]); err != nil {
		fatal(err)
	}
	if err := seed(*configFile, *fixtureRoot); err != nil {
		fatal(err)
	}
}

func seed(configFile, fixtureRoot string) error {
	cfg, err := config.Load(configFile)
	if err != nil {
		return err
	}
	fixtureRoot, err = filepath.Abs(fixtureRoot)
	if err != nil {
		return fmt.Errorf("解析测试存储目录失败: %w", err)
	}
	for _, dir := range []string{
		cfg.Data.Dir,
		filepath.Join(cfg.Data.Dir, "keys"),
		filepath.Join(cfg.Data.Dir, "cache"),
		filepath.Join(cfg.Data.Dir, "tmp"),
		fixtureRoot,
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	publicRoot := filepath.Join(fixtureRoot, "public-demo")
	teamRoot := filepath.Join(fixtureRoot, "team-files")
	if err := seedFixtureFiles(publicRoot, teamRoot); err != nil {
		return err
	}

	conn, err := db.Open(cfg.DatabasePath())
	if err != nil {
		return err
	}
	defer conn.Close()

	userService := users.NewService(conn)
	admin, err := ensureUser(userService, adminUsername, "测试管理员", adminPassword, models.RoleSuperAdmin)
	if err != nil {
		return err
	}
	demo, err := ensureUser(userService, demoUsername, "演示用户", demoPassword, models.RoleUser)
	if err != nil {
		return err
	}
	sessions := auth.NewSessions(conn, time.Duration(cfg.Security.SessionTTLHours)*time.Hour)
	_ = sessions.DeleteByUser(admin.ID)
	_ = sessions.DeleteByUser(demo.ID)

	sourceService := sources.NewService(conn, cfg.Data.Dir)
	if err := ensureSource(sourceService, "demo-public", "公开演示资料", "无需登录即可浏览的演示目录", publicRoot, true, "/demo", true); err != nil {
		return err
	}
	if err := ensureSource(sourceService, "team-files", "团队文件", "用于测试读写权限和文件操作", teamRoot, false, "", true); err != nil {
		return err
	}
	if err := sourceService.SetPermission(demo.ID, "demo-public", models.PermissionReadOnly); err != nil {
		return err
	}
	if err := sourceService.SetPermission(demo.ID, "team-files", models.PermissionReadWrite); err != nil {
		return err
	}

	fileService := files.NewService(conn, sourceService, locks.NewManager())
	imageService, err := imagebed.NewService(conn, cfg.ImageBed.RootPath, cfg.Server.PublicURL, sourceService, fileService)
	if err != nil {
		return err
	}
	if err := imageService.SetDefaultTarget(admin, "demo-public"); err != nil {
		return err
	}
	if err := imageService.SetDefaultTarget(demo, "team-files"); err != nil {
		return err
	}
	if err := imageService.SetAnonymousSettings(true, "demo-public"); err != nil {
		return err
	}

	fmt.Println("测试环境种子数据已就绪")
	fmt.Printf("地址: %s\n", cfg.Server.PublicURL)
	fmt.Printf("管理员: %s / %s\n", adminUsername, adminPassword)
	fmt.Printf("演示用户: %s / %s\n", demoUsername, demoPassword)
	fmt.Printf("数据目录: %s\n", cfg.Data.Dir)
	fmt.Printf("存储目录: %s\n", fixtureRoot)
	return nil
}

func ensureUser(service *users.Service, username, displayName, password, role string) (*models.User, error) {
	user, err := service.GetByUsername(username)
	if errors.Is(err, users.ErrNotFound) {
		return service.Create(username, displayName, password, role)
	}
	if err != nil {
		return nil, err
	}
	if user.Role != role {
		return nil, fmt.Errorf("测试用户 %s 已存在但角色不匹配", username)
	}
	if err := service.SetDisabled(user.ID, false); err != nil {
		return nil, err
	}
	if err := service.UpdateDisplayName(user.ID, displayName); err != nil {
		return nil, err
	}
	if err := service.UpdatePassword(user.ID, password); err != nil {
		return nil, err
	}
	return service.GetByID(user.ID)
}

func ensureSource(service *sources.Service, sourceID, name, description, root string, public bool, mountPath string, imageBed bool) error {
	source, err := service.Get(sourceID)
	if errors.Is(err, sources.ErrNotFound) {
		source, err = service.Create(sources.CreateInput{
			SourceID: sourceID, Name: name, Description: description, RootPath: root,
		})
	}
	if err != nil {
		return err
	}
	if filepath.Clean(source.RootPath) != filepath.Clean(root) {
		return fmt.Errorf("测试存储源 %s 已指向 %s；请清理 .testdata 后重试", sourceID, source.RootPath)
	}
	webdav := true
	input := sources.UpdateInput{
		Name:              &name,
		Description:       &description,
		PublicReadEnabled: &public,
		WebdavEnabled:     &webdav,
		ImageBedEnabled:   &imageBed,
	}
	if public || mountPath != "" {
		input.PublicMountPath = &mountPath
	}
	_, err = service.Update(sourceID, input)
	return err
}

func seedFixtureFiles(publicRoot, teamRoot string) error {
	for _, dir := range []string{publicRoot, filepath.Join(publicRoot, "guides"), teamRoot, filepath.Join(teamRoot, "projects")} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	fixtures := map[string][]byte{
		filepath.Join(publicRoot, "README.txt"):                   []byte("OmniStore public demo\n\nThis file is created by cmd/testenv.\n"),
		filepath.Join(publicRoot, "guides", "getting-started.md"): []byte("# Getting started\n\nUse this source to demonstrate public browsing and downloads.\n"),
		filepath.Join(teamRoot, "welcome.txt"):                    []byte("Welcome to the read-write team source.\n"),
		filepath.Join(teamRoot, "projects", "roadmap.md"):         []byte("# Demo roadmap\n\n- Upload a file\n- Rename it\n- Move it\n"),
	}
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		return err
	}
	fixtures[filepath.Join(publicRoot, "demo.png")] = png
	for filePath, data := range fixtures {
		if _, err := os.Stat(filePath); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := os.WriteFile(filePath, data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "错误:", err)
	os.Exit(1)
}
