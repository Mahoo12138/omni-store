# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。发布标签和 GitHub Release 是版本事实来源；本文件记录面向用户的重要变化，不替代完整 Git 历史。

## [Unreleased]

### Added

- 本地目录存储源、访问策略和子路径只读/读写权限。
- 私有文件管理、跨来源复制/移动、回收站、文件台账、配额和全局搜索。
- 随机文件/目录分享，可选密码、有效期、下载次数限制和撤销。
- 公开网盘及挂载路径重定向。
- WebDAV 基础读写与持久独占写锁。
- 登录/匿名图床、PicGo 接口和缩略图缓存。
- 可选 S3 Path-style API、Signature V4、多个凭据和 Multipart Upload。
- 审计日志、系统配置包导出、隔离测试环境和自动化 E2E。
- 使用 MIT License 公开发布。

### Security

- 统一路径规范化、路径穿越与 symlink 拒绝、排除规则、CSRF、可信代理和写入锁检查。
- 密码与 Token 只保存哈希，S3 Secret 使用 AES-256-GCM 加密。

### Fixed

- 表单字段的可见标签现在通过 `for/id` 与输入控件关联，改善键盘操作和辅助技术识别。

`1.0.0` 尚未发布。创建稳定标签前，应把本节改为 `## [1.0.0] - YYYY-MM-DD`，并确认内容与最终候选一致。
