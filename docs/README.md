# OmniStore 项目文档

这里是 OmniStore 的完整文档入口。

根目录 `README.md` 只负责项目简介、安装与快速导航；产品边界、架构约束、功能语义、版本规划和开发规则统一在本目录维护。

> 当前状态：`1.0.0` 已完成稳定发布。原 `1.0.0 / V1 / V2` 开发路线与首发验收记录已归档到 [`archive/1.0/`](archive/1.0/)；当前路线图从 `1.1.0` 开始按独立产品主题持续迭代。

## 1. 文档地图

### 产品与版本规划

| 文档 | 说明 |
| --- | --- |
| [产品定义](PRODUCT.md) | 长期产品定位、目标用户、设计原则、能力边界与永久 Non-goals |
| [当前路线图](ROADMAP.md) | 1.x 版本总路线及版本拆分原则 |
| [当前状态](STATUS.md) | 当前稳定版本、正在规划的版本与下一步 |
| [版本路线目录](roadmap/README.md) | 1.1 / 1.2 / 1.3 / 1.4 / 1.5 的详细范围 |
| [1.0 历史路线](archive/1.0/ROADMAP.md) | 首发 V1/V2 阶段及发布加固历史记录 |
| [1.0 验收记录](archive/1.0/ACCEPTANCE.md) | 首发稳定版本的验收基线 |

### 架构与工程

| 文档 | 说明 |
| --- | --- |
| [系统架构](ARCHITECTURE.md) | 技术栈、部署模型、配置、文件系统边界、并发与恢复模型 |
| [身份、权限与存储安全](SECURITY.md) | 认证、Policy、路径、Token、代理、symlink、保留命名空间 |
| [数据模型](DATA_MODEL.md) | SQLite 业务模型和数据生命周期；迁移文件为最终事实来源 |
| [API 约定](API.md) | REST 统一响应、分页、错误语义与关键 API 约定 |
| [开发指南](DEVELOPMENT.md) | 本地启动、构建、配置、测试环境与开发流程 |
| [常见问题](FAQ.md) | Docker 挂载权限、存储源预检与常见部署问题 |
| [发布流程](RELEASING.md) | SemVer、RC、发布门禁、Tag、Docker 与二进制产物 |
| [Agent 开发规则](AGENT_GUIDE.md) | Agent 修改代码前后必须遵守的项目约束 |
| [文档维护规范](DOCUMENTATION_GUIDE.md) | 文档职责、事实优先级、版本归档与更新规则 |
| [本次目录整理说明](MIGRATION.md) | 1.0 历史归档、1.x roadmap/design 目录变化与兼容入口 |

### 功能规范

| 文档 | 说明 |
| --- | --- |
| [公开网盘](features/public-drive.md) | 公开挂载、匿名浏览、raw 访问与重定向 |
| [私有网盘与文件操作](features/private-drive.md) | 浏览、上传、下载、复制、移动、回收站、搜索与缓存 |
| [文件与目录分享](features/sharing.md) | 分享链接、密码、有效期、下载限制、撤销与生命周期 |
| [WebDAV](features/webdav.md) | 鉴权、方法支持、LOCK/UNLOCK 与文件语义 |
| [图床](features/image-bed.md) | 登录/匿名图床、Token、图片校验、历史、缓存与 PicGo |
| [S3 兼容接口](features/s3.md) | Path-style、SigV4、对象操作与 Multipart Upload |

### UI 与设计

| 文档 | 说明 |
| --- | --- |
| [设计系统](DESIGN_SYSTEM.md) | 视觉 Token、布局、组件、状态和响应式约束 |
| [图床页设计 QA](design-qa/image-bed.md) | 图床页面的视觉/交互验收记录 |

### 后续功能设计

| 文档 | 说明 |
| --- | --- |
| [上传任务系统](design/upload-task-system.md) | 单文件、多文件、目录上传共用的前端任务模型 |
| [文件夹上传](design/folder-upload.md) | 保持目录结构的上传协议与安全边界 |
| [统一预览体系](design/preview-resolver.md) | Preview Resolver 与 Renderer 复用模型 |
| [分享预览体系](design/share-preview-system.md) | 分享页复用预览、画廊和流式 ZIP |
| [运行状态中心](design/operation-dashboard.md) | Dashboard、Health 与维护动作 |
| [备份格式](design/backup-format.md) | 可演进的系统备份包结构 |
| [恢复流程](design/restore-workflow.md) | 新实例恢复、存储源重新绑定和 Reconcile |
| [兼容性测试](design/compatibility-testing.md) | WebDAV / S3 / PicGo 真实客户端矩阵 |

## 2. 事实优先级

文档发生冲突时按以下优先级判断：

1. 数据库迁移、实际代码和自动测试。
2. 已发布版本的行为和发布产物。
3. `ARCHITECTURE.md`、`SECURITY.md`、`DATA_MODEL.md`、`features/` 中的当前事实说明。
4. `PRODUCT.md` 中已确认的长期产品边界。
5. `roadmap/` 和 `design/` 中尚未实现的计划。
6. `archive/` 中的历史状态。

历史规划不能覆盖当前实现；未来设计也不能被误读为已经上线的能力。

## 3. 更新规则

- 改数据库：新增 SemVer migration，并同步 `DATA_MODEL.md`。
- 改 REST/协议：同步 `API.md` 或对应 `features/*.md`。
- 改权限、安全、路径规则：同步 `SECURITY.md`。
- 改产品边界：同步 `PRODUCT.md`。
- 确认下一版本范围：同步 `ROADMAP.md` 与 `roadmap/<version>.md`。
- 功能完成后：将 roadmap 中状态改为完成，并更新 Changelog。
- 一个版本稳定发布后：可将其详细验收/阶段过程归档，但当前行为规范不得归档。
