# 私有网盘与文件操作

私有文件管理器、上传行为、冲突处理、下载与缓存等实现规范。

### 展示模型

1.0.0 私有网盘按存储源分区展示，不做统一虚拟目录树。

登录用户进入：

```text
/app
```

看到自己有权限访问的存储源列表。

进入某个存储源：

```text
/app/sources/{storage_key}?path=/
/app/sources/{storage_key}?path=/2026
/app/sources/{storage_key}?path=/2026/travel
```

`path` 永远表示存储源内部相对路径。

### 路径表达

REST API 内部使用系统生成的不透明 `key + path 查询参数`；网页路由会包含 key，但所有可见导航、标题和详情均展示存储源名称，不要求用户理解或输入 key。

示例：

```text
GET /api/v1/sources/{storage_key}/files?path=/2026
POST /api/v1/sources/{storage_key}/folders
POST /api/v1/sources/{storage_key}/upload?path=/2026
DELETE /api/v1/sources/{storage_key}/files?path=/2026/a.jpg
```

禁止传真实磁盘路径。

### 1.0.0 文件操作

V1 阶段支持：

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

V2 阶段在上述能力上补齐复制、跨来源移动、分享、回收站和搜索。分享的完整语义见 [文件与目录分享](sharing.md)。1.0.0 仍不支持：

1. 在线预览。
2. 批量移动。
3. 批量删除。
4. 版本历史。
5. 压缩包在线解压。

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

网页端普通删除进入回收站，永久清理必须使用明确的二次确认入口。WebDAV、S3 和图床自身的协议删除仍为永久删除，不伪装成可恢复操作。

规则：

1. 前端必须弹出确认。
2. 删除非空目录时，确认文案必须明确提示会删除目录内所有内容。
3. 后端必须检查读写权限。
4. 后端必须检查路径安全。
5. 后端必须检查排除规则。
6. 后端必须检查 symlink。
7. 把真实内容移到系统 `data/trash/{trash_key}/payload`，不在用户存储源中创建回收站目录或 sidecar。
8. 删除后立即释放存储源物理配额，但文件仍归原所有者并占用用户配额；永久清理后才释放用户配额。
9. 普通用户只看到自己删除的条目；超级管理员可查看来源内全部回收站条目。
10. 恢复默认使用原路径，也允许指定同一来源内的新路径；父目录必须存在，且不覆盖已有内容。
11. 恢复重新校验路径权限、排除规则、symlink、WebDAV 持久锁和存储源配额。

如果移入回收站的是图床图片：

1. `images.trash_key` 标记回收状态，历史墙与公开读取暂时隐藏该图片。
2. 恢复时清除标记并同步新路径，原公开 URL 重新有效。
3. 永久清理时删除图片记录；缩略图作为可重建缓存按清理策略回收。

存储源回收站非空时不能删除该存储源的 OmniStore 配置，必须先恢复或永久清理，避免系统回收站内容成为孤儿。

### 移动和重命名

1.0.0 支持同一来源移动/重命名和跨来源移动。

目标路径已存在时返回 `409 Conflict`。

不做覆盖。

不做自动重命名。

同一来源内，目录不能移动到自身或自己的子目录。跨来源移动先完整写入目标、同步台账和图床定位，再删除源路径；目标写入或台账同步失败时必须清理目标，保留源路径。

### 文件复制

1.0.0 支持文件和目录复制，可选择当前或其他有写权限的存储源。

规则：

1. 网页端对可读取的普通文件和目录提供复制按钮；只读来源可复制到有写权限的目标。
2. 目标路径必须包含最终文件名或目录名，父目录必须已存在。
3. 目标已存在时返回 `409 Conflict`，不覆盖、不自动改名。
4. 目录复制递归拒绝排除路径、symlink 和其他不支持的文件类型，不产生部分可见结果。
5. 复制产生的新文件归执行用户所有，同时受目标来源配额和执行用户配额约束。
6. 跨来源移动保留已有文件所有权；未进入台账的文件保持 `unowned`，不会凭访问权限猜测所有者。
7. 同来源与跨来源复制先写目标同级隐藏 staging，完整同步后原子发布；跨来源移动使用持久阶段日志。两者统一经过生命周期锁、路径锁与 WebDAV 持久锁检查，启动时会回滚未提交复制或继续已提交移动。
8. 图床文件跨来源移动时更新 `images.storage_source_id` 与 `relative_path`，公开 URL 保持有效；复制不会复制图床公开记录。
9. WebDAV `COPY` 仍返回 `501 Not Implemented`，不把私有 REST 能力伪装成完整 WebDAV COPY 语义。
10. 同来源移动/重命名与永久删除先写恢复意图；图片、有效分享和文件台账在同一事务内更新，启动恢复会回滚未提交移动或继续完成删除。

REST 请求：

```http
POST /api/v1/sources/{source_key}/files/copy
POST /api/v1/sources/{source_key}/files/move
```

```json
{
  "path": "/source/item",
  "target_source_key": "src-target-key",
  "target_path": "/archive/item"
}
```

### 目录列表分页和排序

REST 文件列表使用实时扫描当前目录 + 过滤 + 排序 + 分页。

API 示例：

```text
GET /api/v1/sources/{storage_key}/files?path=/2026&page=1&page_size=100&sort=name&order=asc
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

实时目录列表不依赖数据库索引，始终以真实文件系统为准。全局搜索使用 active 文件台账的 FTS5 trigram 索引，支持跨来源文件名/路径查询、来源筛选和分页；两个字符的关键字使用字面包含查询。回收站、禁用来源、无权来源和排除路径不会进入结果，外部直接修改在台账校准后反映到索引。

### 下载与 Range

1.0.0 文件下载必须流式返回，不允许整文件读入内存。

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
2. 同步临时文件和父目录，并持久化上传意图。
3. 把旧目标改名为同目录内部备份。
4. 原子安装并同步新目标。
5. 提交文件台账和 `database-ready` 阶段标记。
6. 删除旧备份与操作日志。

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

普通文件与图床上传都采用 journal-first：先生成 operation ID 与临时路径并持久化 planned journal，随后才创建临时文件；临时文件完整写入并 fsync 后，再持久化 prepared journal，最后进入 rename 与 SQLite 提交阶段。启动恢复只处理 journal 明确引用的临时文件和备份。

安全边界：

1. 文件名不能证明内部所有权；没有 journal 的同名文件一律不删除。
2. planned journal 中断时，只回滚它明确引用的临时路径，不触碰最终路径。
3. prepared journal 持久化后，恢复器才允许根据摘要、备份与 SQLite 阶段标记完成或回滚上传。
4. `.omnistore-upload-*` 与 `.omnistore-copy-*` 是 API 新建路径的系统保留名，但外部已存在的同名文件仍按用户数据对待。

---
