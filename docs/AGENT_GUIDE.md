# Agent 开发规则 — 2.0

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

## 1. 开始任务前

按顺序：

1. `STATUS.md`
2. `ROADMAP.md`
3. `IMPLEMENTATION_PLAN.md`
4. `TASKS.md`
5. `PRODUCT.md`
6. `ARCHITECTURE.md`
7. 对应 feature/design
8. 涉及 DB 时看全部 migrations

## 2. 当前最高优先级

2.0 可以破坏兼容，但不能破坏数据。

允许：

- 删除旧字段；
- 重构 API；
- 重构设置 UI；
- 删除旧 public mount model；
- 删除旧 image source selection。

禁止：

- 修改已发布 migration；
- 自动删除真实用户文件；
- 为兼容旧逻辑长期维持双轨架构；
- 猜测 legacy multi-source 应该绑定哪个 Site Capability。

## 3. Scope Rule

任何新增能力先判断：

```text
Site
Source Protocol
Resource
```

不允许随意给 `storage_sources` 增加产品功能开关。

## 4. Transfer Rule

Transfer 必须是独立 Domain：

```text
internal/transfers
```

不要塞进：

```text
internal/shares
internal/files
```

可以复用 files 的低层安全写 primitive，但不能混淆业务状态。

## 5. Service Namespace

Generic API 不允许访问：

```text
.omnistore
```

任何绕过都视为安全 bug。

## 6. Tests

不要只测 happy path。

必须包含：

- concurrent upload；
- duplicate code；
- expired transfer；
- quota race；
- source rebind；
- source delete；
- anonymous collect abuse；
- Range preview；
- crash between FS and DB；
- GC vs active operation；
- upgrade migration。

## 7. 每次完成任务报告

说明：

1. files changed；
2. schema/API behavior；
3. destructive changes；
4. tests；
5. migration compatibility；
6. remaining risks；
7. next task。

## 8. 本次确认的不可回退边界

- Site 服务共三项：public_drive、image_bed、transfer_center。静态 HTTP 是 Source Protocol，各源独立配置与启停，不能重新做成站点单例。
- 博客图片/视频放普通目录；`.omnistore/` 只放系统托管原件（图床/Transfer）。SQLite/keys 留在系统数据目录。
- 公开盘关闭、无 Share、无 image 记录时，静态发布依然应工作。
- 静态写入走普通路径 Policy；快速图床/Transfer 的授权不得扩展到普通目录。
- 通用内部路径返回真实 404，并处理递归/编码/SPA fallback；不可只在 UI 隐藏。
- 固定路径缓存不默认一年 immutable；CORS 只开公开读取，不开整个后台。
- 未知同名目录不接管、不删除；普通 Reconcile 不误删图床 scope 台账。
- static ID 重绑由 reset/relocate 决定，不能直接以新根覆盖旧映射。

实现事实以代码/测试为准，目标行为以本次确认规范为准。发现旧代码与目标不同，应实施重构或报告阻塞；不能把目标文档改回旧行为来制造“实现一致”。

阅读新任务时优先看 [静态功能](features/static-assets.md)、[托管路径](design/managed-namespace.md)、[HTTP](design/public-content-http.md) 和 [测试](TESTING.md)。未经代码验证的项目事实要标识，不编造通过率。
