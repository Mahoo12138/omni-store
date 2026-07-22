# 私有网盘与文件操作

私有文件管理器、上传行为、冲突处理、下载与缓存等实现规范。

### 展示模型

MVP 私有网盘按存储源分区展示，不做统一虚拟目录树。

登录用户进入：

```text
/app
```

看到自己有权限访问的存储源列表。

进入某个存储源：

```text
/app/sources/{source_id}?path=/
/app/sources/{source_id}?path=/2026
/app/sources/{source_id}?path=/2026/travel
```

`path` 永远表示存储源内部相对路径。

### 路径表达

REST API 使用 `source_id + path 查询参数`。

示例：

```text
GET /api/v1/sources/{source_id}/files?path=/2026
POST /api/v1/sources/{source_id}/folders
POST /api/v1/sources/{source_id}/upload?path=/2026
DELETE /api/v1/sources/{source_id}/files?path=/2026/a.jpg
```

禁止传真实磁盘路径。

### MVP 文件操作

MVP 支持：

1. 浏览目录。
2. 创建文件夹。
3. 上传文件。
4. 下载文件。
5. 删除文件或目录。
6. 重命名文件或目录。
7. 移动文件或目录。
8. 查看基础文件信息。

基础文件信息：

```text
name
type
size
mtime
```

MVP 不支持：

1. 在线预览。
2. 文件复制。
3. 跨存储源移动。
4. 批量移动。
5. 批量删除。
6. 版本历史。
7. 回收站。
8. 全文搜索。
9. 压缩包在线解压。
10. 分享链接。

### 上传同名冲突

网页端上传默认不覆盖。

规则：

1. 如果目标文件存在，返回 `409 Conflict`。
2. 前端提示用户是否覆盖。
3. 用户确认后重新上传并带 `overwrite=true`。
4. 后端只有收到 `overwrite=true` 才允许覆盖。
5. 文件不能覆盖目录。
6. 目录不能覆盖文件。

WebDAV `PUT` 可按协议习惯覆盖文件，但仍必须经过权限、路径、排除规则和锁检查。

### 删除规则

MVP 直接永久删除，不做回收站。

规则：

1. 前端必须弹出确认。
2. 删除非空目录时，确认文案必须明确提示会删除目录内所有内容。
3. 后端必须检查读写权限。
4. 后端必须检查路径安全。
5. 后端必须检查排除规则。
6. 后端必须检查 symlink。
7. 删除真实文件系统内容。

如果删除的是图床图片：

1. 同步删除 `Images` 表记录。
2. 避免图床历史墙残留失效图片。

### 移动和重命名

MVP 只支持同一存储源内移动和重命名。

禁止跨存储源移动。

目标路径已存在时返回 `409 Conflict`。

不做覆盖。

不做自动重命名。

目录不能移动到自身或自己的子目录。

### 文件复制

MVP 不做文件复制。

规则：

1. 网页端不提供复制按钮。
2. REST API 不提供复制接口。
3. WebDAV `COPY` 返回 `501 Not Implemented`。

V1.1 可考虑同一存储源内复制。

V2 可考虑跨存储源复制。

### 目录列表分页和排序

REST 文件列表使用实时扫描当前目录 + 过滤 + 排序 + 分页。

API 示例：

```text
GET /api/v1/sources/{source_id}/files?path=/2026&page=1&page_size=100&sort=name&order=asc
```

参数：

```text
page
page_size
sort = name | size | mtime | type
order = asc | desc
```

默认：

```text
page = 1
page_size = 100
max_page_size = 500
sort = name
order = asc
```

展示规则：

1. 目录排在文件前。
2. 同类型内按名称升序。
3. 隐藏 `.omnistore-upload-*`。
4. 隐藏公开侧 symlink。
5. 过滤排除规则命中的路径。

返回示例：

```json
{
  "data": {
    "items": [],
    "page": 1,
    "page_size": 100,
    "total": 238,
    "has_next": true
  },
  "request_id": "req_xxx"
}
```

MVP 不做数据库索引。

### 下载与 Range

MVP 文件下载必须流式返回，不允许整文件读入内存。

应支持 HTTP Range。

建议使用 Go：

```go
http.ServeContent
```

或等价实现。

支持入口：

1. 私有下载 API。
2. 公开 `/raw/*`。
3. 图床 `/i/{image_id}.{ext}`。
4. WebDAV `GET`。

### Content-Disposition

私有网盘下载按钮默认强制下载：

```text
Content-Disposition: attachment; filename="原始文件名"
```

公开 raw 和图床图片默认内联：

```text
Content-Disposition: inline
```

公开 raw 可通过参数强制下载：

```text
/raw/photos/a.pdf?download=1
```

文件名写入响应头前必须清理换行符等危险字符，防止 header 注入。

### 缓存策略

图床图片：

```text
Cache-Control: public, max-age=31536000, immutable
```

公开 raw 文件：

```text
Cache-Control: public, max-age=300
```

私有文件下载：

```text
Cache-Control: private, no-store
```

API JSON：

```text
Cache-Control: no-store
```

---

---

## 上传实现规范

### 上传大小限制

MVP 有三个独立大小限制：

```yaml
upload:
  max_file_size_mb: 1024

image_bed:
  user_max_file_size_mb: 20
  anonymous_max_file_size_mb: 10
```

含义：

1. 普通文件上传默认单文件最大 1024MB。
2. 登录用户图床默认单张图片最大 20MB。
3. 匿名图床默认单张图片最大 10MB。

超过限制返回：

```text
413 Payload Too Large
```

WebDAV `PUT` 受 `upload.max_file_size_mb` 限制。

### 不做分片和断点续传

MVP 只做普通流式上传。

不做：

1. 分片上传。
2. 断点续传。
3. 暂停继续。
4. 上传任务列表。
5. 失败恢复。
6. 分片 hash 校验。

### 临时文件位置

所有上传入口都必须先写临时文件，成功后再原子重命名。

临时文件必须放在最终目标文件所在的同一目录中。

示例：

目标：

```text
/data/photos/2026/a.jpg
```

临时文件：

```text
/data/photos/2026/.omnistore-upload-a1b2c3.tmp
```

成功后重命名：

```text
/data/photos/2026/a.jpg
```

原因：同目录内 `os.Rename` 基本可以保证在同一文件系统内原子完成。

禁止：

1. 直接写最终路径。
2. 上传一半覆盖原文件。
3. 默认把上传临时文件放在系统数据目录后跨磁盘移动。

### 覆盖上传

覆盖已有文件时：

1. 先写临时文件。
2. 写入完成。
3. 校验成功。
4. 原子替换目标文件。

不能边上传边覆盖原文件。

### 临时文件隐藏

所有列表入口必须隐藏：

```text
.omnistore-upload-*
```

包括：

1. 私有网盘。
2. 公开网盘。
3. WebDAV `PROPFIND`。
4. 图床访问。

V1.1 可加清理超过 24 小时的上传残留文件。

---
