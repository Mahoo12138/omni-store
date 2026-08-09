# 1.0.0 发布流程

本文档是发布操作者的执行手册。当前源码版本保持 `1.0.0-dev`；候选版和稳定版由 Git 标签与构建时 `ldflags` 注入，不在候选阶段反复改写源码常量。

## 发布事实与不可变边界

1. 候选标签使用 `v1.0.0-rc.N`，稳定标签使用 `v1.0.0`。
2. `migrations/v1.0.0.sql` 已在 RC 前永久冻结。后续数据库变化必须进入下一目标版本的新迁移。
3. Git 标签、GitHub Release、二进制 `omnistore version` 和容器 OCI 标签中的版本必须一致。
4. RC 创建为 GitHub Prerelease，不更新容器 `latest`；只有不带预发布标识的稳定 SemVer 标签可以更新 `latest`。
5. 已发布标签不得移动或覆盖。发布后发现问题应停止推广并发布新的 RC 或 PATCH。

## 冻结前清单

- [ ] [路线图](ROADMAP.md) 的 `1.0.0 / V1`、`V2` 全部完成。
- [ ] [1.0.0 验收清单](ACCEPTANCE.md) 已在干净测试环境执行并记录结果。
- [ ] [Changelog](../CHANGELOG.md) 与实际用户可见能力一致。
- [ ] README、示例配置、API 和安全文档与候选行为一致。
- [x] 根目录 `LICENSE` 使用 MIT License，发布归档必须包含该文件。
- [ ] 工作区干净，候选提交已推送到 `main`，远端 CI 通过。
- [ ] 生产备份边界、反向代理 HTTPS、`cookie_secure`、`public_url` 和 master key 保管方式已人工复核。

## 本地候选检查

使用项目要求的 Go、Node 和 pnpm 版本，并确保 Docker 可用以验证 Compose：

```bash
OMNISTORE_RELEASE_VERSION=1.0.0-rc.1 ./scripts/verify-release.sh
```

脚本会检查：

1. SemVer、干净工作区和迁移命名。
2. Go 格式、vet、禁用缓存的全量测试与不低于 52% 的语句覆盖率门禁。
3. 全仓 `go test -race` 竞态检测。
4. 前端单元测试、生产构建和浏览器 E2E。
5. 带版本/提交/构建时间的嵌入式前端二进制。
6. Linux amd64、arm64 静态交叉编译。
7. Docker Compose 配置和 Git diff 空白错误。

GitHub 的 `Unified release gate` Job 调用同一脚本；Docker 镜像、二进制归档和 GitHub Release
全部硬依赖该 Job。`scripts/release-check.sh` 仅保留为兼容包装器，不包含独立检查逻辑。

开发中排查脚本本身时可临时设置 `OMNISTORE_ALLOW_DIRTY=1`；这不允许用于正式候选签发。

## 创建 RC

确认 Changelog 和候选提交后创建 annotated tag：

```bash
git tag -a v1.0.0-rc.1 -m "OmniStore 1.0.0-rc.1"
OMNISTORE_RELEASE_VERSION=1.0.0-rc.1 OMNISTORE_REQUIRE_TAG=1 ./scripts/verify-release.sh
git push origin v1.0.0-rc.1
```

标签流水线应产出：

- GHCR 的 SemVer/commit 镜像标签，不更新 `latest`。
- Linux amd64、arm64 压缩包。
- `checksums.txt`。
- 标记为 Prerelease 的 GitHub Release。

## RC 验收

必须从发布产物而不是本地源码完成以下验证：

1. 在全新空数据目录启动 amd64 或 arm64 二进制，使用启动日志或
   `OMNISTORE_BOOTSTRAP_TOKEN` 提供的一次性凭据完成管理员初始化。
2. 使用 Compose 启动镜像，确认健康检查、数据卷权限和重启后数据保留。
3. 访问 `/api/v1/health` 并执行 `omnistore version`，确认版本、commit、build time。
4. 覆盖登录、上传/下载、权限、分享、回收站、搜索、WebDAV、图床和显式启用的 S3 冒烟流程。
5. 复制一份由冻结基线创建的数据库并重复启动，确认 `schema_migrations.applied_at` 不变且 `v1.0.0` 不会重放。冻结前开发数据库不作为稳定版升级输入。
6. 下载发布压缩包并按 `checksums.txt` 验证 SHA-256。

验收发现问题时修复到新提交并创建下一个 `rc.N`，不要移动已有 RC 标签。

## 发布稳定版

RC 通过后，把 Changelog 的 `Unreleased` 改为带日期的 `1.0.0`，提交并再次执行完整检查：

```bash
OMNISTORE_RELEASE_VERSION=1.0.0 ./scripts/verify-release.sh
git tag -a v1.0.0 -m "OmniStore 1.0.0"
OMNISTORE_RELEASE_VERSION=1.0.0 OMNISTORE_REQUIRE_TAG=1 ./scripts/verify-release.sh
git push origin main
git push origin v1.0.0
```

稳定流水线完成后确认 GitHub Release 非 Prerelease、压缩包和校验和齐全、GHCR `1.0.0` 与 `latest` 指向同一 digest。`migrations/v1.0.0.sql` 继续保持冻结。

## 发布后

1. 用独立目录拉取稳定镜像并完成一次冷启动冒烟。
2. 检查 Release 页面、README 和镜像拉取命令。
3. 保留候选验收记录、SHA-256 和镜像 digest。
4. 开始后续开发前先确定下一目标 SemVer；任何 schema 变化创建新的版本迁移。
