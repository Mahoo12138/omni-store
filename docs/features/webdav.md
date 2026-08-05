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
/dav/{storage_key}
/dav/{storage_key}/...
```

`/dav` 是虚拟根目录。

用户登录后，在 `/dav` 可以看到访问策略授予且启用 WebDAV 的存储源列表。列表使用存储源名称作为 `displayname`，实际 href 使用系统生成的不透明 key；挂载地址由连接信息直接提供，用户无需自行填写或记忆 key。

示例：

```text
/dav/src-cd6ee2f48ba8709d
/dav/src-cdfcd8b58630e339
```

`/dav` 不能写入。

禁止：

1. `MKCOL /dav/new-source`。
2. `DELETE /dav/{storage_key}` 删除存储源。
3. 在 `/dav` 下创建存储源。

### 支持方法

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
LOCK
UNLOCK
```

`PROPFIND` 支持：

```text
Depth: 0
Depth: 1
```

`Depth: infinity` 返回明确错误，避免大目录扫爆。

V1.1 的 `LOCK / UNLOCK` 支持 RFC 4918 独占写锁：

1. `Depth: 0` 只锁定请求资源；省略 `Depth` 等价于 `Depth: infinity`。
2. 新建锁返回 `Lock-Token` 和 `DAV:lockdiscovery`；无请求体的 `LOCK` 搭配 `If` 头用于刷新。
3. `UNLOCK` 使用 `Lock-Token`，成功返回 `204 No Content`。
4. 锁定不存在的 URL 时创建零字节普通文件。
5. 锁最长保留 7 天，默认 1 小时；访问时和后台任务都会清理过期锁。
6. 持久锁写入 SQLite，进程重启后继续生效。
7. REST、WebDAV、图床等所有文件写入口都必须遵守持久锁；WebDAV 通过 `If` 头提交匹配 Token。
8. 当前只支持规范要求的独占写锁，不支持共享锁。
9. 成功删除资源时会删除以该资源或其后代为根的锁；成功 `MOVE` 不把源资源的锁迁移到目标路径，外部祖先锁保持不变。

`PROPFIND` 返回 `DAV:supportedlock` 和 `DAV:lockdiscovery`。`OPTIONS` 声明 `DAV: 1, 2`。

### 不支持方法

不支持：

```text
COPY
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
4. 将不透明路径段解析为存储源。
5. 检查存储源存在。
6. 检查存储源未禁用。
7. 检查 `webdav_enabled = true`。
8. 检查访问策略合并后的存储源权限。
9. 检查路径穿越。
10. 检查排除规则。
11. 检查 symlink。
12. 校验 WebDAV 持久写锁。
13. 获取请求级路径锁。
14. 访问真实文件系统。

---
