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

历史已发布 migration：

```text
v1.0.0.sql
v1.1.0.sql
v1.1.1.sql
```

全部冻结。

当前代码已包含的 2.0 migration：

```text
v2.0.0.sql
```

不能修改历史 migration。迁移文件编号不等于产品发布版本；当前开发版本为 `2.0.0-dev`。2.0.1–2.0.4 的增量变更已在发布前合并进 `v2.0.0.sql`，不再保留独立文件；升级路径只保留 1.1.x → 2.0.0。

## 本次文档修订基线（2026-09-29）

核对 main 为 `af9a3859bedcd7736ced38ecb8da285a11e595c8`，提交日期 2026-09-28。该提交文档描述已有 relative_path 上传以及 Preview/Share 2.0 的开发中能力；不是本次 2.0 新服务已经实现的证据。

本次更新是对上一份 2.0 文档包的整合：统一 `.omnistore/`，新增 static_assets，快速图床与路径型博客资源分工，补齐缓存/跨域/权限/命名空间/重绑/验收。没有在此任务中修改或提交仓库代码，也没有运行产品测试。

上述为 2026-09-29 的文档整合记录；静态作用域已由下面的实现记录更新。其余 Transfer Send/Collect、运维、备份恢复和兼容性范围继续保留。

## 2026-10-04：静态 HTTP 协议重构

静态访问从 Site 单例改为每源独立的匿名只读 HTTP 协议。Site binding 仅保留公开盘、图床和流转中心。后台入口为「存储源 → 静态 HTTP」，各源独立发布、启停和设置缓存/CORS。管理 API 改为 `/api/v1/admin/sources/{key}/static-access/*`，公开 `/assets/{id}/{path}` 不变。

静态访问的 schema 变更（原 `v2.0.1.sql`，现并入 `v2.0.0.sql`）建立按源的发布配置：不自动发布任何源，不移动或删除普通文件。跨源重绑不覆盖已有目标配置，撤销配置须先关闭协议；源有静态配置时禁止删除。

验证：`go test ./...`；`go test -race ./internal/staticassets ./internal/http ./internal/db ./internal/sources ./internal/operations`；前端 48 项单元测试和生产构建；Chromium 8 项 E2E（静态协议与后台设置回归），覆盖 1440px/375px、多源同路径内容、普通上传后匿名读取、单源启停、根发布确认、持久化、版本冲突、旧配置迁移及系统备份恢复。浏览器使用独立临时数据和端口 18090，没有重启现有 18080 服务。未验证 Safari/Firefox、真实 CDN 或跨机器部署。

## 2026-10-14：访客中转、公开入口与站点配置

文件中转对未登录访客开放：访客可创建发件包与收集任务、上传文件并管理自己的收发记录。访客身份使用独立 Cookie，与普通登录会话分开，不创建普通用户、不授予文件管理、存储源或管理权限；身份有效期不超过 Web 会话期限与 7 天中的较小值，界面提供 1 天有效期，单个访客最多 20 个活跃任务、1 GiB 活跃载荷，单文件也不高于 1 GiB，实际剩余空间仍在写入时校验。登录用户的任务归账号所有；从网盘复制快照、保存提交到普通目录仍需真实登录与目录权限。

中转台账的 schema 变更（原 `v2.0.2.sql`/`v2.0.3.sql`，现并入 `v2.0.0.sql`）：`transfers`/`transfer_collections` 直接建为最终形态，`require_code` 默认 `1`；新增 `transfer_guest_identities`，`owner_user_id` 与 `owner_guest_id` 二选一且 guest 删除受限；访问会话与上传草稿按 publicKey 初始化。

Web 端新增公开入口 `/transfer`（发送文件/收集文件/收发记录三个 Tab，与 `/app/transfer` 共用同一界面，详情地址支持直接打开与刷新）、公共导航（公开网盘/图床/文件中转，登录态显示工作台入口）和后台「站点配置」页（站点服务绑定、实例信息、配置备份）。

验证：`go build ./...`；`go test ./...`（26 个包全部通过）；`go test -race ./internal/staticassets ./internal/http ./internal/db ./internal/sources ./internal/operations ./internal/transfers ./internal/backup ./internal/managedroot`；前端 58 项单元测试、`tsc -b` 与生产构建；Chromium E2E 66 项全部通过，其中新增公开导航（1440/320/375px）、公开中转入口（访客记录持久化、停用服务不影响已有链接、登出后不泄漏上一位所有者缓存）、站点配置（状态保存、失败保存与并发编辑恢复）与静态协议（1440/375px）。E2E 使用干净种子环境，完成后清理了本次创建的公开配置。未验证 Safari/Firefox、真实客户端矩阵与跨机器部署。

## 2026-10-18：2.0 恢复一致性与浏览器兼容加固

基于 `bac9423` 继续开发，成果已提交在分支 `codex/2.0-release-hardening`。本轮不是已发布版本，也不代表整个 2.0 已达到 RC 条件。

- Collect 在写文件前持久化批次日志；空提交占位行不再被当成已提交依据。进程中断后，未提交批次回滚，已提交文件保留，启动时清除无文件的占位行。
- Send 记录精确临时路径，恢复校验源、任务、文件路径与托管根归属；失败保留日志。上传、定稿与草稿 GC 协调，重复同路径上传不能破坏已获胜请求的文件。
- 已完成删除的恢复只移除日志，避免删除同名新内容；未完成删除阻止托管路径复用。GC 保留带待恢复日志的任务，不再按名称猜测删除无归属证据的文件或目录。
- Collect 关闭仅停止接收；既有内容持续可下载、保存，仍计入站点/访客容量与源删除保护，直到原定过期时间再回收。无过期时间的关闭任务保留内容。
- 新增真实第二 origin 浏览器检查，覆盖图片解码、Canvas、CORS、WebM 播放/seek、非法类型及服务启停；统一浏览器门禁改用新临时种子与动态端口，失败保留证据。
- crashcheck 增加 Send 上传/定稿、Collect 提交、Save to Files、GC 五条真实 SIGKILL 路径，连同既有九条共十四条。
- 下载名额按（访问会话, 下载目标）去重（`v2.0.0`）：同一文件的 Range 续传、失败重试与并发重复请求只计一次，不同目标或重新解锁的新会话仍各自计数；声明与条件 UPDATE 同事务，名额用完时回滚声明。

迁移与 API：`v2.0.0.sql` 增加 `transfer_download_claims`，不新增独立迁移。对外路由和响应结构保持兼容；收件箱隐藏未完成占位提交，关闭任务的载荷统计包含保留文件。旧上传日志仍可读取；旧版未记录路径的临时文件保留供人工核查，不承诺自动识别删除。

开发门禁：Node 24.19.0 / Go 1.27.0 下，`OMNISTORE_ALLOW_DIRTY=1 ./scripts/verify-release.sh` 完整运行成功。前端 58 项单元测试、TypeScript 与生产构建；Go 格式检查、vet、全量非缓存测试（总语句覆盖率 71.7%，全部关键包门槛通过）及全量非缓存 race；全新临时实例 Chromium E2E 67/67；嵌入前端的发布二进制、Linux amd64/arm64 交叉构建、Compose 配置与 diff 检查均通过。Compose 配置校验不代表已运行容器；本轮未发布镜像或标签。

恢复验收：`OMNISTORE_CRASH_ROUNDS=10 ./scripts/verify-crash-recovery.sh` 完整运行成功，十四条路径各十轮，共 140 次真实 SIGKILL。验证文件字节、数据库台账、重复恢复/重试与保存到普通目录的副本；不把一次进程能重启当作数据一致性通过。

下一阶段仍需：完成真实 WebDAV/S3/PicGo 客户端矩阵、MP4 与其他浏览器/生产代理验收、GT-08 实际访客配额压测，以及 Transfer 预览的目标闭环。逐项结果见 [兼容矩阵](design/compatibility-testing.md)；不能以 API 自编请求替代真实客户端通过结论。
