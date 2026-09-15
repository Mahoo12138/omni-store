# 系统架构

本文档记录 OmniStore 当前长期有效的技术架构和关键约束。版本计划不在此维护。

## 1. 技术栈

### 后端

- Go
- 模块化单体
- SQLite
- `database/sql` + 原生 SQL + Repository
- `modernc.org/sqlite`（pure Go，便于无 CGO 单二进制）
- SemVer migration：`migrations/vMAJOR.MINOR.PATCH.sql`
- 前端静态产物通过 `go:embed` 嵌入

不引入：

- ORM 作为核心数据层
- Redis
- 外部数据库依赖
- 消息队列
- 微服务
- 分布式锁

### 前端

- React
- TanStack Router
- TanStack Query
- vanilla-extract
- Base UI
- Vite

项目维护自己的轻量 UI 组件层，颜色、间距、圆角、阴影、字体和交互状态统一由 Design Token 管理。

## 2. 部署模型

生产目标：

```text
Linux amd64
Linux arm64
```

推荐：

```text
Docker Compose
```

同时提供单二进制运行方式。

架构明确是：

```text
一个 OmniStore 进程
+ 一个 SQLite 数据库
+ 多个本地 Storage Source
```

不允许多个 OmniStore 实例同时管理同一物理目录。

## 3. Storage Source

核心模型：

```text
Storage Source = 本地真实目录
```

`storage_sources.id` 只用于内部数据库外键；外部 REST/WebDAV/S3 使用系统生成的不透明 `storage_key`。

用户界面优先展示名称，不要求用户理解 key。

Docker 中后台填写的是容器内路径，例如：

```text
/mnt/sources/photos
```

而不是宿主机路径。

## 4. 系统数据目录

推荐：

```text
/data
├── omnistore.db
├── keys/
├── trash/
├── cache/
├── tmp/
└── operations/
```

原则：

- 系统数据和用户真实存储源分离；
- 数据目录及敏感子目录收紧为 `0700`；
- SQLite 文件按 `0600` 管理；
- 拒绝把文件系统根、工作目录、用户 home 或 symlink 路径作为专用数据目录；
- 临时数据、缓存和 operation journal 的所有权必须明确。

## 5. 配置

优先级：

```text
程序默认值 < YAML < 环境变量
```

YAML 负责可读的持久配置，环境变量负责容器部署与敏感覆盖。

基础设施配置默认不依赖 Web UI 动态修改。

## 6. 数据原则

真实文件系统是内容事实源；SQLite 保存系统语义：

- 用户、Session；
- Token/Credential；
- Storage Source 配置；
- Policy；
- 文件台账；
- 分享；
- 图床记录；
- Multipart 状态；
- 回收站元数据；
- 审计；
- migration 状态。

`file_records` 是所有权、索引和校准视图，不取代真实文件系统。

## 7. 权限模型

访问流程：

```text
Authentication
    ↓
Source availability
    ↓
Policy / path permission
    ↓
Path normalization
    ↓
Reserved namespace
    ↓
Exclude rules
    ↓
Symlink / filesystem safety
    ↓
Persistent WebDAV lock
    ↓
Quota
    ↓
Filesystem operation
```

管理员具有系统管理能力，但文件入口仍应经过路径安全和数据生命周期规则。

## 8. 并发与锁

OmniStore 采用单实例锁模型。

包括：

- 存储源拓扑读写锁；
- 请求级路径锁；
- 祖先/后代范围冲突判断；
- 跨来源操作的来源锁；
- 持久 WebDAV LOCK/UNLOCK；
- quota 写入协调。

兄弟路径应尽量保持并发，冲突范围不得扩大到整个实例。

## 9. 写操作与 Crash Recovery

写入原则：

> 先记录足够恢复的操作意图，再执行会改变用户数据的不可逆步骤。

普通上传、覆盖、复制、移动、回收站、图床、Multipart 等关键操作都使用 operation journal/阶段状态。

恢复器在监听端口之前运行：

- 未提交操作回滚；
- 已数据库提交但清理未完成的操作继续完成；
- 摘要、状态或文件布局存在歧义时阻止启动并保留现场。

禁止依赖“文件名长得像临时文件”来判断内部所有权。

## 10. 缓存

缓存必须可重建。

缩略图等缓存：

- 不属于用户真实文件；
- 可根据原文件 size + mtime 等信息失效；
- 可被清理；
- 不作为备份恢复的必要组成。

## 11. 后端模块

建议职责边界：

```text
internal/auth
internal/backup
internal/db
internal/files
internal/http
internal/imagebed
internal/s3api
internal/security
internal/shares
internal/sources
internal/users
```

HTTP Handler 负责协议、参数、认证上下文和响应转换；业务一致性尽量位于 Service；Repository 只负责持久化。

## 12. 架构变更原则

任何可能改变下面假设的需求都必须先更新架构文档并单独讨论：

- Storage Source 不再是本地目录；
- 多实例同时写；
- SQLite 不再是唯一系统数据库；
- 文件不再直接存在真实目录；
- 写操作无法继续使用现有恢复模型。

当前长期产品 Non-goals 已明确不会引入这些变化。
