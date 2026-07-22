# WebDAV

WebDAV 的鉴权、路由、支持方法、移动语义与校验顺序。

### 鉴权

WebDAV 使用 HTTP Basic Auth。

用户名：

```text
username
```

密码：

```text
WebDAV Token
```

不使用网页登录密码。

匿名访客不支持 WebDAV。

### 路由

MVP 支持：

```text
/dav
/dav/{source_id}
/dav/{source_id}/...
```

`/dav` 是虚拟根目录。

用户登录后，在 `/dav` 可以看到自己有权限访问且启用 WebDAV 的存储源列表。

示例：

```text
/dav/photos
/dav/downloads
```

`/dav` 不能写入。

禁止：

1. `MKCOL /dav/new-source`。
2. `DELETE /dav/{source_id}` 删除存储源。
3. 在 `/dav` 下创建存储源。

### MVP 支持方法

支持：

```text
OPTIONS
PROPFIND
GET
HEAD
PUT
MKCOL
DELETE
MOVE
```

`PROPFIND` 支持：

```text
Depth: 0
Depth: 1
```

`Depth: infinity` 返回明确错误，避免大目录扫爆。

### MVP 不支持方法

不支持：

```text
COPY
LOCK
UNLOCK
PROPPATCH
REPORT
SEARCH
ACL
VERSION-CONTROL
```

返回：

```text
501 Not Implemented
```

### MOVE 规则

允许：

```text
MOVE /dav/photos/a.jpg -> /dav/photos/b.jpg
```

禁止：

```text
MOVE /dav/photos/a.jpg -> /dav/backup/a.jpg
```

MVP 不支持跨存储源移动。

### WebDAV 检查顺序

每个 WebDAV 请求必须：

1. Basic Auth 鉴权。
2. 检查用户未禁用。
3. 解析路径。
4. 识别 source_id。
5. 检查存储源存在。
6. 检查存储源未禁用。
7. 检查 `webdav_enabled = true`。
8. 检查用户对存储源权限。
9. 检查路径穿越。
10. 检查排除规则。
11. 检查 symlink。
12. 获取路径锁。
13. 访问真实文件系统。

---
