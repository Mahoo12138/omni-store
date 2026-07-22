# OmniStore 开发指南

## 环境要求

- Go 1.25+
- Node.js 24+ / npm 11+

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
cd web && npm install && npm run build && cd ..

go build -o omnistore.exe ./cmd/omnistore
./omnistore.exe server
```

默认监听 `0.0.0.0:8080`，数据目录 `./data`（可用 `OMNISTORE_DATA_DIR` 覆盖）。

### 前端热更新开发

```bash
cd web
npm run dev
```

Vite dev server 将 `/api` 代理到 `http://localhost:8080`，需同时运行后端。

### 配置

复制 `config.example.yaml` 为 `config.yaml` 按需修改。
优先级：程序默认值 < YAML < 环境变量（`OMNISTORE_` 前缀）。

## 构建发布

```bash
docker compose build
```

或交叉编译 Linux 二进制：

```bash
cd web && npm run build && cd ..
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o omnistore ./cmd/omnistore
```

## 备份边界（生产）

必须备份：`config.yaml`、`$OMNISTORE_DATA_DIR/omnistore.db`、`$OMNISTORE_DATA_DIR/keys/`。
可不备份：`cache/`、`tmp/`。用户存储源文件由管理员自行备份。
