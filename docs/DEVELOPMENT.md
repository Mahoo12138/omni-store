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

路线图中的 `V1`、`V2` 是 `1.0.0` 的内部开发阶段，不参与 SemVer 版本编号；两阶段范围全部完成并通过验收后，才允许创建 `v1.0.0` 标签。历史提交中出现的 `V1.1`、`V1.2` 仅表示 V1 阶段内的实施批次，不代表将发布 `1.1.0` 或 `1.2.0`。

SQL 迁移文件与稳定版本一一对应，命名为 `migrations/vMAJOR.MINOR.PATCH.sql`，`schema_migrations.version` 保存不含 `.sql` 的完整版本号。迁移器会按照 SemVer 数值顺序执行文件，例如 `v1.2.0` 必须早于 `v1.10.0`。

迁移维护规则：

1. 目标版本进入 RC 冻结前，将该版本的所有结构变更持续合并到同一个 SQL 文件；`v1.0.0` 的初始结构位于 `migrations/v1.0.0.sql`。
2. 版本进入 RC 冻结或创建 Git 标签后，对应 SQL 文件即永久冻结，不得修改、重命名或删除；`v1.0.0.sql` 当前已经冻结。
3. 发布后的数据库变更必须为下一个目标版本新建 SQL 文件，且只包含相对上一稳定版本的增量操作。
4. SQL 文件名只使用稳定版本号，不使用 `-dev`、`-rc` 等预发布标识；预发布阶段仍维护目标稳定版本对应的文件。
5. 开发分支合并前必须用全新数据库运行 `go test ./...`，同时验证已有数据库可以重复启动且不会重复执行迁移。

迁移器只执行 `schema_migrations` 中尚未记录的版本。已应用版本不会因为 SQL 文件内容变化、表缺失或重复启动而重放；任何结构变化都必须新增更高 SemVer 的迁移文件。

冻结前的开发数据库不属于稳定版升级输入，不再执行 `0001_init`、旧存储源标识或逐用户权限表的兼容修正。需要保留数据时先导出真实存储文件；开发用 SQLite 应删除后按冻结基线重新创建，隔离测试环境可重新执行 `./scripts/test-env.sh seed`。

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

网页登录失败限流默认开启，配置位于 `security.login_rate_limit`；环境变量分别为 `OMNISTORE_LOGIN_RATE_LIMIT_ENABLED`、`OMNISTORE_LOGIN_RATE_LIMIT_WINDOW_MINUTES`、`OMNISTORE_LOGIN_RATE_LIMIT_MAX_FAILURES_PER_IP` 和 `OMNISTORE_LOGIN_RATE_LIMIT_MAX_FAILURES_PER_USERNAME`。限流状态仅在当前进程内存中维护，修改配置需要重启服务。

CSRF Token 以 Session 为生命周期：登录创建 Session 时返回，刷新后的 `GET /api/v1/auth/me` 必须恢复相同 Token，不能在 GET 中轮换 CSRF 哈希。新增或修改认证逻辑时，应保留重复恢复、多标签页使用旧 Token 和不同 Session 隔离的回归测试。

### 前端热更新开发

```bash
cd web
pnpm run dev
```

Vite dev server 将 `/api`、`/raw`、`/i` 与 `/dav` 代理到 `http://localhost:8080`，需同时运行后端。可通过 `VITE_API_PROXY_TARGET` 改写代理目标。

### 前端构建与分包规范

前端生产构建以真实功能边界拆分代码，不通过调高 Vite 告警阈值掩盖单包过大问题：

1. 路由页面必须使用 TanStack Router 的 `lazyRouteComponent` 动态导入，避免登录页、文件管理、上传、系统设置等互不相关页面进入首屏主包。
2. 第三方库提供稳定子路径导出时优先按组件导入，例如 Base UI 使用 `@base-ui-components/react/dialog`，避免仅使用少量组件却扫描或打包整个入口模块。
3. 不要为了消除告警机械配置 `manualChunks`。只有在依赖具有明确、稳定的运行时边界并且路由级拆分仍不足时，才增加手工分包；共享依赖应继续交由 Rollup 复用。
4. 每次修改依赖、路由或构建配置后必须运行 `pnpm run build`。构建不得出现单个压缩前 JavaScript chunk 超过 500 kB 的 Vite 告警。
5. 进行体积优化时应记录优化前后的最大 chunk、gzip 体积和 transformed modules，确保只是改变加载边界而不是隐藏告警。
6. 构建通过后至少覆盖公开页面、登录、私有文件管理和管理员设置的 E2E 或浏览器冒烟验证，防止动态导入路径在生产构建中失效。

当前参考基线（2026-08-09，含搜索与分享页面）为最大 JavaScript chunk `319.10 kB`、gzip 后 `100.71 kB`，由原先的 `609.87 kB`、gzip 后 `189.88 kB` 降低而来。搜索、分享管理和公开分享均按路由懒加载；该数值用于识别回退，不代替按功能评估加载性能。

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

每次执行 `seed` 都会恢复上述显示名、密码、启用状态、权限和功能开关，并保留用户在演示存储源中新建的其他文件。“公开演示资料”设为 32 MiB 硬配额，“团队文件”设为 128 MiB 硬配额，用于界面演示与写入链路 E2E；重复 seed 不会删除已有文件，因此实时已用空间可能增长。演示用户对“团队文件”默认可读写，其中 `projects` 子目录通过最长前缀规则覆盖为只读，可用于验证当前目录权限。`.testdata/` 已加入 `.gitignore`，需要完全重置时应先停止测试服务，再手动删除该目录。

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

全新空数据库还需要一次性初始化凭据。可在启动前设置 `OMNISTORE_BOOTSTRAP_TOKEN`；未设置时从
服务首次启动日志读取自动生成的 `setup-...` 凭据，并在 `/setup` 页面提交。管理员创建成功后该
接口永久关闭。初始化的“空用户表判断 + 插入”由单条原子 SQL 完成，并发请求只会创建一个管理员。

### 单元测试

提交前先运行后端和前端单元测试；需要查看后端语句覆盖率时生成临时 profile：

```bash
go test -count=1 -coverprofile=/tmp/omnistore-cover.out ./...
go tool cover -func=/tmp/omnistore-cover.out
go test -race -count=1 ./...
cd web && pnpm test
```

发布检查默认要求全仓 Go 语句覆盖率不低于 52%，并要求全仓竞态检测通过，防止新增功能只扩大未测试代码面。维护者可以通过 `OMNISTORE_MIN_GO_COVERAGE` 提高门槛，但正式发布不得通过降低该值规避失败。本地与 GitHub 发布流水线统一执行 `scripts/verify-release.sh`。

已有目录创建测试必须同时覆盖服务层和 HTTP 编排：预检后新增文件仍应触发非空确认，`import_existing=false` 不得留下来源；确认导入必须返回校准摘要并立即生成 `unowned` 台账；可用 SQLite `BEFORE INSERT ON file_records` 失败触发器验证来源、排除规则和初始台账会整体回滚且不改动真实文件。并发用例至少 20 路同时导入同一目录，最终只能成功一个，且 `.omnistore-write-test-*` 不得进入台账。

回收站操作日志位于 `$OMNISTORE_DATA_DIR/trash/.operations/`。测试崩溃恢复时应构造“日志已写、文件系统未变”“目标复制完成、源仅删除一部分”“文件系统已变、事务未提交”“事务已提交、日志未清理”状态，并分别覆盖移入、恢复和永久清理。不要手工删除损坏日志后直接启动；先保留数据目录副本并核对 SQLite、源路径与 `trash/{trash_key}/payload`，恢复器会对无法无损判断的状态拒绝启动。

跨来源移动日志位于 `$OMNISTORE_DATA_DIR/operations/transfers/`。回归测试必须覆盖：意图阶段的部分目标清理、`target-ready` 后 SQLite 已提交但 `database-ready` 尚未写入的反向迁移、`database-ready` 后源目录只删除一部分的继续完成、成功路径无日志残留，以及损坏日志/提交前源缺失/提交后目标缺失阻止恢复。所有权断言不可只检查文件存在，还要验证 `file_records.owner_type`、`owner_user_id`、图床和分享定位；重复状态机测试建议至少运行 20 次。

请求级路径锁测试必须先确认竞争 goroutine 已进入等待队列，再断言祖先/后代阻塞，不能用“goroutine 可能尚未调度”的短超时制造假阳性。至少覆盖父写锁阻塞子写锁、子读锁阻塞父写锁、等待中的父写锁阻止后来子读锁插队、兄弟路径并发、路径段边界和不同存储源隔离，并在 `-race -count=10` 下运行。

图床上传日志位于 `$OMNISTORE_DATA_DIR/operations/image-uploads/`。恢复测试必须覆盖只有临时文件、只有最终文件、图片与台账已经提交但日志未清理、图片提交后又被移动、临时与最终文件同时存在、损坏日志，以及 `BEFORE INSERT ON file_records` 触发失败后的双表/文件整体回滚。并发用例至少 20 路，结束后应断言 `images`、用户 `file_records` 与真实普通文件数量完全一致且操作目录为空；恢复状态建议重复执行 20 次并结合 race 检测。

普通上传日志位于 `$OMNISTORE_DATA_DIR/operations/file-uploads/`，覆盖旧目标时另有同目录 `.omnistore-upload-{24位十六进制}.backup`。故障注入必须覆盖：新建意图仅有临时文件、临时文件已改名但台账未提交、覆盖意图尚未备份、旧目标已备份但新目标未安装、新目标与旧备份同时存在、台账已提交但阶段标记未写、`database-ready` 后目标又被合法移动或删除，以及损坏日志和临时/最终并存的歧义状态。`BEFORE INSERT ON file_records` 失败时应断言新建目标被删除、覆盖目标恢复旧内容且操作目录为空；至少 20 路 REST/WebDAV/S3 共用核心上传并发后，不得残留日志或内部备份，用户台账数量必须与真实最终文件一致。

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

Playwright 默认调用 `scripts/test-env.sh run` 启动并复用 `http://127.0.0.1:18080`，覆盖未登录保护与登录退出、改密/多会话失效/管理员凭据撤销、公开目录浏览与筛选、目录级权限、上传与搜索、新建/重命名/复制/移动、回收恢复与永久清理、图床上传/公开访问/删除、密码分享以及管理员配置包下载。新增会修改数据的用例必须使用唯一名称，并在成功路径末尾清理夹具。若测试服务已由外部环境管理，可设置 `OMNISTORE_E2E_BASE_URL` 跳过内置启动流程。

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
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o omnistore ./cmd/omnistore
```

冻结候选、创建 RC/稳定标签和验收发布产物时，必须遵循[发布流程](RELEASING.md)。不要直接用未注入版本元数据的普通 `go build` 产物作为正式发布包。

## 备份边界（生产）

必须备份：`config.yaml`、`$OMNISTORE_DATA_DIR/omnistore.db`、`$OMNISTORE_DATA_DIR/keys/`。
可不备份：`cache/`、`tmp/`。其中 `cache/thumbnails/` 是可按需重建的图床缩略图缓存，服务启动时及每天清理超过 30 天未访问的文件。用户存储源文件由管理员自行备份。

1.0.0 / V1 可在管理后台“配置导出”下载系统配置包。该文件包含敏感系统数据，但不包含真实存储源文件和回收站载荷，不能替代完整备份策略。其 SQLite 副本会清除登录/分享访问 Session、WebDAV 锁、未完成 Multipart 状态和回收站元数据，再做压缩与外键检查；在线数据库不会被修改。恢复该包后需要重新登录并重新解锁密码分享，长期凭据仍然有效。
