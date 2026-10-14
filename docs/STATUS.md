# 当前项目状态

## 已发布

```text
1.1.0 — File Experience
```

已经完成：

- Upload Task Manager；
- 文件夹上传；
- 相对路径上传；
- 多文件任务；
- 冲突策略；
- 批量移动/复制/删除/下载/分享；
- 外部拖拽上传；
- 内部拖拽移动；
- 最近文件；
- 收藏；
- 文件管理器移动端优化。

## 当前 main 已完成但不再单独规划为 1.2 发布目标

Preview & Sharing 已基本落地：

- 统一 Preview Resolver；
- Image / Text / Markdown / JSON / YAML / Code；
- PDF；
- Audio / Video + Range；
- unsupported -> download；
- 文件管理器预览；
- Share 文件预览；
- 目录 List / Gallery；
- 流式 ZIP；
- 二维码；
- 410 expired/exhausted 状态；
- Instance Branding。

这些功能是 2.0 基线，Agent 不得回退。

## 当前目标

```text
2.0.0
```

2.0 是允许破坏性调整的架构与产品整合版本。

核心目标：

1. Capability Scope 重构。
2. Site Capability 全局单一 Source。
3. Source Protocol 独立开关。
4. 完整 Transfer Center。
5. Operation Center。
6. Backup & Recovery。
7. Compatibility Matrix。
8. 删除旧多公开挂载和用户图床 Source 选择等历史模型。

## 版本兼容

已发布 migration：

```text
v1.0.0.sql
v1.1.0.sql
v1.1.1.sql
```

全部冻结。

2.0 必须新增：

```text
v2.0.0.sql
```

不能修改历史 migration。

## 本次文档修订基线（2026-09-29）

核对 main 为 `af9a3859bedcd7736ced38ecb8da285a11e595c8`，提交日期 2026-09-28。该提交文档描述已有 relative_path 上传以及 Preview/Share 2.0 的开发中能力；不是本次 2.0 新服务已经实现的证据。

本次更新是对上一份 2.0 文档包的整合：统一 `.omnistore/`，新增 static_assets，快速图床与路径型博客资源分工，补齐缓存/跨域/权限/命名空间/重绑/验收。没有在此任务中修改或提交仓库代码，也没有运行产品测试。

上述为 2026-09-29 的文档整合记录；静态作用域已由下面的实现记录更新。其余 Transfer Send/Collect、运维、备份恢复和兼容性范围继续保留。

## 2026-10-04：静态 HTTP 协议重构

静态访问从 Site 单例改为每源独立的匿名只读 HTTP 协议。Site binding 仅保留公开盘、图床和流转中心。后台入口为「存储源 → 静态 HTTP」，各源独立发布、启停和设置缓存/CORS。管理 API 改为 `/api/v1/admin/sources/{key}/static-access/*`，公开 `/assets/{id}/{path}` 不变。

新增不可重放迁移 `v2.0.1.sql`，从旧单例迁移公开身份、启停、配置版本和白名单；不移动或删除普通文件。跨源重绑不覆盖已有目标配置，撤销配置须先关闭协议；源有静态配置时禁止删除。

验证：`go test ./...`；`go test -race ./internal/staticassets ./internal/http ./internal/db ./internal/sources ./internal/operations`；前端 48 项单元测试和生产构建；Chromium 8 项 E2E（静态协议与后台设置回归），覆盖 1440px/375px、多源同路径内容、普通上传后匿名读取、单源启停、根发布确认、持久化、版本冲突、旧配置迁移及系统备份恢复。浏览器使用独立临时数据和端口 18090，没有重启现有 18080 服务。未验证 Safari/Firefox、真实 CDN 或跨机器部署。

## 2026-10-14：访客中转、公开入口与站点配置

文件中转对未登录访客开放：访客可创建发件包与收集任务、上传文件并管理自己的收发记录。访客身份使用独立 Cookie，与普通登录会话分开，不创建普通用户、不授予文件管理、存储源或管理权限；身份有效期不超过 Web 会话期限与 7 天中的较小值，界面提供 1 天有效期，单个访客最多 20 个活跃任务、1 GiB 活跃载荷，单文件也不高于 1 GiB，实际剩余空间仍在写入时校验。登录用户的任务归账号所有；从网盘复制快照、保存提交到普通目录仍需真实登录与目录权限。

新增不可重放迁移：`v2.0.2.sql` 为 `transfers`/`transfer_collections` 增加 `require_code`（历史任务置 1，保留原短码保护）；`v2.0.3.sql` 增加 `transfer_guest_identities` 并重建两张任务表，`owner_user_id` 与 `owner_guest_id` 二选一且 guest 删除受限，访问会话与上传草稿按 publicKey 重新初始化。

Web 端新增公开入口 `/transfer`（发送文件/收集文件/收发记录三个 Tab，与 `/app/transfer` 共用同一界面，详情地址支持直接打开与刷新）、公共导航（公开网盘/图床/文件中转，登录态显示工作台入口）和后台「站点配置」页（站点服务绑定、实例信息、配置备份）。

验证：`go build ./...`；`go test ./...`（26 个包全部通过）；`go test -race ./internal/staticassets ./internal/http ./internal/db ./internal/sources ./internal/operations ./internal/transfers ./internal/backup ./internal/managedroot`；前端 58 项单元测试、`tsc -b` 与生产构建；Chromium E2E 66 项全部通过，其中新增公开导航（1440/320/375px）、公开中转入口（访客记录持久化、停用服务不影响已有链接、登出后不泄漏上一位所有者缓存）、站点配置（状态保存、失败保存与并发编辑恢复）与静态协议（1440/375px）。E2E 使用干净种子环境，完成后清理了本次创建的公开配置。未验证 Safari/Firefox、真实客户端矩阵与跨机器部署。
