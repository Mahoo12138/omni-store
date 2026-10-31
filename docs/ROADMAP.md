# OmniStore 2.0 Roadmap

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：2.0.0 开发中。当前开发标识 `2.0.0-dev`；实现与验证进度见 [STATUS](STATUS.md)。本文件的 Epic 保留完整目标，不以单轮门禁通过替代 RC 验收。

## 目标

2.0 不是简单增加一套页面，而是把 OmniStore 的功能边界重新统一。

核心原则：

> 产品功能归站点，访问协议归存储源，文件操作归资源。

## Epic A — Capability Scope Refactor

### Site Capability

全站单例：

- Public Drive；
- Image Bed。

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

## Epic B — Operation Center

- Dashboard；
- Source Health；
- Site Capability Health；
- Database status；
- Quota / Trash / Cache / Multipart；
- Recent failed audit；
- Reconcile；
- Cleanup；
- SQLite integrity check。

## Epic C — Backup & Recovery

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

## Epic D — Compatibility

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
- Operation Center 可用于实际维护；
- Backup -> Fresh Instance -> Rebind -> Reconcile 可复现；
- 兼容矩阵形成测试；
- Release Gate 全绿；
- RC 之后只修 blocker。

## Epic E — 快速图床与静态资源托管分工（2.0 必交付）

- 图床：匿名/登录上传受支持图片，随机 ID 直链，系统托管，独立保留策略。
- 静态资源：按源独立的匿名只读 HTTP 配置 + 普通发布目录，图片/视频按 baseUrl + relativePath 读取。
- 不依赖公开盘、多源公开 mount、Share 或 images 表；没有匿名静态写入。
- `.omnistore/` 全协议路径隔离和真实 404；源物理用量照常统计。
- 固定路径覆盖、改名、删除、缓存失效边界可解释；ID 的 reset/relocate 不误指向内容。
- 默认短缓存，严格限定公开读取 CORS，与管理 API 分离。
- 未实现的新服务不标成已交付；原有已完成上传和 Preview/Share 能力保留为基线。

依赖关系和实施时点以 [实施顺序](IMPLEMENTATION_PLAN.md) 的补充为准。Site 服务为公开盘、图床；静态 HTTP 属于 Source Protocol，各自生命周期独立。
