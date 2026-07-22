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
| `entry_type` | 空 | `web`、`webdav`、`image_bed`、`anonymous_image_bed`、`admin` 或 `cli` |
| `status` | 空 | `success` 或 `failed` |
| `q` | 空 | 在动作、存储源、源/目标路径、IP 和错误码中进行文字匹配，最多 128 个字符 |

筛选条件之间采用 AND 关系，结果按 `id` 倒序返回。响应沿用统一列表结构，`total` 表示筛选后的记录总数。非法参数返回 `VALIDATION_ERROR`。

---
