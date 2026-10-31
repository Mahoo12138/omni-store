# Agent 开发规则 — 2.0

> 修订：2026-10-31 / R3。2.0 目标规范；未标为基线的内容不代表已实现。

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

## 4. Service Namespace

Generic API 不允许访问：

```text
.omnistore
```

任何绕过都视为安全 bug。

## 5. Tests

不要只测 happy path。

必须包含：

- concurrent upload；
- quota race；
- source rebind；
- source delete；
- Range preview；
- crash between FS and DB；
- GC vs active operation；
- upgrade migration。

## 6. 每次完成任务报告

说明：

1. files changed；
2. schema/API behavior；
3. destructive changes；
4. tests；
5. migration compatibility；
6. remaining risks；
7. next task。

## 7. 本次确认的不可回退边界

- Site 服务共两项：public_drive、image_bed。静态 HTTP 是 Source Protocol，各源独立配置与启停，不能重新做成站点单例。
- 博客图片/视频放普通目录；`.omnistore/` 只放系统托管原件（图床）。SQLite/keys 留在系统数据目录。
- 公开盘关闭、无 Share、无 image 记录时，静态发布依然应工作。
- 静态写入走普通路径 Policy；快速图床的授权不得扩展到普通目录。
- 通用内部路径返回真实 404，并处理递归/编码/SPA fallback；不可只在 UI 隐藏。
- 固定路径缓存不默认一年 immutable；CORS 只开公开读取，不开整个后台。
- 未知同名目录不接管、不删除；普通 Reconcile 不误删图床 scope 台账。
- static ID 重绑由 reset/relocate 决定，不能直接以新根覆盖旧映射。

实现事实以代码/测试为准，目标行为以本次确认规范为准。发现旧代码与目标不同，应实施重构或报告阻塞；不能把目标文档改回旧行为来制造“实现一致”。

阅读新任务时优先看 [静态功能](features/static-assets.md)、[托管路径](design/managed-namespace.md)、[HTTP](design/public-content-http.md) 和 [测试](TESTING.md)。未经代码验证的项目事实要标识，不编造通过率。

## 8. 文案红线

新增或修改界面时，不得添加解释性文案：

- 不写页面、卡片或弹窗标题下的功能性副标题；
- 不写系统行为自述（“立即生效”“会自动同步”“换设备后仍保持”“不会丢失”“会出现在这里”）；
- 不写空态解释或“点击某处开始”的指引；空态只留状态标题和可执行动作；
- 不写建议性、说服性文案，除非是安全或兼容要求；
- 不为显而易见字段写用途说明。

只允许保留：格式/长度/取值/默认值/单位/上限等约束；不可恢复、配额、权限、会话、缓存、公开范围等风险；Token/Secret 的一次性提示；错误原因与具体恢复步骤。判定方法：删掉这句话后用户仍能完成操作且不误解，就删。

完整规则见 [设计系统 §7](DESIGN_SYSTEM.md)。代码审查中，新增解释性文案按缺陷处理。
