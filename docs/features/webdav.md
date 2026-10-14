# WebDAV — 2.0

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

WebDAV 是 Source Protocol Capability。

每个 Source：

```text
webdav_enabled
```

Endpoint 的 Source 标识使用 immutable `storage_key`。

要求：

- user credential；
- Policy；
- exclude；
- symlink；
- quota；
- persistent lock；
- recovery。

`.omnistore` 永远不可见。

Source rename 不改变 WebDAV path。

DELETE 仍是协议永久删除，不进入网页 Trash。

## 普通静态目录与内部目录

静态发布目录是普通文件路径：协议开启且凭据/Policy 允许时可以上传、覆盖、移动，静态 URL 随之按普通路径语义变化；协议客户端不需要 image_id。

`.omnistore/` 是系统托管范围，拥有 Source 根读写权限也不能访问。通用读取/浏览按 404 处理，协议层保持各自响应格式与认证行为。列表不含内部项；Copy/Move/DELETE/Multipart 不得间接修改内部数据。静态资源服务开启不自动开启本协议，也不授予匿名 S3/WebDAV 写入。
