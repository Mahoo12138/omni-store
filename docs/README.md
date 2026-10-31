# OmniStore 2.0 编码文档

修订：2026-09-29 / R2。该目录描述经用户确认的 2.0 目标；不是宣称新服务已上线。当前代码基线与本次实际核对范围见 [STATUS](STATUS.md) 和 [REFERENCES](REFERENCES.md)。

## 1. 本次必须采用的产品边界

站点服务两项：公开网盘、快速图床。每项最多绑定一个 Source，一个 Source 可以被两项复用；WebDAV/S3/静态 HTTP 按源独立配置与启停，普通文件动作归 Resource。

系统托管原件进 `.omnistore/`（图床）；博客图片和视频仍在普通目录，以 baseUrl + relativePath 发布，不依赖公开盘、Share 或 images 登记。数据库、配置、密钥保持系统数据目录。

`.omnistore` 直接通用读取/浏览返回真实 HTTP 404，不能只在 UI 隐藏；递归、编码路径、query、协议入口和 SPA fallback 均需受控。静态读取和普通写权限分离，不将公开媒体 CORS 扩大到后台 API。

## 2. Agent 阅读顺序

先读 [PRODUCT](PRODUCT.md)、[STATUS](STATUS.md)、[IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md)、[TASKS](TASKS.md)。涉及本次变更，重点阅读 [静态资源功能](features/static-assets.md)、[静态发布设计](design/static-assets.md)、[托管命名空间](design/managed-namespace.md)、[HTTP规范](design/public-content-http.md)、[测试](TESTING.md)。

## 3. 总体规范

| 文档 | 职责 |
| --- | --- |
| [PRODUCT](PRODUCT.md) | 作用域、数据归属、永久非目标 |
| [STATUS](STATUS.md) | 基线与未完成目标 |
| [ROADMAP](ROADMAP.md) | 2.0 完整功能范围 |
| [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) | 依赖与实施顺序 |
| [TASKS](TASKS.md) | 原任务与 NS/IMG/AST 新任务 |
| [ACCEPTANCE](ACCEPTANCE.md) | 版本验收清单，尚未执行的项目不勾选 |
| [ARCHITECTURE](ARCHITECTURE.md) | 模块与读写/计量边界 |
| [DATA_MODEL](DATA_MODEL.md) | 目标 schema 片段与约束 |
| [API](API.md) | API 目标契约、静态配置/公开读取 |
| [SECURITY](SECURITY.md) | 授权、路径、404、托管访问与公开安全 |
| [DESIGN_SYSTEM](DESIGN_SYSTEM.md) | 既有视觉规范与后台信息架构 |
| [DEVELOPMENT](DEVELOPMENT.md) | 开发实践 |
| [TESTING](TESTING.md) | 新复杂场景与回归设计 |
| [RELEASING](RELEASING.md) | 2.0 RC 与发布门禁 |
| [AGENT_GUIDE](AGENT_GUIDE.md) | Agent 硬约束与证据要求 |
| [DOCUMENTATION_GUIDE](DOCUMENTATION_GUIDE.md) | 目标与事实、文档职责 |
| [FAQ](FAQ.md) | 部署排查及产品常见误解 |
| [REFERENCES](REFERENCES.md) | 固定基线与官方标准 |

## 4. 功能规格

| 文档 | 能力 |
| --- | --- |
| [私有文件](features/private-drive.md) | 普通目录与上传/管理 |
| [预览](features/preview.md) | 复用已存在的预览能力 |
| [Share](features/sharing.md) | 已有资源分享 |
| [公开盘](features/public-drive.md) | 可浏览的公开空间 |
| [快速图床](features/image-bed.md) | 匿名/登录上传、随机 ID |
| [静态资源](features/static-assets.md) | 普通目录、baseUrl、长期媒体 |
| [WebDAV](features/webdav.md) | 源级协议 |
| [S3](features/s3.md) | 源级协议 |
| [运行中心](features/operation-center.md) | 两种站点服务诊断 |
| [备份恢复](features/backup-recovery.md) | 配置/ID/keys 与源重新绑定 |

## 5. 设计文档

| 文档 | 重点 |
| --- | --- |
| [作用域](design/capability-scope.md) | 站点/源/资源与托管/普通文件两个维度 |
| [托管路径](design/managed-namespace.md) | 404、所有权、递归与协议边界 |
| [静态发布](design/static-assets.md) | 发布根、映射、配置和 reset/relocate |
| [公开 HTTP](design/public-content-http.md) | 缓存、Range、CORS、安全类型 |
| [上传任务](design/upload-task-system.md) | 复用队列、不混淆授权 |
| [Migration](design/v2-migration.md) | 升级保护、旧图与新配置 |
| [Operation](design/operation-center.md) | 维护与诊断 |
| [Backup](design/backup-recovery.md) | 完整系统恢复契约 |
| [Compatibility](design/compatibility-testing.md) | 真实协议客户端与静态博客 |

## 6. 文档权威与交付方式

代码、migration 和测试说明当前实现事实；本次确认的目标规范指导 2.0 重构。两者不一致不能靠把目标改回旧行为解决，应实施或报告明确阻塞。文档中的 SQL 不是完整可直接执行迁移；不得覆盖已发布 1.x SQL。

本目录已包括上一版 2.0 的其余功能，不需要再叠加旧 1.x roadmap/archive。按压缩包中的替换说明使用，保留 Git 历史用于追溯，不提交生成的临时测试数据。
