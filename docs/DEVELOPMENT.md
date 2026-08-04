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

项目提供 `config.test.yaml`、幂等种子命令和独立的 `.testdata/` 数据目录。测试服务只监听 `127.0.0.1:18080`，不会读写默认 `./data` 或生产配置。

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
可不备份：`cache/`、`tmp/`。用户存储源文件由管理员自行备份。

V1.1 可在管理后台“配置导出”下载上述系统配置包。该文件包含敏感系统数据且不包含真实存储源文件，不能替代完整备份策略。
