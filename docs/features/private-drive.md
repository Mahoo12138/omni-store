# 私有文件管理

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

2.0 保留 1.1 已交付能力：

- multi upload；
- folder upload；
- batch operations；
- drag & drop；
- recent；
- favorites；
- preview；
- share；
- search；
- trash。

普通文件操作属于 Resource Capability。

## 关键规则

- 使用用户 Policy；
- 不允许访问 `.omnistore`；
- Site Capability backing Source 不因为绑定关系自动授予普通文件访问权；
- Transfer Collect 保存到文件时才创建普通 `file_records`；
- 普通 User Quota只计算普通 durable files/image ownership，不计算 Transfer 临时 payload。

## 静态资源仍是普通文件

博客资源保留在普通发布目录，可继续用文件管理器、文件夹上传、拖拽、批量操作和已启用的 WebDAV/S3 管理，不转移到图床托管根。只有目标路径 Policy 授权才可写；前端可以提示“该目录会被静态资源服务公开读取”。

同路径覆盖保持 URL；移动/重命名改变路径并影响博客引用，不自动改写文章或创建重定向。公开直链复制按钮按发布根计算相对路径，不把 source_key 或内部实际路径当成公开 ID。

托管图片在专用图床历史中管理。`.omnistore/` 普通读取、浏览和间接递归操作受统一隔离规则约束；Source 的物理计量不得因隐藏而跳过。
