# OmniStore 2.0 Tasks

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

本文件是编码清单。状态以代码和测试为准。

2026-10-18 状态说明：早期未勾选项尚未逐项重做验收，不等同于代码完全不存在；请先读 [STATUS](STATUS.md) 中的实现记录。下方完整产品目标继续保留，本轮仅更新有直接证据的恢复与兼容子集。

## P0 — Breaking Architecture

- [ ] 创建 `migrations/v2.0.0.sql`
- [ ] `site_capability_bindings`
- [ ] Storage Source 移除 public 字段
- [ ] Storage Source 移除 image-bed 字段
- [ ] Storage Source 新增 `s3_enabled`
- [ ] 删除 `public_mount_redirects`
- [ ] 删除 Image Bed Source preference
- [ ] Service Capability service/repository
- [ ] Admin Site Capability API
- [ ] Admin Site Capability UI
- [ ] Source deletion binding guard
- [ ] `.omnistore` reserved namespace
- [ ] Generic REST/WebDAV/S3/Public/Search 隐藏/拒绝 service namespace
- [ ] Storage physical quota 仍计算 service payload

## P0 — Public Drive

- [ ] 全站单 Source
- [ ] `/public` 固定入口
- [ ] 删除 mount path 概念
- [ ] 删除 redirect alias
- [ ] Anonymous read security
- [ ] service namespace exclusion
- [ ] E2E

## P0 — Image Bed

- [ ] 全站单 Source
- [ ] 登录用户不再选 Source
- [ ] Anonymous 同一绑定
- [ ] 旧图片仍可读取
- [ ] 新图片使用 service namespace
- [ ] Image Bed quota/ownership 语义测试
- [ ] PicGo 回归

## P0 — Protocol Scope

- [ ] WebDAV per-source
- [ ] S3 per-source
- [ ] S3 bucket = storage_key
- [ ] Bucket list 只返回启用且有权限 Source
- [ ] WebDAV 路径只允许启用 Source
- [ ] Source rename protocol stable
- [ ] UI 提供复制 endpoint/bucket
- [ ] protocol E2E

## P0 — Transfer Data Model

- [ ] `transfers`
- [ ] `transfer_files`
- [ ] `transfer_submissions`
- [ ] `transfer_access_sessions`
- [ ] transfer quota/settings
- [ ] transfer source snapshot
- [ ] high-entropy public key
- [ ] pickup code HMAC/digest
- [ ] password hash
- [ ] expiry/status state machine
- [ ] audit
- [ ] GC
- [x] crash recovery：批次提交边界、精确临时路径、托管归属与重复恢复（2026-10-18）

## P0 — Send

- [ ] Create Draft
- [ ] Upload files
- [ ] Upload folders
- [ ] Existing Files -> snapshot copy
- [ ] Finalize
- [ ] Public recipient page
- [ ] Preview
- [ ] Single download
- [ ] Stream ZIP
- [ ] Pickup code
- [ ] Password
- [ ] QR
- [ ] Download limit
- [ ] Expire
- [ ] Revoke
- [ ] History

## P0 — Collect

- [ ] Create Collection
- [ ] Optional submitter name
- [ ] Optional note
- [ ] file type limit
- [ ] file size limit
- [ ] submission size limit
- [ ] collection total limit
- [ ] anonymous upload-only auth
- [ ] cannot enumerate submissions
- [ ] cannot read others
- [ ] Inbox
- [ ] Preview
- [ ] Download
- [ ] Save to Files
- [ ] Close
- [ ] Expire
- [ ] Abuse/rate-limit test

## P1 — Operation Center

- [ ] System status
- [ ] Source health
- [ ] Site Capability health
- [ ] protocol status
- [ ] DB health
- [ ] quota summary
- [ ] trash/cache/multipart
- [ ] active transfer usage
- [ ] recent failed audit
- [ ] reconcile
- [ ] cleanup
- [ ] integrity check

## P1 — Backup & Restore

- [ ] backup manifest v1
- [ ] DB consistent snapshot
- [ ] config
- [ ] keys
- [ ] checksum
- [ ] restore
- [ ] source rebind
- [ ] capability rebind validation
- [ ] reconcile
- [ ] restore report
- [ ] old backup compatibility

## P1 — Compatibility

- [ ] Windows WebDAV
- [ ] Finder WebDAV
- [ ] rclone WebDAV
- [ ] Cyberduck
- [ ] AWS CLI
- [ ] rclone S3
- [ ] s3cmd
- [ ] MinIO Client
- [ ] PicGo

## Release

- [ ] clean migration from 1.1.x
- [ ] fresh install
- [x] E2E：现有 Chromium 套件 67 项通过（2026-10-18）；完整产品/客户端目标仍按各条目验收
- [x] race：`go test -race -count=1 ./...`（2026-10-18）
- [x] crashcheck：十四条路径各十轮，140 次真实 SIGKILL 恢复（2026-10-18）
- [ ] backup restore
- [ ] real client matrix
- [ ] `v2.0.0-rc.1`

## P0 — 本次补充：命名空间隔离（NS）

- [ ] NS-01 所有新托管路径统一 `.omnistore/`，保留旧 upload/copy 临时前缀规则
- [ ] NS-02 按完整路径段检查，query/body/Destination/object key/relative_path 全入口接入
- [ ] NS-03 通用 GET/HEAD/PROPFIND 返回真实 404；SPA fallback 不吞状态
- [ ] NS-04 递归 ZIP/Share/Copy/Move/Delete 不泄漏或破坏托管子树
- [ ] NS-05 源物理用量包含内部目录，普通 Reconcile 不误删托管台账
- [ ] NS-06 未登记同名目录不接管、不删除；Source 历史引用删除保护
- [ ] NS-07 FTS、最近、收藏既有行的隐藏及 scope 分离

## P0 — 本次补充：快速图床（IMG）

- [ ] IMG-01 去除将“登录用户图床”当作路径型博客资源服务的混淆
- [ ] IMG-02 匿名默认关闭，登录/匿名共享唯一当前绑定
- [ ] IMG-03 新图 `.omnistore/image-bed/`；旧 `/i/` ID 不重新映射到新根
- [ ] IMG-04 匿名保留策略独立、默认不自动过期，上传前/结果明确 expires_at
- [ ] IMG-05 图床台账 resource_scope、用户计费不重复、普通扫描不误删
- [ ] IMG-06 PicGo 与个人历史、撤下/删除回归

## P0 — 本次补充：静态资源（AST）

- [x] AST-01 静态 HTTP 改为按源配置 + source_static_access/origins/revision；v2.0.0 迁移不自动发布旧源
- [x] AST-02 管理配置/预检/发布风险确认/发布根与类型策略
- [x] AST-03 普通文件映射；无 images 记录和无 Reconcile 先决条件
- [x] AST-04 GET/HEAD /assets/{id}/{path}，目录与内部路径 404
- [x] AST-05 复用普通上传/文件夹/覆盖以及 WebDAV/S3，逐路径 Policy 检查
- [x] AST-06 short/no-cache/long，验证器与原文件变化一致，404 no-store
- [x] AST-07 视频 Range/If-Range/416/HEAD，流式不全量缓冲
- [x] AST-08 无凭据 CORS/CORP 逐路由，后台边界不改变
- [x] AST-09 baseUrl 编码、可信 origin、无凭据博客示例
- [x] AST-10 reset/relocate、防并发修改、旧 ID 不静默指向无关内容
- [x] AST-11 关闭公开盘但静态资源可用，同源复用不公开内部内容
- [x] AST-12 备份含配置/发布ID但不含原件，恢复后显式核验才公开
- [ ] AST-13 双 origin 浏览器图片/视频/Canvas/fetch 与非法类型端到端验收
  - 已完成 Chromium 图片/Canvas/fetch/WebM 播放与 seek、非法类型和启停；MP4、其他浏览器与生产代理/CDN 未验收，见 [实测矩阵](design/compatibility-testing.md)。

NS/IMG/AST 任务全部属于 2.0，不挤掉 Send + Collect、Operation Center、Backup/Restore 和协议兼容的既定范围。以下 checklist 是待执行清单，不是本次已通过的产品测试结果。

## P0 — 本次补充：访客中转（GT）

- [x] GT-01 访客身份独立 Cookie，与登录会话分离，不创建普通用户或存储权限（v2.0.0）
- [x] GT-02 访客可创建发件包/收集任务、上传文件并管理自己的收发记录
- [x] GT-03 访客配额：默认 1 天有效期、最多 20 个活跃任务、1 GiB 活跃载荷、单文件 ≤ 1 GiB，写入时仍校验
- [x] GT-04 访客不授予普通文件管理、存储源或应用管理权限；登出/换设备不可恢复所有者权限
- [x] GT-05 新建任务默认不要求取件码/收件码，可单独开启短码或密码（v2.0.0 默认 require_code=1）
- [x] GT-06 公开入口 `/transfer` 与工作台 `/app/transfer` 共用界面，详情地址可直达与刷新
- [x] GT-07 后台「站点配置」页集中管理站点服务绑定、实例信息与配置备份
- [ ] GT-08 访客任务的真实配额压测与跨设备恢复预期文档化

## 2026-10-18 — 可靠性加固

- [x] Collect 批次日志先于文件写入；部分写入失败、提交前/后中断、空占位行与重复恢复回归
- [x] Send 精确临时路径恢复；同路径并发上传、定稿/草稿 GC 协调
- [x] GC 与活动/待恢复上传交错；未知路径保留；错误源/托管根/日志拒绝破坏性恢复
- [x] 已完成删除不重放到同名新文件；未完成删除阻止托管路径复用
- [x] 关闭收集任务后下载/保存与配额保留；到期回收和普通目录副本独立
- [x] 浏览器门禁使用独立临时数据、动态端口、失败留证据与中断进程清理
- [x] 下载名额按（访问会话, 目标）去重：Range 续传、重试与并发重复请求不重复计数，声明随会话级联删除（v2.0.0）
