# OmniStore 开发指南

## 环境要求

- Go 1.25+
- Node.js 24+ / Corepack + pnpm 10+

## 目录结构

```text
cmd/omnistore/       程序入口（server 子命令，后续增加 admin 子命令）
internal/config/     配置加载：默认值 + YAML + 环境变量
internal/db/         SQLite 初始化、迁移、连接管理
internal/http/       路由注册、中间件、统一响应、错误处理
internal/models/     数据结构定义
migrations/          SQLite schema 迁移（go:embed 打包）
web/                 React 前端项目（构建产物 go:embed 嵌入）
```

## 语义化版本与数据库迁移

OmniStore 遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)：

- `MAJOR`：包含不向后兼容的 API、配置或数据行为变更。
- `MINOR`：以向后兼容方式增加功能。
- `PATCH`：向后兼容的问题修复。
- 开发版本使用预发布标识，例如 `1.0.0-dev`；稳定发布使用 Git 标签 `vMAJOR.MINOR.PATCH`。

当前开发版本为 `1.0.0-dev`，首个稳定版本 `1.0.0` **尚未发布**。

SQL 迁移文件与稳定版本一一对应，命名为 `migrations/vMAJOR.MINOR.PATCH.sql`，`schema_migrations.version` 保存不含 `.sql` 的完整版本号。迁移器会按照 SemVer 数值顺序执行文件，例如 `v1.2.0` 必须早于 `v1.10.0`。

迁移维护规则：

1. 目标版本发布前，将该版本的所有结构变更持续合并到同一个 SQL 文件；当前全部初始结构均在 `migrations/v1.0.0.sql`。
2. 版本一经发布并创建 Git 标签，对应 SQL 文件即永久冻结，不得修改、重命名或删除。
3. 发布后的数据库变更必须为下一个目标版本新建 SQL 文件，且只包含相对上一稳定版本的增量操作。
4. SQL 文件名只使用稳定版本号，不使用 `-dev`、`-rc` 等预发布标识；预发布阶段仍维护目标稳定版本对应的文件。
5. 开发分支合并前必须用全新数据库运行 `go test ./...`，同时验证已有数据库可以重复启动且不会重复执行迁移。

迁移器会把旧开发数据库中的 `0001_init` 与 `0002_public_mount_redirects` 记录合并为 `v1.0.0`，仅用于兼容首个稳定版本发布前的本地数据；此后不再使用无版本归属的迁移文件名。
由于 `v1.0.0` 尚未发布，其初始建表和索引语句必须保持幂等；迁移器会为已记录 `v1.0.0` 的开发数据库安全重放该文件，使新合并的表和索引无需删除本地数据库即可生效。
开发期旧库若仍使用用户自定义的存储源标识，迁移器会在重放基线前保留数据并重建关联表：存储源改用内部数字主键，同时生成 `src-` 加 16 位小写十六进制随机 key。key 仅用于 Web/REST 路由及 WebDAV、S3 协议适配，常规界面以存储源名称为准。

## 本地开发

### 后端

```bash
# 首次需要先构建前端产物（go:embed 依赖 web/dist 存在）
corepack enable
cd web && pnpm install && pnpm run build && cd ..

go build -o omnistore.exe ./cmd/omnistore
./omnistore.exe server
```

默认监听 `0.0.0.0:8080`，数据目录 `./data`（可用 `OMNISTORE_DATA_DIR` 覆盖）。

### 前端热更新开发

```bash
cd web
pnpm run dev
```

Vite dev server 将 `/api`、`/raw`、`/i` 与 `/dav` 代理到 `http://localhost:8080`，需同时运行后端。可通过 `VITE_API_PROXY_TARGET` 改写代理目标。

## 隔离测试与演示环境

项目提供 `config.test.yaml`、幂等种子命令和独立的 `.testdata/` 数据目录。Web 测试服务监听 `127.0.0.1:18080`，S3 测试服务监听 `127.0.0.1:18081`，不会读写默认 `./data` 或生产配置。

准备演示用户、两个存储源及示例文件：

```bash
./scripts/test-env.sh seed
```

启动包含种子数据的后端：

```bash
./scripts/test-env.sh run
```

需要前端热更新时另开终端：

```bash
cd web
pnpm run dev:test
```

固定测试账号仅用于本机隔离环境：

```text
管理员：admin / OmniStore-Test-Admin!
演示用户：demo / OmniStore-Test-Demo!
```

每次执行 `seed` 都会恢复上述显示名、密码、启用状态、权限和功能开关，并保留用户在演示存储源中新建的其他文件。`.testdata/` 已加入 `.gitignore`，需要完全重置时应先停止测试服务，再手动删除该目录。

测试环境会为 `demo` 用户轮换一组 S3 凭据并写入 `.testdata/s3-credentials.txt`（权限 `0600`）。可以用 AWS CLI 验证基础对象操作：

```bash
set -a
source .testdata/s3-credentials.txt
set +a
AWS_ACCESS_KEY_ID="$access_key_id" AWS_SECRET_ACCESS_KEY="$secret_access_key" \
  aws --endpoint-url "$endpoint" --region "$region" --no-verify-ssl \
  s3api list-objects-v2 --bucket "$team_bucket"
```

验证 Multipart 时可生成一个超过 AWS CLI 默认 Multipart 阈值的文件；测试配置允许最大 64 MiB：

```bash
dd if=/dev/zero of=.testdata/multipart-demo.bin bs=1m count=10
AWS_ACCESS_KEY_ID="$access_key_id" AWS_SECRET_ACCESS_KEY="$secret_access_key" \
  aws --endpoint-url "$endpoint" --region "$region" --no-verify-ssl \
  s3 cp .testdata/multipart-demo.bin "s3://$team_bucket/multipart-demo.bin"
```

完成后对象位于 `.testdata/sources/team-files/multipart-demo.bin`；未完成的分片位于
`.testdata/data/tmp/multipart/`，可用于观察 Abort、重试和 24 小时 GC 行为。

生产环境通过 `server.s3_enabled: true` 或 `OMNISTORE_S3_ENABLED=true` 显式启用；可用
`OMNISTORE_S3_ADDR` 修改专用监听地址。`OMNISTORE_MASTER_KEY` 必须解码为 32 字节，建议使用
`openssl rand -base64 32` 生成。如果未提供，系统首次创建 S3 凭据时会生成
`data.dir/keys/s3-master.key`；该文件丢失后现有 Secret 无法恢复，必须与数据库一起备份。

### E2E

首次运行先安装 Chromium：

```bash
cd web
pnpm exec playwright install chromium
```

随后执行：

```bash
pnpm run test:e2e
```

Playwright 默认调用 `scripts/test-env.sh run` 启动并复用 `http://127.0.0.1:18080`，验证公开演示目录、管理员登录和配置包下载。若测试服务已由外部环境管理，可设置 `OMNISTORE_E2E_BASE_URL` 跳过内置启动流程。

### 配置

复制 `config.example.yaml` 为 `config.yaml` 按需修改。
优先级：程序默认值 < YAML < 环境变量（`OMNISTORE_` 前缀）。

## 构建发布

```bash
docker compose build
```

或交叉编译 Linux 二进制：

```bash
cd web && pnpm run build && cd ..
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o omnistore ./cmd/omnistore
```

## 备份边界（生产）

必须备份：`config.yaml`、`$OMNISTORE_DATA_DIR/omnistore.db`、`$OMNISTORE_DATA_DIR/keys/`。
可不备份：`cache/`、`tmp/`。其中 `cache/thumbnails/` 是可按需重建的图床缩略图缓存，服务启动时及每天清理超过 30 天未访问的文件。用户存储源文件由管理员自行备份。

V1.1 可在管理后台“配置导出”下载上述系统配置包。该文件包含敏感系统数据且不包含真实存储源文件，不能替代完整备份策略。
