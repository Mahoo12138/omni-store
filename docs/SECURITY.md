# 身份、权限与存储安全

本文档集中描述用户与权限、认证凭据、代理信任、存储源路径及排除规则等安全约束。

## 用户模型与权限模型

### 用户类型

MVP 支持三类访问主体：

1. 超级管理员。
2. 普通用户。
3. 匿名访客。

### 超级管理员

超级管理员可以：

1. 创建、禁用、删除用户。
2. 创建、禁用、删除存储源。
3. 配置存储源公开状态。
4. 配置公开挂载路径。
5. 配置存储源 WebDAV 开关。
6. 配置存储源图床开关。
7. 配置存储源排除规则。
8. 分配用户对存储源的权限。
9. 配置匿名公共图床。
10. 查看审计日志。
11. 删除匿名图床图片。

### 普通用户

普通用户可以：

1. 查看被分配的存储源。
2. 在只读存储源中浏览、下载。
3. 在读写存储源中上传、删除、重命名、移动、新建目录。
4. 从可用图床目标中选择默认图床目标。
5. 上传图床图片。
6. 查看自己的图床历史。
7. 删除自己上传的图床图片。
8. 生成或重置自己的 WebDAV Token。
9. 生成或重置自己的图床 API Token。
10. 修改自己的显示名和密码。

普通用户不能：

1. 创建存储源。
2. 删除存储源。
3. 禁用存储源。
4. 修改存储源路径。
5. 修改存储源排除规则。
6. 修改公开挂载路径。
7. 开启公开访问。
8. 开启图床能力。
9. 配置匿名公共图床。

### 匿名访客

匿名访客可以：

1. 访问公开网盘首页。
2. 浏览公开挂载的存储源。
3. 下载公开网盘文件。
4. 访问公开图床图片 URL。
5. 当匿名公共图床显式开启时，上传图片。

匿名访客不能：

1. 登录后台。
2. 访问私有网盘。
3. 使用 WebDAV。
4. 使用 S3。
5. 上传普通文件。
6. 删除匿名图床图片。
7. 查看匿名图床历史。
8. 浏览匿名图床目标存储源。

### 权限粒度

MVP 只做存储源级权限。

权限级别：

```text
read_only
read_write
```

不做：

1. 子路径权限。
2. 文件级权限。
3. 目录级 ACL。
4. 用户组。
5. 复杂 RBAC。

V2 的子路径权限抽象为轻量 Policy：

1. 一个存储源可绑定多个策略。
2. 策略描述子路径范围、主体、读写权限等。
3. 不能通过嵌套存储源实现子路径权限。
4. 必须继续共用同一套路径锁和权限检查函数。

---

---

## 账号、登录、Session、Token

### 用户字段

用户表至少包含：

```text
id
user_public_id
username
display_name
password_hash
role
is_disabled
created_at
updated_at
```

字段规则：

1. `id` 是数据库内部主键。
2. `user_public_id` 是稳定随机 ID，例如 `u_7k3f9a2d`，创建后不可修改。
3. 图床落盘路径使用 `user_public_id`，不使用 username。
4. `username` 是登录名，创建后不可修改。
5. `display_name` 是展示名，可修改。
6. 密码必须哈希保存，禁止明文。

### 初始化超级管理员

首次启动时，如果数据库里没有任何用户，系统进入初始化模式。

初始化页面要求创建第一个超级管理员账号。

创建成功后，初始化入口关闭。

除非删除数据库或使用命令行恢复，否则不能再次进入初始化模式。

### 密码哈希

密码必须使用：

```text
bcrypt
```

或：

```text
argon2id
```

禁止：

1. 明文存储密码。
2. 把原始密码写入日志。
3. 把原始密码返回给前端。
4. 把原始密码保存在前端状态里。

### Web 登录

网页登录使用：

```text
username + password + Cookie Session
```

Session 存在 SQLite。

Session 字段：

```text
session_id
user_id
csrf_token_hash
expires_at
created_at
last_seen_at
user_agent
ip_address
```

Cookie 设置：

```text
HttpOnly = true
SameSite = Lax
Secure = 根据 security.cookie_secure
```

默认登录有效期：

```text
7 天，即 168 小时
```

退出登录时：

1. 删除服务端 Session。
2. 清除浏览器 Cookie。

### CSRF

网页登录态写操作必须做 CSRF 防护。

登录成功后，服务端返回 `csrf_token`。

前端所有网页登录态写操作请求必须带：

```text
X-CSRF-Token: {csrf_token}
```

需要 CSRF 的操作：

1. 上传。
2. 删除。
3. 重命名。
4. 移动。
5. 创建目录。
6. 创建用户。
7. 修改权限。
8. 重置 Token。
9. 修改密码。
10. 修改存储源配置。

不需要 CSRF 的入口：

1. WebDAV Basic Auth。
2. 图床 Bearer Token API。
3. 匿名公共图床上传。

### WebDAV Token

WebDAV 不使用网页登录密码。

WebDAV 使用：

```text
username + WebDAV Token
```

通过 HTTP Basic Auth 传输。

规则：

1. 每个用户 MVP 最多一个 WebDAV Token。
2. Token 只在生成时展示一次。
3. 数据库只保存 Token 哈希，不保存明文。
4. 重置 Token 后旧 Token 立即失效。
5. 用户禁用后 WebDAV Token 失效。
6. 生产环境必须放在 HTTPS 反向代理后使用。

### 图床 API Token

每个用户 MVP 最多一个图床 API Token。

用途：

```text
PicGo / 第三方工具上传图片
```

规则：

1. Token 只在生成时展示一次。
2. 数据库只保存 Token 哈希。
3. 重置后旧 Token 立即失效。
4. Token 只能用于图床上传。
5. 不能用于普通文件 API。
6. 不能用于 WebDAV。
7. 不能用于管理后台。

### 命令行管理员紧急恢复

MVP 提供本机命令行恢复能力。

示例：

```bash
omnistore admin reset-password --username admin
```

规则：

1. 只能在能访问配置文件和 SQLite 数据库的机器上执行。
2. 不提供 Web API。
3. 不做邮箱找回。
4. 不记录明文密码。
5. 操作写入审计日志，`actor_type = system`。

---

---

## CORS 与代理感知

### CORS

MVP 默认同源部署，不开放 CORS。

规则：

1. `/api/v1/*` 不返回宽松 CORS。
2. Cookie Session API 绝不允许 `Access-Control-Allow-Origin: *`。
3. PicGo 上传不是浏览器环境，不需要 CORS。
4. 公开图片 `<img>` 引用通常不需要 CORS。
5. 不支持前端部署在另一个域名再跨域调用后端 API。

### public_url

MVP 必须配置外部访问地址：

```yaml
server:
  public_url: "https://store.example.com"
```

用途：

1. 图床公开 URL。
2. 前端复制链接。
3. 后续 S3 签名和代理感知。

MVP 支持独立域名或根路径部署：

```text
https://store.example.com
```

MVP 不支持子路径部署：

```text
https://example.com/omnistore
```

### Trusted Proxies

只有请求来自 `trusted_proxies` 时，才信任以下头：

```text
X-Forwarded-For
X-Forwarded-Proto
X-Forwarded-Host
```

匿名图床 IP 限流必须使用可信代理后的真实 IP 解析逻辑。

---

---

## 存储源模型

### 存储源字段

MVP 存储源字段：

```text
id
source_id
name
description
root_path
exclude_patterns
is_disabled
public_read_enabled
public_mount_path
webdav_enabled
image_bed_enabled
created_at
updated_at
```

说明：

1. `source_id` 是稳定技术标识，创建后不可修改。
2. `name` 是展示名称，可修改。
3. `root_path` 是真实目录路径，创建后不可直接修改。
4. `exclude_patterns` 是全局排除路径规则。
5. `is_disabled` 禁用后所有入口都不可访问。
6. `public_read_enabled` 控制公开网盘访问。
7. `public_mount_path` 是公开网盘虚拟挂载路径。
8. `webdav_enabled` 控制是否允许 WebDAV 访问。
9. `image_bed_enabled` 控制是否允许承载图床图片。

### source_id 规则

`source_id` 创建时确定，创建后不可修改。

规则：

1. 只允许小写字母、数字、短横线。
2. 长度 3 到 63。
3. 必须以字母或数字开头。
4. 必须以字母或数字结尾。
5. 不允许连续两个短横线。
6. 不允许看起来像 IP 地址。
7. 全局唯一。

这样是为了兼容后续 S3 Bucket 命名。

### root_path 规则

`root_path` 创建后不可直接修改。

如果要暂停访问，使用：

```text
is_disabled = true
```

如果要换目录：

1. 删除旧存储源绑定。
2. 新建一个存储源。

删除存储源不删除真实磁盘文件。

### 删除存储源

MVP 删除存储源只删除 OmniStore 内部记录，不删除真实文件。

删除内容：

1. `storage_sources` 记录。
2. 用户权限绑定。
3. 用户默认图床目标引用。
4. 匿名图床目标引用。
5. 相关图床历史记录。

真实目录和真实文件必须保留。

前端必须提示：

```text
此操作只会从 OmniStore 中移除该存储源，不会删除磁盘上的真实文件。
```

MVP 不提供“连同物理文件一起删除”。

### 新建存储源路径安全校验

创建存储源时必须执行以下校验：

1. 将输入路径转成绝对路径。
2. 解析符号链接，得到真实路径 realpath。
3. 确认路径存在。
4. 确认路径是目录。
5. 禁止挂载根目录 `/`。
6. 禁止挂载系统敏感目录。
7. 禁止挂载 OmniStore 系统数据目录。
8. 禁止挂载系统数据目录的父目录或子目录。
9. 禁止与已有存储源重叠。
10. 执行读写权限预检。

禁止的 Linux 敏感目录至少包括：

```text
/etc
/boot
/proc
/sys
/dev
/run
/var
/usr
/bin
/sbin
/lib
/lib64
```

重叠挂载示例：

```text
已有 /data/photos，则禁止新增 /data/photos/2026
已有 /data/photos/2026，则禁止新增 /data/photos
```

读写预检：

1. `os.ReadDir(root_path)`。
2. 创建隐藏测试文件 `.omnistore-write-test-{random}`。
3. 写入 1 字节。
4. 删除测试文件。
5. 任一步失败则拒绝创建。

MVP 不提供跳过安全检查开关。

### 是否要求空目录

MVP 不要求存储源必须是空目录。

允许挂载已有非空目录。

但必须明确：

1. 已有文件不会进入图床历史。
2. 已有文件不会进入用户配额台账。
3. MVP 不做配额统计。
4. V2 通过扫描导入和 SQLite 文件台账解决配额归属。

### 符号链接策略

MVP 不跟随符号链接。

规则：

1. 任何路径段解析到 symlink，直接拒绝。
2. 私有网盘可显示 symlink 为 `unsupported`，但不能进入、下载、移动、重命名。
3. 公开网盘默认不展示 symlink。
4. WebDAV `PROPFIND` 遇到 symlink 可直接跳过。
5. 不支持“只跟随指向存储源内部的 symlink”。

### 文件名策略

MVP 尽量宽松支持正常文件名。

允许：

1. 中文。
2. 空格。
3. emoji。
4. 括号。
5. 点号。

拒绝：

```text
../
空字节 \0
ASCII 0-31 控制字符
单个文件名中包含 /
仅由空白组成的文件名
.
..
解析后逃出存储源根目录的路径
```

生产目标是 Linux，不专门做 Windows 保留名校验。

---

---

## 排除路径规则

### 匹配语法

MVP 使用简单 glob 语法，不支持正则。

规则基于存储源根目录下的相对路径。

统一使用 `/` 作为分隔符。

示例：

```text
private/**
tmp/**
*.tmp
**/*.tmp
.DS_Store
**/.DS_Store
```

不支持：

1. 正则表达式。
2. 否定规则。
3. 用户级规则。
4. 协议级规则。
5. 复杂优先级。

### 强制排除规则

系统强制排除规则永远生效，管理员不能关闭：

```text
.omnistore-upload-*
**/.omnistore-upload-*
```

这些临时文件不能被公开网盘、私有网盘、WebDAV、图床读取或展示。

### 新建存储源默认建议排除规则

新建存储源时自动填入建议规则，管理员可以修改：

```text
**/.DS_Store
**/Thumbs.db
**/@eaDir/**
**/#recycle/**
**/.Trash/**
**/.Trashes/**
**/.git/**
**/.env
**/.env.*
**/.ssh/**
```

### 统一函数

所有模块必须调用统一函数：

```go
IsPathExcluded(sourceID, relativePath) bool
```

必须调用的入口：

1. 私有网盘列表。
2. 私有网盘下载。
3. 私有网盘上传。
4. 私有网盘删除。
5. 私有网盘移动。
6. 私有网盘重命名。
7. WebDAV PROPFIND。
8. WebDAV GET。
9. WebDAV PUT。
10. WebDAV DELETE。
11. WebDAV MOVE。
12. 公开网盘浏览。
13. 公开 raw 访问。
14. 图床上传。
15. 图床图片访问。

---
