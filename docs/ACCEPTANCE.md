# MVP 验收清单

本文档给出 MVP 的最低完成条件。执行验收时应记录实际版本、环境和结果。

### 安装与初始化

1. Docker Compose 可启动。
2. 二进制可启动。
3. 首次启动可创建超级管理员。
4. 配置优先级正确。
5. public_url 生效。

### 用户与权限

1. 超级管理员可创建普通用户。
2. 普通用户不能进入管理员后台。
3. 普通用户只能访问被分配存储源。
4. 只读用户不能写。
5. 禁用用户所有入口失效。

### 存储源

1. 禁止系统目录。
2. 禁止数据目录。
3. 禁止重叠挂载。
4. root_path 不可修改。
5. 删除存储源不删除物理文件。
6. 禁用存储源后所有入口不可访问。

### 文件操作

1. 浏览目录正常。
2. 分页排序正常。
3. 上传同名默认 409。
4. overwrite=true 才覆盖。
5. 下载支持 Range。
6. 删除永久删除。
7. 移动只允许同一存储源。
8. 复制不可用。
9. 路径穿越被拒绝。
10. symlink 被拒绝。
11. 排除路径不可访问。

### 公开网盘

1. `/` 是公开网盘首页。
2. `/p/*` 可浏览公开目录。
3. `/raw/*` 可访问公开文件。
4. public_mount_path 与公开 URL 不暴露存储源内部 key。
5. 修改 public_mount_path 后，旧目录页和 raw 链接重定向到新路径；禁用公开访问或存储源后旧链接不可访问。

### WebDAV

1. `/dav` 可显示可访问存储源。
2. 系统提供的 `/dav/{storage_key}` 地址可直接挂载，界面用存储源名称描述它。
3. Basic Auth 使用 WebDAV Token。
4. 登录密码不能作为 WebDAV Token 使用。
5. 基础方法可用。
6. 未实现方法返回 501。

### V1.1 WebDAV 持久锁

1. `OPTIONS` 声明 DAV class 2，并列出 `LOCK / UNLOCK`。
2. 独占写锁在进程重启后仍有效，过期后自动清理。
3. `Depth: infinity` 锁会保护全部后代路径，未提交 Token 的写操作返回 423。
4. REST、图床等非 WebDAV 写入口不能绕过持久锁。
5. 携带匹配 Token 的 `PUT / MKCOL / DELETE / MOVE` 可以执行。
6. 锁可刷新、可通过 `PROPFIND` 发现，并且只有创建者可以解锁。
7. 对不存在 URL 加锁会创建零字节普通文件。
8. `DELETE` 清理已删除资源的锁，`MOVE` 不把源资源的锁迁移到目标路径，且不误删外部祖先锁。

### 图床

1. 登录用户可选择默认图床目标。
2. 图床只允许真实图片格式。
3. 图床 URL 为 `/i/{image_id}.{ext}`。
4. 图床历史按用户隔离。
5. PicGo 接口可上传。
6. 删除图床图片同时删除物理文件和记录。
7. 匿名图床默认关闭。
8. 匿名图床开启后可上传。
9. 匿名图床有限流。
10. 匿名用户不能删除图片。

### V1.1 图床缩略图

1. 图床历史响应包含 `thumbnail_url`，页面预览不再下载原图。
2. `GET /t/{image_id}.jpg` 返回最长边不超过 480px 的 JPEG，并支持 ETag 条件请求。
3. 原图 size 或 modTime 变化后不复用旧缓存，同一原图的并发请求不重复生成。
4. 缓存只写入系统 `cache/thumbnails/`，用户存储源中不产生缩略图或 sidecar。
5. 超过 30 天未访问的缓存会在启动时及每日清理；禁用存储源后缩略图返回 404。

### V1.1 S3

1. `s3_enabled=false` 时不监听专用端口；显式启用时只在 `s3_addr` 启动 Path-style 服务。
2. 用户可创建多个独立 Access/Secret，Secret 只展示一次并以 AES-256-GCM 加密保存。
3. master key 可由 `OMNISTORE_MASTER_KEY` 提供；本地生成的 key 会进入系统配置包。
4. Authorization Header 和预签名 URL 的 Signature V4 可用，错误签名、过期请求与禁用凭据被拒绝。
5. ListBuckets、HeadBucket、ListObjectsV2、Head/Get/Put/DeleteObject 和 DeleteObjects 可用。
6. GET 支持 Range；PUT 支持普通 payload、`UNSIGNED-PAYLOAD` 和 unsigned aws-chunked trailer 校验。
7. S3 复用用户存储源读写权限；禁用存储源、排除路径、symlink 和只读写入均不可绕过。
8. S3 写操作不能绕过 WebDAV 持久锁，并写入 `entry_type=s3` 审计日志。
9. 不支持的 ACL、Policy 等操作返回 S3 XML `NotImplemented`，不伪装成功。

### V1.2 S3 Multipart

1. CreateMultipartUpload、UploadPart、ListParts、CompleteMultipartUpload 与 AbortMultipartUpload 可用。
2. UploadId 绑定用户、存储源和对象 Key，其他用户或对象不能复用。
3. PartNumber 限制为 1–10000，同号 Part 可覆盖；完成时校验严格递增顺序、ETag 和非末片 5 MiB 下限。
4. ListParts 支持 marker 与最多 1000 条分页；完成时只逐片流式读取，不把整个对象载入内存。
5. 完成写入复用统一文件服务，不能绕过排除规则、symlink 拒绝和 WebDAV 持久锁。
6. 完成或 Abort 后清理 SQLite 状态与临时目录；失败可重试，超过 24 小时未活动的状态和孤儿目录自动清理。

### 安全

1. Cookie HttpOnly。
2. SameSite=Lax。
3. 写 API 校验 CSRF。
4. 默认不开放 CORS。
5. trusted proxy 生效。
6. Token 只保存哈希。
7. 密码只保存哈希。
8. 明文 Token 只展示一次。

### 审计

1. 登录事件记录。
2. 用户管理记录。
3. 存储源管理记录。
4. 权限变更记录。
5. 文件写操作记录。
6. 图床上传记录。
7. 匿名图床上传记录。
8. 审计日志最多保留 10000 条默认值生效。

### V1.1 配置导出

1. 只有超级管理员可以导出系统配置包。
2. 导出包包含生效配置、可打开的 SQLite 一致性快照、恢复说明与 keys 普通文件。
3. 导出包不包含存储源真实文件、缓存、临时上传文件或日志。
4. keys 下的符号链接不会被跟随或导出。
5. 导出响应禁止缓存，临时 ZIP 在请求结束后清理。
6. 导出成功与失败均写入管理审计日志。

---
