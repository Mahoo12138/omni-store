# API 约定

本文档描述 OmniStore REST API 的统一约定。具体协议细节同时参考 `features/` 文档和代码。

## 1. 基础路径

Web REST：

```text
/api/v1
```

文件操作使用系统生成的 `storage_key`，不暴露真实磁盘路径。

示例：

```text
GET  /api/v1/sources/{key}/files?path=/
POST /api/v1/sources/{key}/folders
POST /api/v1/sources/{key}/upload?path=/photos
```

## 2. 响应

成功统一返回 `data` 与 `request_id`：

```json
{
  "data": {},
  "request_id": "req_xxx"
}
```

列表可以包含：

```json
{
  "data": {
    "items": [],
    "page": 1,
    "page_size": 100,
    "total": 0,
    "has_next": false
  },
  "request_id": "req_xxx"
}
```

错误返回稳定错误码、可读消息和 request ID。

## 3. 常见 HTTP 语义

- `400`：输入/路径无效；
- `401`：未认证；
- `403`：无权限；
- `404`：Source、文件、分享等不存在；
- `409`：目标已存在或状态冲突；
- `413`：请求/文件超过大小限制；
- `423`：资源被 WebDAV lock；
- `429`：登录/请求限流；
- `507`：存储源或用户配额不足；
- `500`：内部错误。

## 4. 路径

REST 的 `path` 永远是 Storage Source 内相对路径。

规则：

- `/` 与空根路径在服务端统一规范化；
- 禁止传真实磁盘绝对路径；
- 禁止 `..` 逃逸；
- 服务端自行处理平台分隔符；
- Source key 视为不透明字符串。

## 5. 文件列表

示例：

```text
GET /api/v1/sources/{key}/files
    ?path=/2026
    &page=1
    &page_size=100
    &sort=name
    &order=asc
```

排序：

```text
name | size | mtime | type
```

顺序：

```text
asc | desc
```

目录默认优先于文件。

## 6. 文件写操作

REST 文件写操作统一经过：

- Authentication；
- Policy；
- path validation；
- exclude；
- symlink safety；
- lock；
- quota；
- operation recovery。

同名冲突默认不覆盖；只有显式 `overwrite=true` 的上传才允许覆盖普通文件。

## 7. Copy / Move

请求必须同时明确 Source path 与 target：

```json
{
  "path": "/source/item",
  "target_source_key": "src-target",
  "target_path": "/archive/item"
}
```

目标已存在返回 `409`，不自动改名。

## 8. Upload

`1.0` REST 上传是单文件 multipart 上传。

`1.1` 计划扩展“相对路径上传”以支持文件夹上传，设计见：

- [`design/upload-task-system.md`](design/upload-task-system.md)
- [`design/folder-upload.md`](design/folder-upload.md)

尚未实现前，设计文档不能作为当前 API 行为。

## 9. Range

文件读取入口应支持 Range，尤其是：

- private download；
- public raw；
- WebDAV GET；
- image；
- 后续 preview video/audio。

## 10. Cache-Control

建议语义：

```text
私有 API JSON:        no-store
私有文件下载:         private, no-store
公开 raw:             public, 短期缓存
不可变图床 URL:       public, 长期 immutable
```

## 11. CSRF

基于 Web Session 的写 API 必须验证 CSRF。

Token 对同一 Session 稳定，不通过普通 `/auth/me` 请求轮换。

WebDAV/S3 等独立认证入口不复用浏览器 Session CSRF 模型。

## 12. 审计

所有关键写 API 在成功和失败场景应产生一致的审计信息，避免仅记录成功路径。
