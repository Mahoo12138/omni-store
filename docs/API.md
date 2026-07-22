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
