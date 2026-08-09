# API 约定

本文档定义 API 的统一成功响应、列表响应、错误响应与 MVP 错误码。具体路由行为同时参见各功能文档。

### 成功响应

```json
{
  "data": {},
  "request_id": "req_xxx"
}
```

### 列表响应

```json
{
  "data": {
    "items": [],
    "total": 0
  },
  "request_id": "req_xxx"
}
```

### 错误响应

```json
{
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "文件不存在",
    "details": {}
  },
  "request_id": "req_xxx"
}
```

### MVP 错误码

```text
UNAUTHORIZED
FORBIDDEN
SOURCE_NOT_FOUND
POLICY_NOT_FOUND
SOURCE_DISABLED
PATH_INVALID
PATH_EXCLUDED
FILE_NOT_FOUND
FILE_ALREADY_EXISTS
TOKEN_NOT_FOUND
CONFLICT
LOCKED
VALIDATION_ERROR
PAYLOAD_TOO_LARGE
INSUFFICIENT_STORAGE
RATE_LIMITED
INTERNAL_ERROR
NOT_IMPLEMENTED
```

HTTP 状态码：

```text
401 UNAUTHORIZED
403 FORBIDDEN
404 NOT_FOUND
409 CONFLICT
423 LOCKED
400 VALIDATION_ERROR
413 PAYLOAD_TOO_LARGE
429 RATE_LIMITED
507 INSUFFICIENT_STORAGE
501 NOT_IMPLEMENTED
500 INTERNAL_ERROR
```

## 账号安全与凭据恢复

登录用户修改自己的密码：

```http
POST /api/v1/me/password
```

请求体为 `{ "old_password": "...", "new_password": "..." }`。成功后当前请求使用的 Session 保留，属于该用户的其他 Web Session 在同一数据库事务中删除；旧密码立即失效。WebDAV、图床和 S3 等长期客户端凭据不会因普通改密自动删除。

超级管理员可以对其他账号执行紧急凭据撤销：

```http
POST /api/v1/admin/users/{id}/revoke-credentials
```

该操作原子删除目标账号的全部 Web Session、WebDAV Token、图床 Token 和 S3 Key，响应返回四类记录的实际撤销数量。账号本身不会禁用，文件、分享和访问策略不会删除，用户仍可使用密码重新登录并签发新凭据。管理员不能通过该入口撤销自己的凭据；操作成功会记录 `revoke_user_credentials` 管理审计事件。

## 文件与目录分享

登录用户管理分享：

```http
GET    /api/v1/shares
POST   /api/v1/shares
DELETE /api/v1/shares/{share_key}
```

创建请求示例：

```json
{
  "source_key": "src-generated-value",
  "path": "/team/demo.pdf",
  "password": "optional-password",
  "expires_at": "2026-08-16T12:00:00Z",
  "max_downloads": 20
}
```

目标可以是普通文件或目录。创建者必须对目标文件或整个目录子树具备写权限；密码可空，有效期可空且最长 365 天，`max_downloads=0` 表示不限。成功响应包含系统生成的 `share_key` 和由 `public_url` 组成的完整 `url`。

公开访问接口：

```http
GET  /api/v1/public/shares/{share_key}
POST /api/v1/public/shares/{share_key}/unlock
GET  /api/v1/public/shares/{share_key}/browse?path=&page=1&page_size=50
GET  /share/{share_key}/raw/{child_path...}
HEAD /share/{share_key}/raw/{child_path...}
```

公开摘要只返回显示所需的名称、类型、是否需要密码、当前会话是否已解锁、有效期和下载计数。解锁请求为 `{ "password": "..." }`，成功后设置短期 HttpOnly Cookie。`GET raw` 消耗一次下载额度，`HEAD` 不消耗；`download=1` 强制 attachment。失效、撤销、次数耗尽、目标缺失和禁用来源在公开侧统一为 404。

## WebDAV 持久锁

`/dav/{storage_key}/{path}` 支持 RFC 4918 `LOCK / UNLOCK`。`storage_key` 由系统生成，客户端应直接使用连接信息中给出的地址。新建独占写锁时请求体使用 `DAV:lockinfo`，响应返回 `Lock-Token` 与 `DAV:lockdiscovery`；刷新锁使用无请求体的 `LOCK` 和包含单个 Token 的 `If` 头；解锁使用 `Lock-Token` 头。

未提交覆盖目标路径的锁 Token 时，`PUT / MKCOL / DELETE / MOVE` 返回 `423 Locked`。REST 等其他文件写入口同样返回统一的 `LOCKED` 错误。

成功 `DELETE` 会清理被删除资源及后代资源自身的锁；成功 `MOVE` 不把源路径上的锁迁移到目标路径。锁在源路径之外的祖先资源上时仍保留，并按目标路径重新判断是否覆盖。

## 存储源已有目录预检

管理员在创建存储源前可预检服务端已有目录：

```http
POST /api/v1/admin/sources/preflight
```

请求默认采用新建存储源的建议排除规则；显式传入 `exclude_patterns`（包括空数组）时改用指定规则：

```json
{
  "root_path": "/mnt/photos",
  "exclude_patterns": ["**/.git/**", "**/.env"]
}
```

接口执行与正式创建相同的真实路径解析、敏感目录、系统数据目录、存储源重叠及读写能力校验。成功响应包含规范化后的 `root_path`、首层条目分类统计、最多 20 个按名称排序的可见条目、实际采用的排除规则和风险提示：

```json
{
  "data": {
    "root_path": "/mnt/photos",
    "is_empty": false,
    "summary": {
      "total_entries": 12,
      "visible_entries": 10,
      "files": 8,
      "directories": 2,
      "symlinks": 0,
      "unsupported_entries": 0,
      "excluded_entries": 2
    },
    "entries": [{ "name": "2026", "kind": "directory" }],
    "sample_truncated": false,
    "exclude_patterns": ["**/.git/**", "**/.env"],
    "warnings": ["该目录已有内容；创建后会直接作为存储源显示，文件不会被移动、复制或写入索引。"]
  },
  "request_id": "req_xxx"
}
```

预检只读取目录首层，不建立文件索引、不移动或修改已有内容。读写能力校验会创建并立即删除一个严格命名的临时测试文件。`POST /api/v1/admin/sources` 在真正写入配置前仍会重新执行全部路径校验，不能把预检结果当作长期授权凭据。

正式创建请求必须提供 `name` 与 `root_path`，可选 `description`、`exclude_patterns`；不接受用户自定义存储源标识。服务端生成 `src-` 加 16 位小写十六进制随机 key 并随响应返回，前端仅将其作为不透明路由参数。

## 存储源硬配额

管理员通过存储源更新接口设置 `quota_bytes`，单位为字节；`0` 表示不限制，负数返回 `400 VALIDATION_ERROR`。管理员详情响应除 `source` 和 `exclude_patterns` 外还包含实时 `quota` 摘要。

有该存储源读取权限的登录用户可以查询：

```http
GET /api/v1/sources/{source_key}/quota
```

响应示例：

```json
{
  "data": {
    "usage_bytes": 1048576,
    "quota_bytes": 1073741824,
    "remaining_bytes": 1072693248,
    "unlimited": false
  },
  "request_id": "req_xxx"
}
```

用量是存储源全部普通文件的实时物理统计。超过硬配额的 REST 或图床写入返回 `507 INSUFFICIENT_STORAGE`；WebDAV 返回 HTTP 507；S3 返回 HTTP 507 和 XML 错误码 `InsufficientStorage`。覆盖文件超限时原文件不变，降低配额不会自动删除已有文件。

## 访问策略

超级管理员通过以下接口管理存储源及子路径访问策略：

```http
GET    /api/v1/admin/policies
POST   /api/v1/admin/policies
GET    /api/v1/admin/policies/{policy_key}
PUT    /api/v1/admin/policies/{policy_key}
DELETE /api/v1/admin/policies/{policy_key}
```

创建和更新均采用整体替换语义：

```json
{
  "name": "内容团队",
  "description": "内容团队日常访问",
  "sources": [
    {
      "source_key": "src-generated-value",
      "permission": "read_only",
      "path_rules": [
        { "path_prefix": "team/drafts", "permission": "read_write" },
        { "path_prefix": "team/drafts/archive", "permission": "read_only" }
      ]
    },
    { "source_key": "src-another-value", "permission": "read_only", "path_rules": [] }
  ],
  "user_ids": [2, 3]
}
```

`policy_key` 由服务端生成，格式为 `pol-` 加 16 位小写十六进制随机字符串。
普通用户只能访问其绑定策略授予的存储源；多个策略命中同一存储源时，
`read_write` 高于 `read_only`。超级管理员始终拥有全部存储源读写权限。
策略可以暂时不包含规则或用户，便于先创建再配置。删除策略会立即撤销由该策略产生的权限，
不会删除存储源或真实文件。

`permission` 是单个策略的源级默认权限；`path_rules` 可省略或为空。`path_prefix` 必须是非空的
源内相对路径，服务端会折叠斜杠并拒绝 `.`、`..`、控制字符及规范化后重复规则。同一策略采用
最长路径前缀，多策略再取最高权限。目录删除、重命名和移动还要求整棵受影响子树可写。

文件管理器可查询当前目录的最终权限：

```http
GET /api/v1/sources/{source_key}/permission?path=/team/drafts
```

响应为 `{ "permission": "read_only" }` 或 `{ "permission": "read_write" }`。文件 API、WebDAV、
S3 和登录用户图床在执行实际操作时仍会独立校验，客户端不得把该响应当作长期授权凭据。

## 文件复制与移动

复制和移动使用完整目标路径；`target_source_key` 可省略，省略时表示当前存储源：

```http
POST /api/v1/sources/{source_key}/files/copy
POST /api/v1/sources/{source_key}/files/move
```

```json
{
  "path": "/photos/a.jpg",
  "target_source_key": "src-target-key",
  "target_path": "/archive/a.jpg"
}
```

源路径必须可读；移动还要求源子树可写，目标子树始终要求可写。目标父目录必须存在，目标本身不能存在。成功响应包含 `path`、`files`、`bytes`、`source_key`、`target_source_key` 和 `was_move`。复制的新文件归执行用户所有；跨来源移动保留原台账归属。

## 回收站

登录用户按存储源管理自己删除的内容；超级管理员可以看到该来源的全部条目：

```http
GET    /api/v1/sources/{source_key}/trash
POST   /api/v1/sources/{source_key}/trash/{trash_key}/restore
DELETE /api/v1/sources/{source_key}/trash/{trash_key}
```

普通文件接口的 `DELETE /api/v1/sources/{source_key}/files?path=...` 返回创建的回收站条目。`trash_key` 是服务端随机生成的内部定位符，界面只展示名称、原路径、大小和删除时间。

恢复请求可传空字符串使用原路径，或指定同一存储源内的新路径：

```json
{ "target_path": "/restored/item" }
```

目标已存在返回 `FILE_ALREADY_EXISTS`，来源配额不足返回 `INSUFFICIENT_STORAGE`。永久清理不可恢复，并释放条目仍占用的用户配额。

## 全局文件搜索

登录用户可跨自己有权访问的存储源搜索 active 普通文件：

```http
GET /api/v1/search?q=report&source_key=src-xxx&page=1&page_size=20
```

参数规则：

1. `q` 必填，去除首尾空格后为 2–128 个字符；匹配文件名及完整相对路径。
2. `source_key` 可选；未提供时搜索全部可访问来源，不存在或无权访问的来源返回空结果，避免枚举来源。
3. `page` 默认 1；`page_size` 默认 20，最大 100。
4. 结果只包含 `active` 文件台账；回收站、禁用来源和排除路径不会返回。

每个结果包含 `source_key`、`source_name`、`path`、`parent_path`、`name`、`size` 和 `modified_at`。搜索命中来自 SQLite 索引；下载或打开目录时仍由真实文件系统与实时权限检查决定最终结果。

## 图床 Token 管理

登录用户可以管理自己的命名图床 Token：

```http
GET    /api/v1/me/tokens/image-bed
POST   /api/v1/me/tokens/image-bed
DELETE /api/v1/me/tokens/image-bed/{token_id}
```

创建请求：

```json
{
  "label": "MacBook PicGo"
}
```

创建响应中的 `token` 是明文，仅返回一次；`item` 只包含 `token_id`、名称、创建时间和最近使用时间。每个用户最多保留 10 个图床 Token，达到上限时返回 `CONFLICT`。删除接口只能撤销当前用户自己的 Token，不存在时返回 `TOKEN_NOT_FOUND`。

兼容接口 `POST /api/v1/me/tokens/image-bed/reset` 仍可用，其语义为撤销当前用户的全部图床 Token，并创建一个新的“默认 Token”。

## S3 凭据管理

登录用户管理自己的 S3 Access Key：

```http
GET    /api/v1/me/s3-credentials
POST   /api/v1/me/s3-credentials
POST   /api/v1/me/s3-credentials/{access_key_id}/disable
POST   /api/v1/me/s3-credentials/{access_key_id}/enable
DELETE /api/v1/me/s3-credentials/{access_key_id}
```

创建请求为 `{ "name": "MacBook rclone" }`。响应中的 `secret_access_key` 只返回一次；
后续列表仅包含 Access Key ID、名称、禁用状态、创建时间和最近使用时间。每用户最多 10 个，
所有写接口要求 Cookie Session 和 CSRF Token。

## 图床缩略图

图床图片记录新增派生字段：

```json
{
  "public_url": "https://store.example.com/i/img_xxx.png",
  "thumbnail_url": "https://store.example.com/t/img_xxx.jpg"
}
```

`public_url` 仍用于查看和复制原图；历史墙使用 `thumbnail_url` 预览。公开缩略图接口：

```http
GET /t/{image_id}.jpg
```

成功响应为 `image/jpeg`，最长边不超过 480px，包含 `ETag` 和 `Cache-Control: public, max-age=3600`。`If-None-Match` 命中时返回 `304 Not Modified`。图片记录不存在、物理文件不可访问或存储源已禁用时返回 404。

## 审计日志查询

管理员接口：

```http
GET /api/v1/admin/audit-logs
```

支持的查询参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `page` | `1` | 页码，必须为正整数 |
| `page_size` | `50` | 每页条数，范围为 1–200 |
| `actor_type` | 空 | `user`、`anonymous` 或 `system` |
| `entry_type` | 空 | `web`、`webdav`、`s3`、`image_bed`、`anonymous_image_bed`、`admin` 或 `cli` |
| `status` | 空 | `success` 或 `failed` |
| `q` | 空 | 在动作、存储源、源/目标路径、IP 和错误码中进行文字匹配，最多 128 个字符 |

筛选条件之间采用 AND 关系，结果按 `id` 倒序返回。响应沿用统一列表结构，`total` 表示筛选后的记录总数。非法参数返回 `VALIDATION_ERROR`。

## 公开挂载路径重定向

管理员修改存储源的 `public_mount_path` 时，原路径会自动保存为该存储源的旧路径。旧路径不会出现在公开挂载列表中，但继续参与挂载路径的唯一性和互相包含校验，不能被其他存储源占用。

以下入口命中旧路径时返回 `308 Permanent Redirect`：

```http
GET /p/{old_mount_path...}
GET /raw/{old_mount_path...}
GET /api/v1/public/browse?path={old_mount_path...}
```

重定向会保留挂载路径之后的子路径和原查询参数。例如 `/raw/photos/2026/a.jpg?download=1` 在挂载路径从 `/photos` 改为 `/archive` 后，会重定向到 `/raw/archive/2026/a.jpg?download=1`。

旧路径动态指向同一存储源的当前挂载路径，因此连续修改不会形成重定向链。出现以下任一情况时，旧路径返回 404 而不重定向：

1. 存储源已禁用。
2. 公开访问已关闭。
3. 当前公开挂载路径已清空。
4. 存储源已删除。

## 导出系统配置包

超级管理员可以手动下载当前实例的系统配置包：

```http
GET /api/v1/admin/system/config-export
```

成功响应为 `application/zip` 附件，不使用 JSON envelope。文件名格式为：

```text
omnistore-system-config-YYYYMMDDTHHMMSSZ.zip
```

ZIP 包含：

1. `manifest.json`：格式版本、应用版本、导出时间、内容清单、清理状态清单和敏感标记。
2. `config/effective-config.yaml`：默认值、配置文件和环境变量合并后的生效配置。
3. `database/omnistore.db`：通过 SQLite `VACUUM INTO` 生成并清理瞬时状态的一致性快照。
4. `keys/`：系统数据目录中 `keys/` 下的普通文件，不跟随符号链接。
5. `RESTORE.md`：恢复边界和操作提示。

配置包明确不包含真实存储源文件、回收站载荷、缓存、上传临时文件和日志。由于这些外部载荷无法随包恢复，SQLite 副本会删除 Web 登录 Session、密码分享访问 Session、WebDAV 锁、未完成 S3 Multipart 状态及回收站元数据，再压缩并执行外键检查；清理不影响在线数据库。有效分享及长期 WebDAV、图床和 S3 凭据仍会保留，恢复后用户需要重新登录并重新解锁密码分享。

该端点导出的是可恢复的“系统配置快照”，不是在线数据库的逐字节副本，也不能替代存储源文件备份。响应使用 `Cache-Control: private, no-store`；成功与失败都会记录 `export_system_config` 管理审计事件。配置包仍包含密码及长期 Token 哈希，也可能包含密钥材料，应按敏感备份凭据保管。

---
