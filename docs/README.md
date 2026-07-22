# OmniStore 项目文档

这里是 OmniStore 的完整文档入口。根目录 `README.md` 只负责项目简介与快速导航，具体需求、设计和工程约束均在本目录维护。

## 产品与计划

| 文档 | 说明 |
| --- | --- |
| [产品定义](PRODUCT.md) | 目标用户、产品定位、设计原则与 MVP 边界 |
| [路线图](ROADMAP.md) | 后续版本方向和 MVP 实施阶段 |
| [MVP 验收清单](ACCEPTANCE.md) | 安装、权限、文件操作、安全与审计的完成条件 |

## 架构与工程

| 文档 | 说明 |
| --- | --- |
| [系统架构](ARCHITECTURE.md) | 技术栈、部署、配置、目录、并发、审计和代码结构 |
| [身份、权限与存储安全](SECURITY.md) | 认证、授权、Token、代理、路径与排除规则 |
| [数据模型](DATA_MODEL.md) | SQLite 表结构与字段语义；迁移文件为最终事实来源 |
| [API 约定](API.md) | 统一响应、分页与错误码 |
| [开发指南](DEVELOPMENT.md) | 环境、启动、构建、配置与备份 |
| [Agent 开发规则](AGENT_GUIDE.md) | Agent 修改项目时必须遵守的边界与工作顺序 |

## 功能规范

| 文档 | 说明 |
| --- | --- |
| [公开网盘](features/public-drive.md) | 公开挂载、路由与匿名访问 |
| [私有网盘与文件操作](features/private-drive.md) | 浏览、上传、下载、删除、移动与缓存 |
| [WebDAV](features/webdav.md) | 鉴权、方法支持和操作语义 |
| [图床](features/image-bed.md) | 登录 / 匿名图床、图片校验、历史与 PicGo |
| [S3 后续规划](features/s3.md) | 非 MVP 的 S3 能力边界 |

## 设计与文档维护

| 文档 | 说明 |
| --- | --- |
| [设计系统](DESIGN_SYSTEM.md) | 视觉 token、组件规范、响应式和前端页面范围 |
| [图床页设计 QA](design-qa/image-bed.md) | 图床页面的视觉对照与验收记录 |
| [文档维护规范](DOCUMENTATION_GUIDE.md) | 文档职责、事实优先级和更新原则 |

## 事实优先级

发生冲突时，以可执行事实为准：数据库迁移高于数据模型说明，代码和测试高于过期状态描述，已确认的架构约束高于临时推测。修改接口、数据库、核心行为或版本范围时，应同步更新对应文档。
