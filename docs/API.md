# API 约定与 2.0 目标接口

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

现有 `/api/v1` 可继续使用。2.0 是产品 Major Version，不要求为了版本号机械创建 `/api/v2`。

如果现有 endpoint 语义发生冲突，可以破坏性修改，但前后端必须同一提交更新。

## 1. 通用

成功：

```json
{
  "data": {},
  "request_id": "req_xxx"
}
```

错误：

- stable error code；
- message；
- request_id。

## 2. Storage Source

Admin Source API 不再返回/接收：

```text
public_read_enabled
public_mount_path
image_bed_enabled
```

增加：

```text
webdav_enabled
s3_enabled
```

普通 User Source View 可返回：

```text
key
name
description
permission
webdav_enabled
s3_enabled
quota
```

## 3. Site Capability

当前接口：

```text
GET /api/v1/admin/capabilities
PUT /api/v1/admin/capabilities/{capability}
```

capability：

```text
public_drive
image_bed
transfer_center
```

Body：

```json
{
  "enabled": true,
  "storage_source_key": "src-..."
}
```

更新前：

- Source exists/enabled；
- root accessible；
- service namespace collision check（需要时）；
- audit。

静态 HTTP 不属于 Site Capability；使用各源的 `/api/v1/admin/sources/{key}/static-access/*` 接口。

## 4. Public Drive

固定：

```text
GET /public/*
GET /api/v1/public/files?path=...
```

不再接受 mount name。

后端自动解析当前 `public_drive` binding。

## 5. Image Bed

快速图床上传 API 不接受 Source 或目标目录选择；按路径管理的博客图片/视频使用普通文件上传，不走此接口。

后端解析当前 `image_bed` binding。

旧 image URL：

```text
/i/{image_id}.{ext}
```

保持。

## 6. Protocol

S3：

```text
bucket = storage_key
```

WebDAV：

```text
/dav/{storage_key}/...
```

若现有路由不同，可保留现有前缀，但 Source segment 必须是 key。

## 7. Transfer — Identity / Owner

本节及第 8–10 节描述当前实现基线。

`/transfer` 与 `/app/transfer` 共用发送、收集和收发记录界面。详情地址采用 `?view=history&record=send|collect&id={id}`，所有者 API 使用数字 ID；公开链接使用 publicKey，两者不互换。

### 中转身份

```http
GET  /api/v1/transfer-identity
POST /api/v1/transfer-identity
```

GET 只读取已有身份：优先返回有效登录用户，其次返回有效访客；均不存在时返回 `401 UNAUTHORIZED`。POST 发送 JSON `{}`，同源验证后复用已有身份，或创建新的访客身份；无需在首次建立时提供尚不存在的访客 CSRF。跨站请求返回 `403 FORBIDDEN`，建立身份频率超限返回 `429 RATE_LIMITED`。重复读取或 POST 复用不延长访客期限，也不轮换 CSRF。

身份响应经通用 `data` 包装，并使用 `Cache-Control: no-store` 与 `Vary: Cookie`：

| 字段 | 访客 | 登录用户 |
| --- | --- | --- |
| `kind` | `guest` | `user` |
| `owner_key` | `guest:{id}` | `user:{id}` |
| `csrf_token` | 当前访客身份的稳定 Token | 当前登录会话的 CSRF Token |
| `expires_at` | 访客身份截止时间 | 登录会话截止时间 |
| `max_expiry_hours` | 身份剩余小时数，向上取整 | 0，未施加访客任务期限限制 |
| `limits` | `{ max_file_size, max_active_bytes, max_active_tasks }` | null |

`owner_key` 用于隔离当前所有者的界面和查询状态，不是授权凭据；`limits` 的字节字段是上限，不是剩余容量。访客任务 DTO 的 `owner_user_id` 为 0，不代表一个可登录用户。

有效登录用户优先使用原登录身份。访客使用独立的 `omnistore_transfer_guest` Cookie（HttpOnly、SameSite=Lax、Path=/api/v1，Secure 随 `security.cookie_secure` 配置），不创建普通用户或登录会话。访客拥有自己的中转任务，不能访问他人任务或普通来源 API。写入所有者接口需携带身份响应的 `X-CSRF-Token`，缺失或不匹配返回 403；过期身份返回 401 并清除 Cookie。公开 Bearer 解锁/领取/提交与所有者身份分开。

访客身份期限最多为配置的 Web 会话期限与 7 天中的较小值。访客任务截止时间不晚于身份期限；网页提供 1 天选项。访客最多 20 个活跃发送/收集任务，活跃载荷不超过 1 GiB；单文件限制同时取上传配置和访客上限，身份返回值还受站点中转配额收紧。存储源物理配额在写入时继续检查，身份响应不是可写剩余空间承诺。身份建立与创建任务按客户端 IP 限流。

当前没有邮箱授权、邮件发送、跨设备恢复或登录后自动接管访客任务的接口。

### 发件包所有者接口

```http
GET    /api/v1/transfers
POST   /api/v1/transfers
GET    /api/v1/transfers/{transferID}
DELETE /api/v1/transfers/{transferID}
GET    /api/v1/transfers/{transferID}/files
POST   /api/v1/transfers/{transferID}/files/upload
POST   /api/v1/transfers/{transferID}/files/from-store
POST   /api/v1/transfers/{transferID}/finalize
```

列表返回当前所有者最近 200 条。详情与文件清单按 ID 单独授权，详情不要求出现在列表窗口中。非所有者读取/修改返回 `404 FILE_NOT_FOUND`。

创建发送草稿的 JSON 示例：

```json
{
  "title": "项目资料",
  "description": "请查收",
  "expires_in_hours": 24,
  "require_code": false,
  "max_downloads": 10,
  "password": "optional-password"
}
```

响应为 `{ send, pickup_code }`。`require_code=false` 时 `pickup_code` 为空；启用时生成 8 位随机码，只在创建响应中返回一次明文。列表与详情仅返回 `require_code`、`has_password`，不返回密码或短码。

省略 `require_code` 按 `true` 处理；网页默认关闭并显式发送 false。`v2.0.0` 迁移的 `require_code` 列默认 `1`，未显式关闭的任务仍要求短码。`expires_in_hours` 省略使用站点默认值，登录用户可用 0 表示不过期；访客不接受 0，任务期限受身份截止时间限制。`max_downloads` 省略表示不限，设置时必须是正整数。

上传为 multipart：单个 `file` 与 `relative_path`。`files/from-store` 的 JSON 为 `{ source_key, paths }`，需要真实登录和来源子树读取权限；访客身份不能使用。定稿至少需要一个文件；已 active 的包拒绝继续上传。

### 收集任务所有者接口

```http
GET  /api/v1/transfer-collections
POST /api/v1/transfer-collections
GET  /api/v1/transfer-collections/{collectionID}
POST /api/v1/transfer-collections/{collectionID}/close
GET  /api/v1/transfer-collections/{collectionID}/submissions
GET  /api/v1/transfer-collections/{collectionID}/submissions/{submissionID}/files/{fileID}/download
POST /api/v1/transfer-collections/{collectionID}/submissions/{submissionID}/save-to-files
```

创建 JSON 示例：

```json
{
  "title": "材料收集",
  "description": "请上传 PDF",
  "expires_in_hours": 24,
  "require_code": false,
  "require_name": true,
  "require_note": false,
  "allowed_exts": ["pdf"],
  "max_file_size_mb": 20,
  "max_total_size_mb": 200
}
```

响应为 `{ collection, code }`；短码默认兼容规则与发件包一致。可选 `password` 独立于 require_code。大小参数设置时必须为正整数，以 MiB 换算为字节；`max_total_size_mb` 限制该收集任务所有提交的累计大小。

列表同样限制最近 200 条，详情按 ID 单独授权。关闭后停止公开提交，所有者仍可读取已有批次。收件箱仅列出已提交文件清单的批次，不显示上传期间的空占位记录。批次与文件 ID 必须同时属于路径指定的收集任务；访客所有者可以读取自己的批次和下载文件。

`close` 不删除文件，也不释放已保留载荷的站点/访客字节配额；关闭后的原期限不变，到期后 GC 回收载荷。没有期限的已关闭任务持续保留，进行中任务数量可减少，但运维用量仍包含其文件。所有者下载与保存接口在关闭后继续可用。

`save-to-files` JSON 为 `{ source_key, path }`，仅真实登录所有者可用，并要求目标目录写权限。响应为 `{ saved: [相对路径] }`。复制不覆盖同名目标，不删除原提交，也不改变原任务期限。

管理员配置使用 `GET/PUT /api/v1/admin/transfer-settings`，字段为 `active_quota_bytes` 与 `default_expiry_hours`，0 分别表示活跃总量不限与默认不过期。写操作需要管理员权限和登录 CSRF。

## 8. Transfer — Public

公开页面直接打开：

```text
/pickup/{publicKey}
/collect/{publicKey}
```

公开元信息与解锁接口：

```http
GET  /api/v1/public/transfers/{publicKey}
POST /api/v1/public/transfers/{publicKey}/unlock
GET  /api/v1/public/transfer-collections/{publicKey}
POST /api/v1/public/transfer-collections/{publicKey}/unlock
```

两个公开摘要均返回标题、说明、`require_code`、`has_password` 和截止时间。发送摘要增加文件数量、大小、剩余下载次数；收集摘要增加单文件上限、允许扩展名和姓名/留言要求，不返回他人的提交。

发件包 unlock JSON 为 `{ pickup_code, password }`，收集 unlock 为 `{ code, password }`。只校验任务启用的条件；两项均关闭时可发送空字符串，取得访问会话后直接继续。响应为 `{ token, expires_at }`，会话最多 12 小时且不超过任务期限。每个 IP + 任务组合限制解锁尝试；429 返回 `RATE_LIMITED`。

后续请求携带 `Authorization: Bearer {token}`：

```http
GET  /api/v1/public/transfers/{publicKey}/files
GET  /api/v1/public/transfers/{publicKey}/files/{fileID}/download
GET  /api/v1/public/transfers/{publicKey}/files/{fileID}/raw
GET  /api/v1/public/transfers/{publicKey}/archive
POST /api/v1/public/transfer-collections/{publicKey}/submit
```

访问会话只属于指定任务，不授予创建/管理权限；Token 不放入 URL。raw 与 download 共用处理器，`inline=1` 调整响应呈现方式；当前公开取件界面只提供下载，没有新增预览流程。

不存在、撤销、未激活任务或无效访问会话可能返回 `404 FILE_NOT_FOUND`。截止时间已到或收集已关闭返回 `409 TRANSFER_EXPIRED`；已被清理标记为终态的任务也可能返回 404。密码错误/下载次数用完返回 `403 FORBIDDEN`，短码错误返回 `400 VALIDATION_ERROR`。公开页通过重新获取元信息区分失效会话与不可用任务，保留当前收集草稿供重新验证。

公开 API 不返回真实源路径、源身份、所有者私密信息或其他提交。文件清单中的 `relative_path` 是包内逻辑路径，不是内部载荷路径。没有短码检索入口或公开收件箱接口。

## 9. Transfer Upload

发送草稿上传一次请求一个文件，保留本次任务内的 `relative_path`，由服务端映射到 `.omnistore/transfer/`。前端选择文件/文件夹并保留层级，失败项单独重试；全部文件成功后才定稿。

收集公开提交为一次 multipart 批次：可含 `name`、`note`、N 个 `relative_path` 与 N 个 `file`，路径与文件按各自字段数组的索引一一配对。两种字段数量必须一致且非空。当前不提供单独的公开 submission 创建、续传或 finalize 接口。

服务端验证访问会话、任务状态、相对路径、类型、必填信息、单文件与累计大小限制、访客所有者/站点/源配额。任一文件失败回滚本批记录并删除本批载荷；成功返回本批 `file_count`、`total_size` 等回执。客户端错误或重新验证不清空文件和填写内容。

进程中断后，启动恢复根据持久日志、任务源和文件台账收敛：未提交的收集批次整体回滚，已提交批次保留。发送上传日志同时记录精确临时路径，以便立即清理中断载荷。无法证明托管根或任务归属时保留证据并阻止启动。没有新增续传、请求幂等键或自动重试接口；响应丢失不能据此推断提交失败。

GC 不再按临时文件名前缀或数字目录名推断所有权；没有台账/日志证明的旧遗留内容保留供管理员核查。清理响应保留 `orphan_temp_removed`、`orphan_dirs_removed` 字段以兼容调用者，两个旧扫描计数为 0。活跃或待恢复上传对应的占位/草稿不会被作为普通超时记录删除。

## 10. Download Count

发送任务的文件下载与 ZIP 在服务端原子预占名额；同一访问会话对同一目标（单文件或整包）只计一次，Range 续传、失败重试与并发重复请求复用该名额，不同目标或重新解锁的新会话仍各自计数。总额由条件 UPDATE 限制，不会超过 `max_downloads`。文件打开失败或响应流中断不返还已计次数，但同一会话重试同一目标不会再次消耗。

文件列表、元信息和 unlock 不占下载次数。ZIP 流式生成，计一次请求；公开下载响应使用 no-store。静态 HTTP 和图床直链不创建或扣减 Transfer 下载次数。

## 11. 仪表盘与运行维护

当前接口（管理员权限）：

```text
GET  /api/v1/admin/overview
GET  /api/v1/admin/operations/status
POST /api/v1/admin/sources/{key}/reconcile
POST /api/v1/admin/operations/cleanup
POST /api/v1/admin/operations/integrity-check
```

仪表盘只请求 `/admin/overview`，返回 `system`（连接配置）、`operations`（与 `/operations/status` 相同的完整健康快照）及 `anonymous_image_bed_on`。用户数读取 `operations.database.table_rows.users`，全部存储源在 `operations.sources`，含 `root_path`、协议开关、禁用状态、目录可访问性与用量。旧概览的用户/权限/审计明细和独立源摘要已移除。

维护动作沿用现有接口；完成后重新获取仪表盘快照。

## 12. Backup

建议：

```text
POST /api/v1/admin/backups
POST /api/v1/admin/restore/preflight
POST /api/v1/admin/restore
```

Restore 是高风险操作，必须有明确交互确认和服务状态约束。

## 13. 按源静态 HTTP 配置

以下管理接口要求超级管理员，写操作需要 CSRF。路径指定存储源，静态访问不进入 Site Capability API。

```http
GET    /api/v1/admin/sources/{key}/static-access/config
POST   /api/v1/admin/sources/{key}/static-access/config
PUT    /api/v1/admin/sources/{key}/static-access/config
DELETE /api/v1/admin/sources/{key}/static-access/config
POST   /api/v1/admin/sources/{key}/static-access/preflight
POST   /api/v1/admin/sources/{key}/static-access/rebind
```

GET 对未配置源返回默认关闭的视图，public_asset_id/base_url 为空。POST 创建并启用发布配置：

```json
{
  "publish_root": "blog-assets",
  "public_origin": "https://files.example.com",
  "cache_mode": "short",
  "cors_mode": "public",
  "allowed_origins": [],
  "confirm_publish_root": false
}
```

发布源根必须 confirm_publish_root=true，目录必须存在且符合安全规则。服务端生成 public_asset_id/base_url。PUT 修改 enabled、cache_mode、cors_mode、public_origin、allowed_origins，可携带 expected_revision；修改 source_key/publish_root 返回 409 STATIC_REBIND_REQUIRED，需使用 rebind。

rebind 指定目标 source_key、publish_root、mode=reset|relocate 和 expected_revision。relocate 需要 confirm_relocate，保留公开 ID；reset 生成新 ID。目标源已有配置返回 409，不覆盖。重绑保留启停状态，不隐式开启已关闭的协议。

DELETE 要求先关闭协议，并提供当前 expected_revision；只撤销公开身份，保留普通文件。源有静态配置时删除 Source 返回 409。

响应包括 source_key/source_name/source_disabled、publish_root、public_asset_id、base_url、cache/CORS 和 revision。公开响应不暴露这些配置。旧全站 /admin/static-assets/* 管理端点已移除，/assets/{id}/{path} 保持稳定。

## 14. 静态资源公开端点（2.0 目标）

```http
GET /assets/{public_asset_id}/{relative_path...}
HEAD /assets/{public_asset_id}/{relative_path...}
OPTIONS /assets/{public_asset_id}/{relative_path...}
```

无 Cookie/Token 要求；OPTIONS 仅用于配置允许的无凭据读取预检。不存在公开写入或目录列表端点。空相对路径/目录/`.omnistore`/源外/不允许类型返回真实 404，不跳登录或 SPA。媒体响应、条件请求、Range、缓存与 CORS 由 [公开 HTTP](design/public-content-http.md) 定义。

## 15. 博客上传复用当前接口

当前固定基线已定义 `POST /api/v1/sources/{key}/upload?path=...`，一次 multipart 请求一个文件，支持显式 relative_path。发布目录 blog-assets，文章路径 images/posts/a.webp 时，应上传到普通目标 `blog-assets/images/posts/a.webp`，而不是 `.omnistore/`。

不得将本段混同为新增匿名写入。Web Session 写入保留 CSRF；WebDAV/S3 保留各自凭据和源开关。只有逐目标路径 Policy 授权成功才写入。已登录但没有目标目录权限返回 403。

## 16. 通用内部路径错误

通用读取/浏览 `.omnistore` 或后代使用 404（REST FILE_NOT_FOUND；S3 GET NoSuchKey；HEAD 无体）。普通创建/移动/复制/Multipart 目标也不得碰内部范围，不创建临时文件或上传状态。详情见 [命名空间契约](design/managed-namespace.md)。

## 17. 快速图床匿名保留设置

图床设置增加 `anonymous_retention_days`：0 表示不自动过期。只有管理员可改，新的匿名上传固化自己的 expires_at；变更不会追溯旧图。上传结果在现有 PicGo 兼容返回之外增加可选 expires_at（不改变既有 URL 字段语义），网页明确显示。快速图床 Token 不可用作静态目录写入凭据。

### 公开站点服务状态

`GET /api/v1/system/status` 无需登录，除原有 `s3`、`webdav`、`file_preview`、`anonymous` 外，返回 `public_drive`、`image_bed`、`transfer_center`。各项均为 `{ enabled, status, hint }`；三个站点服务的 `enabled` 表示当前开关已启用、已绑定且存储源与根目录可用，而不是仅返回数据库开关。`status` 区分未绑定、已关闭、存储源已禁用、目录不可用与已启用；公开响应不包含源身份、真实路径或底层错误。

`anonymous.enabled` 同时依赖匿名上传开关与图床实际可用状态。`transfer_center.enabled` 描述当前绑定用于创建新任务的可用性；已有取件与收集按其自身任务状态、原存储位置、取件码 / 收件码与密码授权访问，不由当前绑定状态推断其是否失效。
