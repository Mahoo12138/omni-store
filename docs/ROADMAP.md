# OmniStore 2.0 Roadmap

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：Planned / Active Design

## 目标

2.0 不是简单增加一个 Transfer 页面，而是把 OmniStore 的功能边界重新统一。

核心原则：

> 产品功能归站点，访问协议归存储源，文件操作归资源。

## Epic A — Capability Scope Refactor

### Site Capability

全站单例：

- Public Drive；
- Image Bed；
- Transfer Center。

每个能力：

```text
enabled
storage_source_id
```

由管理员统一配置。

### Source Protocol

每个 Storage Source：

```text
WebDAV enabled
S3 enabled
Static HTTP: enabled + publish_root + public_asset_id
```

随机 `storage_key`：

- WebDAV 路径稳定 ID；
- S3 Path-style Bucket 名。

### Breaking Changes

移除：

- `storage_sources.public_read_enabled`
- `storage_sources.public_mount_path`
- `storage_sources.image_bed_enabled`
- `public_mount_redirects`
- 用户选择 Image Bed Source 的产品模型。

Public Drive 改成：

```text
/public/*
    ->
Site.PublicDrive.Source
```

不再存在多 Source public mount。

## Epic B — Transfer Center

一个完整产品中心：

```text
Transfer Center
├── Send
├── Collect
└── History
```

### Send

- 本地文件/文件夹直接上传；
- 可从已有 OmniStore 文件复制进 Transfer；
- 保持目录结构；
- 标题和说明；
- 高熵公开链接；
- 短取件码；
- 可选密码；
- QR Code；
- 有效期；
- 下载次数；
- 文件列表与 Preview；
- 单文件下载；
- 全部 ZIP；
- 主动撤销；
- 自动过期 GC。

### Collect

- 创建收集任务；
- 标题/说明；
- 高熵链接；
- 短收件码；
- 可选密码；
- 有效期；
- 类型/单文件/总量限制；
- 可要求提交者姓名和备注；
- 匿名 upload-only；
- Submission Inbox；
- Preview；
- 下载；
- Save to Files；
- Close / Expire。

## Epic C — Operation Center

- Dashboard；
- Source Health；
- Site Capability Health；
- Database status；
- Quota / Trash / Cache / Multipart；
- Transfer active usage；
- Recent failed audit；
- Reconcile；
- Cleanup；
- SQLite integrity check。

## Epic D — Backup & Recovery

- 稳定 Backup Format；
- 导出 SQLite 一致性快照；
- 配置/keys；
- Restore；
- Source Rebind；
- Site Capability Rebind；
- Reconcile；
- Restore Report；
- 兼容旧备份格式。

不打包真实 Storage Source 文件。

## Epic E — Compatibility

WebDAV：

- Windows Explorer；
- macOS Finder；
- rclone；
- Cyberduck；
- WinSCP；
- RaiDrive；
- Mountain Duck。

S3：

- AWS CLI；
- rclone S3；
- s3cmd；
- MinIO Client。

Image Bed：

- PicGo。

## 2.0 完成条件

- `v2.0.0.sql` 升级链可从 1.1.x 实例安全迁移；
- Site Capability / Source Protocol 旧模型彻底删除，不保留双轨代码；
- Transfer Send/Collect 完整闭环；
- Operation Center 可用于实际维护；
- Backup -> Fresh Instance -> Rebind -> Reconcile 可复现；
- 兼容矩阵形成测试；
- Release Gate 全绿；
- Crash Recovery 增加 Transfer 关键写路径；
- RC 之后只修 blocker。

## Epic F — 快速图床与静态资源托管分工（2.0 必交付）

- 图床：匿名/登录上传受支持图片，随机 ID 直链，系统托管，独立保留策略。
- 静态资源：按源独立的匿名只读 HTTP 配置 + 普通发布目录，图片/视频按 baseUrl + relativePath 读取。
- 不依赖公开盘、多源公开 mount、Share 或 images 表；没有匿名静态写入。
- `.omnistore/` 全协议路径隔离和真实 404；源物理用量照常统计。
- 固定路径覆盖、改名、删除、缓存失效边界可解释；ID 的 reset/relocate 不误指向内容。
- 默认短缓存，严格限定公开读取 CORS，与管理 API 分离。
- 未实现的新服务不标成已交付；原有已完成上传和 Preview/Share 能力保留为基线。

依赖关系和实施时点以 [实施顺序](IMPLEMENTATION_PLAN.md) 的补充为准。Site 服务为公开盘、图床、Transfer；静态 HTTP 属于 Source Protocol，各自生命周期独立。
