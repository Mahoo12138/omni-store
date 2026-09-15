# WebDAV

## 1. 认证

使用：

```text
username + WebDAV Token
```

Basic Auth。

不使用网页登录密码直接作为 WebDAV 长期凭据。

## 2. 当前方法

核心支持：

- OPTIONS
- PROPFIND
- GET
- HEAD
- PUT
- MKCOL
- DELETE
- MOVE
- LOCK
- UNLOCK

未实现的方法必须返回明确协议状态，不伪装成功。

## 3. 路径

WebDAV 映射到用户有权限的 Storage Source 和相对路径。

所有写入仍经过：

- Policy；
- exclude；
- path safety；
- symlink；
- quota；
- persistent lock；
- recovery pipeline。

## 4. LOCK / UNLOCK

支持 RFC 4918 独占写锁相关核心语义：

- Depth 0 / infinity；
- refresh；
- lock-null resource；
- timeout cleanup；
- active lock discovery；
- 全入口写保护。

REST/S3/图床写操作也不能穿透 WebDAV 持久锁。

## 5. DELETE

WebDAV DELETE 是协议级永久删除，不进入网页回收站。

## 6. COPY

当前不把 REST Copy 能力伪装为完整 WebDAV COPY；不支持时返回明确 `501`。

## 7. 兼容性

长期不以“实现全部 WebDAV RFC”作为目标。

真实客户端矩阵见：

```text
roadmap/1.5.0-compatibility.md
design/compatibility-testing.md
```
