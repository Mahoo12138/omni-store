# 开发指南

## 1. 环境

- Go：以 `go.mod` 为准。
- Node.js：以 `.node-version` / CI 为准。
- pnpm：通过 Corepack。
- 前端：React + Vite。
- 数据库：SQLite。

## 2. 本地启动

```bash
corepack enable

cd web
pnpm install --frozen-lockfile
pnpm run build
cd ..

go build -o omnistore ./cmd/omnistore
./omnistore server
```

开发时也可以分别启动前端和后端；以仓库实际脚本为准。

## 3. 测试环境

仓库提供隔离测试/演示环境：

```bash
./scripts/test-env.sh run
```

使用 `config.test.yaml` 与 `.testdata/`，避免开发测试污染真实实例。

E2E 测试使用隔离种子环境，不依赖开发者已有数据状态。

## 4. 配置

优先级：

```text
defaults < YAML < environment
```

示例配置以根目录：

```text
config.example.yaml
```

为准。

Docker 中应明确挂载：

- `/data`：OmniStore 系统数据；
- `/mnt/sources/*`：真实 Storage Source。

## 5. 数据库迁移

规则：

1. 已发布 migration 不能重写。
2. 新结构使用新的 `vMAJOR.MINOR.PATCH.sql`。
3. 修改模型同时更新 `DATA_MODEL.md`。
4. migration 失败必须阻止继续以未知结构启动。

## 6. 前端开发

前端 UI 应优先复用：

```text
web/src/components/ui/*
```

避免在业务页重复实现 Button/Input/Dialog/Table/Toast 等基础组件。

状态管理优先：

- TanStack Query：服务端状态；
- 组件本地 state：短生命周期 UI 状态。

未经明确需求不引入新的全局状态库。

## 7. 文件功能开发

修改文件操作前先检查：

- `SECURITY.md`
- `features/private-drive.md`
- path lock；
- quota；
- file_records；
- recovery journal；
- WebDAV persistent locks。

不要只让 REST 路径“能工作”，同时破坏 WebDAV/S3/图床的一致性。

## 8. 测试最低要求

后端：

```bash
go test ./...
go test -race ./...
go vet ./...
```

前端：

```bash
cd web
pnpm test
pnpm run build
pnpm exec playwright test
```

发布前统一运行：

```bash
./scripts/verify-release.sh
```

Crash Recovery 独立验收：

```bash
OMNISTORE_CRASH_ROUNDS=10 ./scripts/verify-crash-recovery.sh
```

具体 RC 验收轮次由版本计划决定。

## 9. 文档

完成影响产品行为的改动时同时检查：

- API；
- Security；
- Data Model；
- feature spec；
- roadmap/design；
- Changelog。

如果代码和规划冲突，应更新规划，而不是让文档继续宣称未实现状态。
