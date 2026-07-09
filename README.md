# OmniStore 技术架构、产品设计与开发计划细化版

> 本文档基于原始《OmniStore 技术架构与产品设计详细文档》进一步细化，用于指导低智能编码模型实现。文档目标不是追求一次性实现完整愿景，而是明确 MVP 边界、后续版本规划、数据模型、安全规则、接口行为和工程约束，尽量避免实现歧义。

---

## 0. 产品定位

OmniStore 是一款以本地存储源为中心的轻量级自部署存储中心系统。它将本地目录作为核心存储资源，在此基础上提供公开网盘、私有网盘、WebDAV、图床和后续 S3 网关能力。

核心定位：

1. 面向个人、家庭、小团队自部署。
2. 优先轻量、可靠、清晰，而不是企业级复杂能力。
3. 单二进制交付，前端通过 Go `go:embed` 嵌入后端。
4. 默认单实例运行，不支持多副本横向扩展。
5. 本地文件系统是真实数据源，MVP 不维护完整虚拟文件树。
6. SQLite 只保存用户、权限、配置、Session、Token、图床流水、审计日志等系统数据。
7. 所有真实文件操作都必须严格经过权限、路径安全、排除规则和锁检查。

---

## 1. 版本边界总览

### 1.1 MVP 必做

MVP 只实现第一条核心闭环：

```text
本地存储源管理
+ 用户登录和权限
+ 公开网盘首页
+ 私有网页文件管理器
+ WebDAV 基础读写
+ 登录用户图床
+ 匿名公共图床
+ 轻量审计日志
```

MVP 必做能力：

1. Linux 生产环境支持，amd64 / arm64。
2. Docker Compose 推荐部署，单二进制直跑作为备用。
3. YAML 配置文件 + 环境变量覆盖。
4. 初始化第一个超级管理员。
5. 超级管理员管理用户、存储源、权限、公开挂载、图床开关。
6. 普通用户使用被分配的存储源。
7. 匿名访客浏览公开网盘和访问公开图床图片。
8. 存储源级权限：只读 / 读写。
9. 存储源全局排除路径规则。
10. 公开网盘虚拟挂载路径。
11. 私有网盘基础文件操作：浏览、上传、下载、删除、重命名、移动、新建目录。
12. WebDAV 基础方法：`OPTIONS / PROPFIND / GET / HEAD / PUT / MKCOL / DELETE / MOVE`。
13. WebDAV 使用用户名 + 独立 WebDAV Token 的 Basic Auth。
14. 登录用户图床，支持网页上传、历史墙、PicGo 兼容上传接口。
15. 匿名公共图床，默认关闭，开启后只允许上传图片。
16. 图床公开 URL 使用 `/i/{image_id}.{ext}`。
17. 请求级内存读写锁。
18. 轻量审计日志。
19. 统一 API 响应和错误格式。
20. 基础响应式前端。
21. 管理员命令行紧急重置密码。

### 1.2 MVP 明确不做

MVP 不实现以下能力：

1. S3 协议服务。
2. S3 专用端口监听。
3. S3 Multipart。
4. 文件复制。
5. 跨存储源移动。
6. WebDAV `COPY`。
7. WebDAV `LOCK / UNLOCK` 持久锁。
8. WebDAV `PROPPATCH / REPORT / SEARCH / ACL`。
9. 子路径用户权限、目录级 ACL、文件级 ACL。
10. 用户组、角色组、复杂 RBAC。
11. 文件分享链接。
12. 回收站。
13. 文件版本历史。
14. 文件全文搜索。
15. 文件索引数据库。
16. 用户总配额和存储源总配额。
17. 后端缩略图生成和缩略图缓存。
18. 大文件分片上传、断点续传。
19. 在线预览 Office / PDF / 视频转码。
20. PWA 离线能力。
21. Web UI 修改基础设施配置。
22. CORS 跨域部署。
23. 多实例 / K8s 多副本部署。
24. 内置备份恢复。
25. 邮箱找回密码。
26. OAuth / OIDC / LDAP / Passkey。

### 1.3 V1.1 规划

V1.1 可实现：

1. S3 基础对象存储子集。
2. S3 专用端口 `8081`。
3. S3 Path-style 路由。
4. AWS Signature V4 鉴权。
5. S3 Access Key / Secret Key 管理。
6. WebDAV `LOCK / UNLOCK` 持久锁。
7. 后端缩略图生成和缓存。
8. 上传临时文件残留清理。
9. 存储源导入已有目录向导。
10. 更完善的审计日志筛选。
11. 多个图床 Token。
12. 公开挂载路径别名或重定向。
13. 手动导出系统配置包。

### 1.4 V1.2 规划

V1.2 可实现：

1. S3 Multipart Upload。
2. Multipart 临时分片目录。
3. Multipart SQLite 状态表。
4. Multipart Abort。
5. Multipart ListParts。
6. 24 小时孤儿分片 GC。

### 1.5 V2 规划

V2 可实现：

1. 访问策略 Policy。
2. 存储源绑定多个策略。
3. 子路径权限策略。
4. 配额系统。
5. 文件台账表 `file_records`。
6. 已有文件扫描导入。
7. 文件台账校准扫描。
8. 用户级用量统计。
9. 存储源级用量统计。
10. 跨存储源移动和复制。
11. 更复杂的分享系统。
12. 回收站。
13. 搜索与索引。

---

## 2. 技术选型

### 2.1 后端

1. 语言：Go。
2. 架构：模块化单体。
3. 数据库：SQLite。
4. 数据库访问：`database/sql` + 原生 SQL + Repository 层。
5. SQLite 驱动：优先 `modernc.org/sqlite`，因为 pure Go、无 CGO，便于单二进制跨平台构建。
6. 迁移：内置 SQL migration 文件，通过 `go:embed` 打包。
7. 前端静态产物：通过 Go `go:embed` 嵌入二进制。

禁止 MVP 使用：

1. GORM。
2. 外部数据库依赖。
3. Redis。
4. 消息队列。
5. 微服务拆分。
6. 分布式锁。

### 2.2 前端

1. 框架：React。
2. 路由：TanStack Router。
3. 服务端状态：TanStack Query。
4. 样式：vanilla-extract。
5. 底层无样式组件：Base UI。
6. 构建：Vite。

MVP 不引入：

1. Redux。
2. Zustand。
3. MobX。
4. Tailwind CSS。
5. shadcn/ui。
6. 大型有样式组件库。

### 2.3 前端组件约束

前端应建立自己的轻量 UI 组件层：

```text
web/src/components/ui/Button.tsx
web/src/components/ui/Input.tsx
web/src/components/ui/Dialog.tsx
web/src/components/ui/DropdownMenu.tsx
web/src/components/ui/Table.tsx
web/src/components/ui/Toast.tsx
web/src/components/layout/AppShell.tsx
web/src/components/files/FileTable.tsx
web/src/components/files/Breadcrumb.tsx
web/src/components/files/UploadDropzone.tsx
```

样式规则：

1. 颜色、间距、圆角、阴影、字体大小全部来自主题 token。
2. 不要到处写魔法值。
3. 不混用多套 CSS 方案。
4. 尽量避免内联 style，除非是上传进度条宽度等运行时动态值。
5. MVP 视觉目标是清爽、稳定、现代管理后台风格。

---

## 3. 运行环境与部署模型

### 3.1 MVP 生产支持环境

MVP 生产支持：

```text
Linux amd64
Linux arm64
```

推荐部署方式：

```text
Docker Compose
```

备用部署方式：

```text
下载单个 Go 二进制直接运行
```

Windows / macOS：

```text
只保证开发调试和个人试用，不承诺生产级路径权限、安全黑名单、文件锁行为完全一致。
```

### 3.2 单实例限制

MVP 明确只支持单实例运行：

```text
一个 OmniStore 进程
+ 一个 SQLite 数据库
+ 多个本地存储源
```

不支持：

1. 多副本横向扩展。
2. 多个容器共享同一个数据目录。
3. Kubernetes 多副本部署。
4. 多个 OmniStore 实例同时管理同一个物理目录。

原因：MVP 的路径锁是进程内内存锁，多个实例之间无法共享锁。

### 3.3 Docker 路径模型

Docker 部署时，OmniStore 后台填写的是容器内部路径，不是宿主机路径。

示例：

```yaml
services:
  omnistore:
    image: omnistore:latest
    ports:
      - "8080:8080"
    volumes:
      - ./omnistore-data:/data
      - /mnt/photos:/mnt/sources/photos
      - /mnt/downloads:/mnt/sources/downloads
```

在 OmniStore 后台创建存储源时填写：

```text
/mnt/sources/photos
/mnt/sources/downloads
```

不要填写宿主机路径：

```text
/mnt/photos
/mnt/downloads
```

推荐约定：

```text
系统数据目录：/data
用户存储源目录：/mnt/sources/*
```

MVP 不做 Web UI 浏览宿主机目录。

---

## 4. 配置系统

### 4.1 配置优先级

配置优先级从低到高：

```text
程序默认值 < YAML 配置文件 < 环境变量
```

加载顺序：

1. 加载程序内置默认值。
2. 读取 YAML 配置文件覆盖默认值。
3. 读取环境变量覆盖 YAML。

默认配置文件路径：

```text
./config.yaml
```

可通过环境变量指定：

```bash
OMNISTORE_CONFIG_FILE=/path/to/config.yaml
```

MVP 不支持配置热加载。修改 YAML 或环境变量后需要重启服务。

### 4.2 YAML 管基础设施，SQLite 管产品状态

YAML / 环境变量负责基础设施配置：

1. 服务监听地址。
2. 公开访问地址。
3. 数据目录。
4. Cookie 安全策略。
5. Session TTL。
6. 上传大小限制。
7. 图床全局根目录。
8. 匿名图床大小限制和限流默认值。
9. 审计日志保留数量。
10. Trusted proxies。

SQLite / 管理后台负责产品运行状态：

1. 用户。
2. 用户权限。
3. 存储源。
4. 存储源排除规则。
5. 存储源是否公开。
6. 公开挂载路径。
7. 存储源是否启用 WebDAV。
8. 存储源是否启用图床。
9. 用户默认图床目标。
10. 匿名公共图床是否启用。
11. 匿名公共图床目标存储源。
12. Session。
13. Token 哈希。
14. 图床图片记录。
15. 审计日志。

### 4.3 MVP 配置示例

```yaml
server:
  http_addr: "0.0.0.0:8080"
  public_url: "https://store.example.com"
  trusted_proxies:
    - "127.0.0.1"
    - "172.16.0.0/12"
  s3_addr: "0.0.0.0:8081"
  s3_enabled: false

data:
  dir: "/data"

database:
  path: "" # 为空时使用 data.dir/omnistore.db

security:
  cookie_secure: true
  session_ttl_hours: 168

upload:
  max_file_size_mb: 1024

image_bed:
  root_path: "/images"
  user_max_file_size_mb: 20
  anonymous_max_file_size_mb: 10
  anonymous_rate_limit:
    enabled: true
    per_ip_per_hour: 60

audit:
  enabled: true
  max_entries: 10000

log:
  level: "info"
```

### 4.4 环境变量命名

所有环境变量使用 `OMNISTORE_` 前缀。

示例：

```bash
OMNISTORE_CONFIG_FILE=/etc/omnistore/config.yaml
OMNISTORE_DATA_DIR=/data
OMNISTORE_HTTP_ADDR=0.0.0.0:8080
OMNISTORE_PUBLIC_URL=https://store.example.com
OMNISTORE_COOKIE_SECURE=true
OMNISTORE_SESSION_TTL_HOURS=168
OMNISTORE_UPLOAD_MAX_FILE_SIZE_MB=1024
OMNISTORE_IMAGE_BED_ROOT_PATH=/images
OMNISTORE_IMAGE_BED_USER_MAX_FILE_SIZE_MB=20
OMNISTORE_IMAGE_BED_ANONYMOUS_MAX_FILE_SIZE_MB=10
```

后续 S3 Secret 加密需要：

```bash
OMNISTORE_MASTER_KEY=...
```

敏感值优先通过环境变量提供，不建议写入 YAML。

---

## 5. 系统数据目录

### 5.1 目录结构

OmniStore 必须有一个系统数据目录，和用户存储源严格分开。

推荐：

```text
/data
```

结构：

```text
/data/
  omnistore.db
  keys/
  cache/
  tmp/
  logs/
```

说明：

1. `omnistore.db`：SQLite 数据库。
2. `keys/`：后续保存 master key 或密钥材料。
3. `cache/`：后续缩略图缓存。
4. `tmp/`：内部临时任务目录。
5. `logs/`：可选。MVP 可以只输出 stdout。

### 5.2 系统数据目录安全规则

系统数据目录不是存储源。

禁止：

1. 把系统数据目录作为存储源。
2. 把系统数据目录的父目录作为存储源。
3. 把系统数据目录的子目录作为存储源。
4. 通过公开网盘、私有网盘、WebDAV、图床暴露系统数据目录。

---

## 6. 备份边界

MVP 不提供 Web UI 备份/恢复，不提供定时备份任务。

必须在部署文档中明确需要备份：

```text
config.yaml
OMNISTORE_DATA_DIR/omnistore.db
OMNISTORE_DATA_DIR/keys/
```

后续如果启用 S3 Secret 加密，必须备份 master key。否则数据库恢复后已有 S3 Secret 无法解密。

可以不备份：

```text
OMNISTORE_DATA_DIR/cache/
OMNISTORE_DATA_DIR/tmp/
```

用户真实存储源文件不由 OmniStore MVP 负责备份。管理员应使用自己的 NAS、rsync、restic、borg、文件系统快照或云备份方案。

---

## 7. 用户模型与权限模型

### 7.1 用户类型

MVP 支持三类访问主体：

1. 超级管理员。
2. 普通用户。
3. 匿名访客。

### 7.2 超级管理员

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

### 7.3 普通用户

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

### 7.4 匿名访客

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

### 7.5 权限粒度

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

## 8. 账号、登录、Session、Token

### 8.1 用户字段

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

### 8.2 初始化超级管理员

首次启动时，如果数据库里没有任何用户，系统进入初始化模式。

初始化页面要求创建第一个超级管理员账号。

创建成功后，初始化入口关闭。

除非删除数据库或使用命令行恢复，否则不能再次进入初始化模式。

### 8.3 密码哈希

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

### 8.4 Web 登录

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

### 8.5 CSRF

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

### 8.6 WebDAV Token

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

### 8.7 图床 API Token

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

### 8.8 命令行管理员紧急恢复

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

## 9. CORS 与代理感知

### 9.1 CORS

MVP 默认同源部署，不开放 CORS。

规则：

1. `/api/v1/*` 不返回宽松 CORS。
2. Cookie Session API 绝不允许 `Access-Control-Allow-Origin: *`。
3. PicGo 上传不是浏览器环境，不需要 CORS。
4. 公开图片 `<img>` 引用通常不需要 CORS。
5. 不支持前端部署在另一个域名再跨域调用后端 API。

### 9.2 public_url

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

### 9.3 Trusted Proxies

只有请求来自 `trusted_proxies` 时，才信任以下头：

```text
X-Forwarded-For
X-Forwarded-Proto
X-Forwarded-Host
```

匿名图床 IP 限流必须使用可信代理后的真实 IP 解析逻辑。

---

## 10. 存储源模型

### 10.1 存储源字段

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

### 10.2 source_id 规则

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

### 10.3 root_path 规则

`root_path` 创建后不可直接修改。

如果要暂停访问，使用：

```text
is_disabled = true
```

如果要换目录：

1. 删除旧存储源绑定。
2. 新建一个存储源。

删除存储源不删除真实磁盘文件。

### 10.4 删除存储源

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

### 10.5 新建存储源路径安全校验

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

### 10.6 是否要求空目录

MVP 不要求存储源必须是空目录。

允许挂载已有非空目录。

但必须明确：

1. 已有文件不会进入图床历史。
2. 已有文件不会进入用户配额台账。
3. MVP 不做配额统计。
4. V2 通过扫描导入和 SQLite 文件台账解决配额归属。

### 10.7 符号链接策略

MVP 不跟随符号链接。

规则：

1. 任何路径段解析到 symlink，直接拒绝。
2. 私有网盘可显示 symlink 为 `unsupported`，但不能进入、下载、移动、重命名。
3. 公开网盘默认不展示 symlink。
4. WebDAV `PROPFIND` 遇到 symlink 可直接跳过。
5. 不支持“只跟随指向存储源内部的 symlink”。

### 10.8 文件名策略

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

## 11. 排除路径规则

### 11.1 匹配语法

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

### 11.2 强制排除规则

系统强制排除规则永远生效，管理员不能关闭：

```text
.omnistore-upload-*
**/.omnistore-upload-*
```

这些临时文件不能被公开网盘、私有网盘、WebDAV、图床读取或展示。

### 11.3 新建存储源默认建议排除规则

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

### 11.4 统一函数

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

## 12. 公开网盘

### 12.1 首页就是公开网盘

整个网站首页 `/` 是公开网盘入口。

匿名访客访问首页时，看到所有已公开挂载的目录入口。

首页不是登录页。

登录入口是：

```text
/login
```

登录用户私有网盘是：

```text
/app
```

管理员后台是：

```text
/admin
```

### 12.2 公开挂载模型

公开网盘不是直接暴露 `source_id`。

存储源公开后，挂载到一个虚拟路径：

```text
public_mount_path
```

示例：

```text
/photos
/downloads
/anime/wallpapers
/public/docs
```

真实映射示例：

```text
photos -> /data/media/photos -> /photos
software -> /mnt/downloads/software -> /downloads/software
```

### 12.3 public_mount_path 规则

规则：

1. 当 `public_read_enabled = true` 时，必须配置 `public_mount_path`。
2. 当 `public_read_enabled = false` 时，可以为空。
3. 必须以 `/` 开头。
4. 不能是 `/`。
5. 只允许小写字母、数字、短横线、下划线和 `/`。
6. 不同公开挂载路径不能相同。
7. 不允许路径互相包含。

禁止互相包含示例：

```text
已有 /anime，则不能再挂载 /anime/wallpapers
已有 /anime/wallpapers，则不能再挂载 /anime
```

### 12.4 public_mount_path 修改

MVP 允许超级管理员修改 `public_mount_path`。

规则：

1. 修改时重新校验格式和冲突。
2. 修改后旧公开网盘链接失效。
3. 不做旧路径重定向。
4. 图床 URL 不受影响。
5. 写入审计日志。

### 12.5 公开网盘路由

MVP 使用固定前缀，避免和 API、后台、前端路由冲突。

```text
GET /                     公开网盘首页
GET /p/*virtual_path      公开目录浏览页面
GET /raw/*virtual_path    公开文件原始访问
```

示例：

```text
/p/photos
/p/photos/2026
/raw/photos/2026/a.jpg
```

### 12.6 匿名公开访问能力

匿名访客只能：

1. 浏览公开网盘目录。
2. 下载公开网盘文件。
3. 访问公开 raw 文件。

匿名访客不能：

1. 上传普通文件。
2. 删除文件。
3. 重命名。
4. 移动。
5. 创建目录。
6. 使用 WebDAV。
7. 使用 S3。

公开网盘访问仍必须检查：

1. 存储源存在。
2. 存储源未禁用。
3. `public_read_enabled = true`。
4. 路径未命中排除规则。
5. 路径未穿越。
6. 路径段不是 symlink。

---

## 13. 私有网盘

### 13.1 展示模型

MVP 私有网盘按存储源分区展示，不做统一虚拟目录树。

登录用户进入：

```text
/app
```

看到自己有权限访问的存储源列表。

进入某个存储源：

```text
/app/sources/{source_id}?path=/
/app/sources/{source_id}?path=/2026
/app/sources/{source_id}?path=/2026/travel
```

`path` 永远表示存储源内部相对路径。

### 13.2 路径表达

REST API 使用 `source_id + path 查询参数`。

示例：

```text
GET /api/v1/sources/{source_id}/files?path=/2026
POST /api/v1/sources/{source_id}/folders
POST /api/v1/sources/{source_id}/upload?path=/2026
DELETE /api/v1/sources/{source_id}/files?path=/2026/a.jpg
```

禁止传真实磁盘路径。

### 13.3 MVP 文件操作

MVP 支持：

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

MVP 不支持：

1. 在线预览。
2. 文件复制。
3. 跨存储源移动。
4. 批量移动。
5. 批量删除。
6. 版本历史。
7. 回收站。
8. 全文搜索。
9. 压缩包在线解压。
10. 分享链接。

### 13.4 上传同名冲突

网页端上传默认不覆盖。

规则：

1. 如果目标文件存在，返回 `409 Conflict`。
2. 前端提示用户是否覆盖。
3. 用户确认后重新上传并带 `overwrite=true`。
4. 后端只有收到 `overwrite=true` 才允许覆盖。
5. 文件不能覆盖目录。
6. 目录不能覆盖文件。

WebDAV `PUT` 可按协议习惯覆盖文件，但仍必须经过权限、路径、排除规则和锁检查。

### 13.5 删除规则

MVP 直接永久删除，不做回收站。

规则：

1. 前端必须弹出确认。
2. 删除非空目录时，确认文案必须明确提示会删除目录内所有内容。
3. 后端必须检查读写权限。
4. 后端必须检查路径安全。
5. 后端必须检查排除规则。
6. 后端必须检查 symlink。
7. 删除真实文件系统内容。

如果删除的是图床图片：

1. 同步删除 `Images` 表记录。
2. 避免图床历史墙残留失效图片。

### 13.6 移动和重命名

MVP 只支持同一存储源内移动和重命名。

禁止跨存储源移动。

目标路径已存在时返回 `409 Conflict`。

不做覆盖。

不做自动重命名。

目录不能移动到自身或自己的子目录。

### 13.7 文件复制

MVP 不做文件复制。

规则：

1. 网页端不提供复制按钮。
2. REST API 不提供复制接口。
3. WebDAV `COPY` 返回 `501 Not Implemented`。

V1.1 可考虑同一存储源内复制。

V2 可考虑跨存储源复制。

### 13.8 目录列表分页和排序

REST 文件列表使用实时扫描当前目录 + 过滤 + 排序 + 分页。

API 示例：

```text
GET /api/v1/sources/{source_id}/files?path=/2026&page=1&page_size=100&sort=name&order=asc
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

MVP 不做数据库索引。

### 13.9 下载与 Range

MVP 文件下载必须流式返回，不允许整文件读入内存。

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

### 13.10 Content-Disposition

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

### 13.11 缓存策略

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

## 14. 上传实现规范

### 14.1 上传大小限制

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

### 14.2 不做分片和断点续传

MVP 只做普通流式上传。

不做：

1. 分片上传。
2. 断点续传。
3. 暂停继续。
4. 上传任务列表。
5. 失败恢复。
6. 分片 hash 校验。

### 14.3 临时文件位置

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

### 14.4 覆盖上传

覆盖已有文件时：

1. 先写临时文件。
2. 写入完成。
3. 校验成功。
4. 原子替换目标文件。

不能边上传边覆盖原文件。

### 14.5 临时文件隐藏

所有列表入口必须隐藏：

```text
.omnistore-upload-*
```

包括：

1. 私有网盘。
2. 公开网盘。
3. WebDAV `PROPFIND`。
4. 图床访问。

V1.1 可加清理超过 24 小时的上传残留文件。

---

## 15. 请求级路径锁

### 15.1 MVP 锁范围

MVP 只做请求生命周期内的内存读写锁。

不做：

1. WebDAV 持久锁。
2. SQLite 锁表。
3. 跨进程锁。
4. 分布式锁。

### 15.2 锁 key

锁 key：

```text
source_id + normalized_relative_path
```

所有入口共用同一套锁管理器：

1. REST 文件管理器。
2. WebDAV。
3. 图床上传。
4. 公开 raw 访问。

### 15.3 读写规则

读操作获取读锁：

1. 文件下载。
2. 目录列表。
3. 文件信息。

写操作获取写锁：

1. 上传。
2. 删除。
3. 重命名。
4. 移动。
5. 创建目录。

移动 / 重命名涉及源路径和目标路径：

1. 计算两个锁 key。
2. 排序。
3. 按固定顺序加锁。
4. 避免死锁。

目录操作可粗粒度锁住目录根路径，不要求递归锁每个子文件。

---

## 16. WebDAV

### 16.1 鉴权

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

### 16.2 路由

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

### 16.3 MVP 支持方法

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

### 16.4 MVP 不支持方法

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

### 16.5 MOVE 规则

允许：

```text
MOVE /dav/photos/a.jpg -> /dav/photos/b.jpg
```

禁止：

```text
MOVE /dav/photos/a.jpg -> /dav/backup/a.jpg
```

MVP 不支持跨存储源移动。

### 16.6 WebDAV 检查顺序

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

## 17. 图床

### 17.1 图床不是独立存储源类型

图床是存储源上的一种可选能力。

存储源字段：

```text
image_bed_enabled
```

含义：该存储源允许承载图床图片。

### 17.2 图床全局根目录

图床根目录放在 YAML 配置中：

```yaml
image_bed:
  root_path: "/images"
```

这个路径是存储源内部的相对路径。

示例：

```text
/images
```

存储源只配置是否开启图床能力，不单独配置图床根目录。

### 17.3 登录用户图床目标

每个用户可以从以下存储源中选择默认图床目标：

1. 用户拥有读写权限。
2. 存储源未禁用。
3. 存储源 `image_bed_enabled = true`。

用户可以有多个可用图床目标，但 MVP 只保存一个默认图床目标。

网页端上传可以提供下拉框临时切换目标。

PicGo / API Token 上传使用用户默认图床目标，不允许 API 指定 `source_id` 或目录。

### 17.4 登录用户图床落盘路径

使用稳定的 `user_public_id`，不使用 username。

格式：

```text
/{image_bed.root_path}/users/{user_public_id}/{yyyy}/{mm}/{uuid}.{ext}
```

示例：

```text
/images/users/u_7k3f9a2d/2026/07/8f3a9c2e4d.jpg
```

### 17.5 匿名公共图床

MVP 支持匿名公共图床，但默认关闭。

匿名公共图床是超级管理员显式开启的能力。

SQLite 系统设置字段：

```text
anonymous_image_bed_enabled
anonymous_image_bed_source_id
```

匿名公共图床目标存储源必须满足：

```text
is_disabled = false
image_bed_enabled = true
```

匿名上传不需要登录。

匿名用户不能：

1. 选择存储源。
2. 选择目录。
3. 删除图片。
4. 查看历史墙。
5. 浏览目标存储源。

匿名图床落盘路径：

```text
/{image_bed.root_path}/anonymous/{yyyy}/{mm}/{uuid}.{ext}
```

示例：

```text
/images/anonymous/2026/07/8f3a9c2e4d.jpg
```

### 17.6 匿名图床限流

匿名图床必须做简单内存级 IP 限流。

默认：

```yaml
image_bed:
  anonymous_rate_limit:
    enabled: true
    per_ip_per_hour: 60
```

规则：

1. 按客户端 IP 统计匿名上传次数。
2. 默认每 IP 每小时最多 60 张。
3. 进程内内存计数，服务重启后清空。
4. 超过限制返回 `429 Too Many Requests`。
5. 只有请求来自 trusted proxy 时才信任 `X-Forwarded-For`。

### 17.7 图片格式校验

MVP 只支持：

```text
jpg
jpeg
png
webp
gif
```

不支持：

```text
svg
avif
tiff
bmp
heic
heif
```

后端不能只相信文件扩展名或 `Content-Type`。

校验流程：

1. 限制请求体大小。
2. 写入临时文件。
3. 读取文件头。
4. 判断真实 MIME 类型。
5. 尝试用 Go 图片库 decode config。
6. 获取宽高。
7. 确认格式在允许列表中。
8. 以服务端识别结果决定最终扩展名。
9. 移动到最终路径。
10. 写入 `Images` 表。

### 17.8 图片公开 URL

图床公开 URL 使用稳定短路径：

```text
/i/{image_id}.{ext}
```

示例：

```text
https://store.example.com/i/img_8k3f9a2d.jpg
```

公开 URL 不暴露：

1. source_id。
2. public_mount_path。
3. 真实相对路径。
4. 用户 ID。

后端通过 `image_id` 查询 `Images` 表。

### 17.9 image_id 生成

`image_id` 使用不可预测随机 ID。

格式：

```text
img_{random}
```

`random` 使用安全随机数生成，建议 128-bit。

禁止使用：

1. 数据库自增 ID。
2. 用户名。
3. 时间戳。
4. 原始文件名。

数据库必须对 `image_id` 加唯一索引。

如果冲突，重新生成。

URL 中扩展名必须和数据库记录一致，不一致返回 `404`。

### 17.10 Images 表字段

MVP `Images` 表至少包含：

```text
id
image_id
owner_type          user / anonymous
owner_user_id       可为空
source_id
relative_path
original_filename
public_url
size
mime_type
width
height
ext
created_at
```

登录用户上传：

```text
owner_type = user
owner_user_id = 当前用户 ID
```

匿名上传：

```text
owner_type = anonymous
owner_user_id = null
```

### 17.11 图床历史墙

登录用户只能看到自己上传的图片：

```text
owner_user_id = current_user_id
```

即使多个用户共用同一个图床存储源，历史墙也按用户隔离。

匿名用户没有历史墙。

超级管理员可以在后台查看和删除匿名上传记录。

### 17.12 图床删除

登录用户在图床历史墙删除图片时：

1. 只能删除自己上传的图片。
2. 查询 `Images` 表。
3. 检查用户当前是否仍对该存储源有读写权限。
4. 删除物理文件。
5. 删除 `Images` 表记录。
6. 写审计日志。

如果物理文件已不存在：

1. 删除 `Images` 表记录。
2. 返回成功。

普通文件管理器或 WebDAV 删除了图床图片时，也必须同步清理对应 `Images` 记录。

### 17.13 图床生命周期

规则：

1. 关闭 `image_bed_enabled`：停止新上传，不影响旧图公开 URL。
2. 取消用户对存储源权限：该用户不能继续上传或管理旧图，但旧图公开 URL 继续可访问。
3. 禁用存储源 `is_disabled = true`：该存储源所有图床 URL 不可访问，建议返回 `404`。
4. 删除存储源绑定：删除相关图床记录，真实文件保留。

### 17.14 PicGo 兼容上传接口

MVP 提供最小 PicGo 兼容接口：

```text
POST /api/v1/image-bed/upload
```

鉴权：

```text
Authorization: Bearer {image_bed_token}
```

请求：

```text
multipart/form-data
file: 图片文件
```

不允许传：

1. source_id。
2. 目录。
3. 文件名模板。

成功响应：

```json
{
  "success": true,
  "data": {
    "url": "https://store.example.com/i/img_xxxxx.jpg"
  }
}
```

失败响应：

```json
{
  "success": false,
  "message": "图片格式不支持"
}
```

OmniStore 自己的前端 API 可以继续使用统一响应格式；PicGo 接口为了兼容第三方工具可以单独使用 PicGo 友好格式。

### 17.15 缩略图

MVP 不做后端缩略图生成。

图床历史墙直接使用原图 URL 预览。

V1.1 再实现：

1. 按需缩略图生成。
2. 缩略图缓存。
3. 缓存基于原图 size + modTime 校验。
4. 缓存存放在系统数据目录，不污染用户存储源。

---

## 18. S3 后续规划

### 18.1 MVP 不启动 S3

MVP 不启动 S3 专用端口。

配置中可以预留：

```yaml
server:
  s3_addr: "0.0.0.0:8081"
  s3_enabled: false
```

MVP 行为：

1. `s3_enabled` 默认 `false`。
2. 不监听 `s3_addr`。
3. 不实现任何 S3 路由。

### 18.2 S3 V1.1 鉴权模型

后续 S3 使用独立凭据：

```text
Access Key ID
Secret Access Key
```

不复用：

1. 登录密码。
2. WebDAV Token。
3. 图床 Token。

每个用户可创建一个或多个 S3 Key。

字段：

```text
access_key_id
secret_access_key_encrypted
secret_key_nonce
owner_user_id
name
is_disabled
created_at
last_used_at
```

`access_key_id` 可明文保存。

`secret_access_key` 必须可恢复地加密保存，因为 Signature V4 校验需要用 Secret 重新计算签名。

Secret 加密使用 master key：

```text
OMNISTORE_MASTER_KEY
```

如果没有环境变量，可首次启动生成本地 master key 存到 `data.dir/keys/`，但必须提示用户备份。

### 18.3 S3 V1.1 路由

只支持 Path-style：

```text
http://host:8081/{source_id}/{object_key}
```

`source_id` 映射为 Bucket。

不支持 virtual-host-style：

```text
http://{bucket}.host/{object_key}
```

### 18.4 S3 V1.1 支持范围

S3 首版只做常用对象存储子集。

支持：

```text
GET Service / ListBuckets
HEAD Bucket
GET Bucket / ListObjectsV2
HEAD Object
GET Object
PUT Object
DELETE Object
DELETE Multiple Objects
```

不支持：

```text
Bucket ACL
Object ACL
Bucket Policy
Versioning
Lifecycle
Object Lock
Legal Hold
Replication
Notification
Website Hosting
CORS 管理接口
Presigned POST
STS
SelectObjectContent
Multipart Upload
```

兼容目标：

```text
优先兼容 rclone、Cyberduck、S3 Browser、AWS CLI 的基础对象读写场景。
不承诺完整 AWS S3。
```

### 18.5 S3 V1.2 Multipart

Multipart 放到 V1.2。

支持内容：

```text
CreateMultipartUpload
UploadPart
CompleteMultipartUpload
AbortMultipartUpload
ListParts
UploadId 状态管理
Part 编号和 ETag 校验
临时分片目录
合并失败清理
孤儿分片 GC
```

临时目录：

```text
{data.dir}/tmp/multipart/{upload_id}/
```

状态写入 SQLite。

完成时流式合并到目标存储源。

超过 24 小时未完成的分片由后台 GC 清理。

---

## 19. API 统一响应

### 19.1 成功响应

```json
{
  "data": {},
  "request_id": "req_xxx"
}
```

### 19.2 列表响应

```json
{
  "data": {
    "items": [],
    "total": 0
  },
  "request_id": "req_xxx"
}
```

### 19.3 错误响应

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

### 19.4 MVP 错误码

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

---

## 20. 审计日志

### 20.1 MVP 记录范围

记录：

1. 登录成功。
2. 登录失败。
3. 创建、禁用、删除用户。
4. 创建、禁用、删除存储源。
5. 修改存储源公开状态。
6. 修改公开挂载路径。
7. 修改 WebDAV 开关。
8. 修改图床开关。
9. 修改排除规则。
10. 分配或取消存储源权限。
11. 网页端上传、删除、重命名、移动、创建目录。
12. WebDAV 上传、删除、移动、创建目录。
13. 登录用户图床上传。
14. 匿名公共图床上传。
15. Token 生成或重置。
16. 命令行重置管理员密码。

不记录：

1. 普通下载。
2. 目录浏览。
3. 公开图片访问。
4. 公开 raw 文件访问。

### 20.2 审计日志字段

```text
id
actor_type             user / anonymous / system
actor_user_id          可为空
entry_type             web / webdav / image_bed / anonymous_image_bed / admin / cli
action                 upload / delete / move / login_success 等
source_id              可为空
relative_path          可为空
target_relative_path   可为空
ip_address
user_agent
status                 success / failed
error_code             可为空
created_at
```

### 20.3 保留策略

默认最多保留：

```text
10000 条
```

配置：

```yaml
audit:
  enabled: true
  max_entries: 10000
```

`max_entries = 0` 表示不限制。

超过上限时删除最旧记录。

MVP 管理后台只展示最近 200 条。

---

## 21. 后台任务

MVP 只做一个必要后台任务：

```text
清理过期 Session
```

建议每 1 小时执行一次。

删除：

```text
expires_at < now()
```

MVP 不做通用任务系统。

不做：

1. S3 Multipart GC。
2. 缩略图缓存清理。
3. 图床失效图片扫描。
4. 文件索引任务。
5. 定时备份。

审计日志超量清理可以在写入日志后顺手执行，也可以复用 Session 清理任务。

---

## 22. 数据库设计建议

### 22.1 schema_migrations

```sql
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL
);
```

### 22.2 users

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_public_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

`role` 取值：

```text
super_admin
user
```

### 22.3 sessions

```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  csrf_token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### 22.4 user_tokens

可统一保存 WebDAV Token 和图床 Token 哈希。

```sql
CREATE TABLE user_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_type TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id),
  UNIQUE(user_id, token_type)
);
```

`token_type`：

```text
webdav
image_bed
```

### 22.5 storage_sources

```sql
CREATE TABLE storage_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT 0,
  public_read_enabled BOOLEAN NOT NULL DEFAULT 0,
  public_mount_path TEXT UNIQUE,
  webdav_enabled BOOLEAN NOT NULL DEFAULT 1,
  image_bed_enabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

### 22.6 storage_source_exclude_patterns

```sql
CREATE TABLE storage_source_exclude_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(source_id) REFERENCES storage_sources(source_id)
);
```

### 22.7 user_source_permissions

```sql
CREATE TABLE user_source_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(source_id) REFERENCES storage_sources(source_id),
  UNIQUE(user_id, source_id)
);
```

`permission`：

```text
read_only
read_write
```

### 22.8 user_preferences

用于保存用户默认图床目标。

```sql
CREATE TABLE user_preferences (
  user_id INTEGER PRIMARY KEY,
  default_image_bed_source_id TEXT,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(default_image_bed_source_id) REFERENCES storage_sources(source_id)
);
```

### 22.9 system_settings

MVP 可用 key-value 保存少量产品运行设置。

```sql
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);
```

示例 key：

```text
anonymous_image_bed_enabled
anonymous_image_bed_source_id
```

### 22.10 images

```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL,
  owner_user_id INTEGER,
  source_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  original_filename TEXT,
  public_url TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  ext TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id),
  FOREIGN KEY(source_id) REFERENCES storage_sources(source_id)
);
```

索引：

```sql
CREATE INDEX idx_images_owner ON images(owner_type, owner_user_id, created_at);
CREATE INDEX idx_images_source_path ON images(source_id, relative_path);
```

### 22.11 audit_logs

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_user_id INTEGER,
  entry_type TEXT NOT NULL,
  action TEXT NOT NULL,
  source_id TEXT,
  relative_path TEXT,
  target_relative_path TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id)
);
```

索引：

```sql
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_user_id);
```

### 22.12 V2 file_records 规划

V2 配额系统再增加：

```text
file_records
```

字段建议：

```text
id
source_id
relative_path
size
owner_user_id
owner_type
created_by_user_id
updated_by_user_id
mtime
record_status
created_at
updated_at
```

`owner_type`：

```text
user
anonymous
system
unowned
```

已有文件通过扫描导入进入台账。

不使用 xattr、sidecar 文件或 OmniStore 特殊标签污染用户目录。

---

## 23. 后端代码结构

后端采用模块化单体。

建议结构：

```text
cmd/omnistore/
  main.go

internal/config/
  配置加载：默认值 + YAML + 环境变量

internal/db/
  SQLite 初始化、迁移、连接管理

internal/http/
  路由注册、中间件、统一响应、错误处理

internal/auth/
  登录、Session、Cookie、密码哈希、Token 哈希、CSRF

internal/users/
  用户管理

internal/sources/
  存储源管理、路径安全校验、排除规则

internal/files/
  文件列表、上传、下载、删除、移动、重命名

internal/webdav/
  WebDAV 方法实现

internal/imagebed/
  登录用户图床、匿名图床、图片校验、图片公开访问

internal/publicdisk/
  公开网盘虚拟挂载解析、公开目录浏览、raw 文件访问

internal/audit/
  审计日志

internal/locks/
  请求级路径读写锁

internal/security/
  路径规范化、symlink 检查、trusted proxy、IP 解析

internal/models/
  数据结构定义

web/
  React 前端项目

migrations/
  SQLite schema 迁移
```

约束：

1. HTTP handler 只负责解析请求和返回响应。
2. Handler 不直接操作文件系统。
3. 文件系统操作集中在 `internal/files`。
4. 路径安全函数集中在 `internal/security`。
5. 存储源路径校验集中在 `internal/sources`。
6. 权限检查必须统一。
7. WebDAV、REST、图床、公开网盘必须复用核心文件服务。

统一权限函数示例：

```go
CanReadSource(userID, sourceID string) bool
CanWriteSource(userID, sourceID string) bool
IsPathExcluded(sourceID, relativePath string) bool
```

---

## 24. 前端页面范围

### 24.1 公开侧

```text
/                 公开网盘首页
/p/*              公开目录浏览
/raw/*            公开文件 raw 访问，由后端返回文件流
/i/{image_id}.{ext} 图床图片访问，由后端返回图片流
/upload           匿名公共图床上传页
```

`/upload` 只有匿名图床开启时可用。未开启时显示不可用提示。

### 24.2 登录用户侧

```text
/login
/app
/app/sources/{source_id}?path=/xxx
/app/image-bed
/app/settings
```

功能：

1. 登录。
2. 查看可访问存储源。
3. 私有文件管理器。
4. 图床上传。
5. 图床历史墙。
6. 复制图床 URL。
7. 选择默认图床目标。
8. 修改显示名。
9. 修改密码。
10. 生成/重置 WebDAV Token。
11. 生成/重置图床 API Token。

### 24.3 管理员侧

```text
/admin
/admin/sources
/admin/users
/admin/audit-logs
/admin/settings
```

功能：

1. 存储源管理。
2. 用户管理。
3. 权限分配。
4. 匿名公共图床配置。
5. 最近审计日志。
6. 展示运行配置提示。

`/admin/settings` 不提供修改 YAML 配置能力，只显示关键运行信息和配置文件提示。

### 24.4 移动端适配

MVP 做基础响应式。

必须移动端可用：

1. 公开网盘。
2. 匿名图床。
3. 登录页。
4. 登录用户图床。
5. 私有文件浏览、上传、下载、删除、创建目录。

管理员后台优先桌面端，只保证移动端不崩、不严重溢出。

不做：

1. PWA 离线缓存。
2. 手机相册自动备份。
3. 移动端复杂多选手势。
4. 拖拽上传高级体验。

---

## 25. 开发计划

### 25.1 第 0 阶段：项目骨架

目标：跑通后端、前端、数据库、配置和嵌入式静态资源。

任务：

1. 创建 Go 项目结构。
2. 创建 React + Vite 前端项目。
3. 配置 vanilla-extract、Base UI、TanStack Router、TanStack Query。
4. 实现 YAML + 环境变量配置加载。
5. 初始化 SQLite。
6. 实现 migration 机制。
7. 实现统一响应格式和错误码。
8. 实现 request_id 中间件。
9. 前端构建产物通过 go:embed 嵌入。

验收：

1. `omnistore server` 可启动。
2. 浏览器打开 `/` 能看到前端页面。
3. SQLite 自动创建表。
4. `/api/v1/health` 返回正常。

### 25.2 第 1 阶段：用户、登录、Session

任务：

1. 初始化超级管理员流程。
2. 登录 / 退出。
3. Session Cookie。
4. CSRF Token。
5. `/api/v1/auth/me`。
6. 用户表。
7. 用户管理基础接口。
8. 命令行重置管理员密码。

验收：

1. 首次启动可创建超级管理员。
2. 登录后能进入 `/app`。
3. 未登录访问私有 API 返回 401。
4. 写操作没有 CSRF 返回 403。
5. CLI 可重置管理员密码。

### 25.3 第 2 阶段：存储源管理

任务：

1. 存储源表。
2. 创建存储源。
3. 路径安全校验。
4. 防重叠挂载。
5. 读写预检。
6. 排除规则。
7. 禁用 / 删除存储源。
8. 用户权限绑定。
9. 公开挂载路径校验。

验收：

1. 不能挂载系统目录。
2. 不能挂载 OmniStore 数据目录。
3. 不能重叠挂载。
4. 删除存储源不删除物理文件。
5. 普通用户只能看到被分配的存储源。

### 25.4 第 3 阶段：文件核心服务

任务：

1. 路径规范化。
2. symlink 拒绝。
3. 排除规则过滤。
4. 请求级路径锁。
5. 文件列表分页排序。
6. 创建目录。
7. 上传临时文件 + 原子重命名。
8. 下载 + Range。
9. 删除。
10. 重命名。
11. 同源移动。

验收：

1. 路径穿越被拒绝。
2. 排除路径不可见不可访问。
3. 上传中断不污染最终文件名。
4. 同名上传默认 409。
5. 删除图床图片能清理 Images 表。
6. 下载大文件不占用大量内存。

### 25.5 第 4 阶段：公开网盘

任务：

1. 首页公开网盘。
2. `/p/*` 虚拟路径解析。
3. `/raw/*` 文件访问。
4. public_mount_path 冲突检查。
5. 公开目录浏览 UI。
6. raw 文件 inline / download 行为。
7. 缓存头。

验收：

1. 未登录用户可访问 `/`。
2. 只显示公开存储源。
3. public_mount_path 不暴露 source_id。
4. 禁用存储源后公开入口不可访问。

### 25.6 第 5 阶段：私有网盘前端

任务：

1. `/app` 存储源列表。
2. `/app/sources/{source_id}?path=/` 文件管理器。
3. 上传文件。
4. 下载文件。
5. 删除确认。
6. 新建目录。
7. 重命名。
8. 移动。
9. 基础响应式。

验收：

1. 只读用户看不到写操作按钮，后端也拒绝写操作。
2. 读写用户可以完成基础文件操作。
3. 移动不允许跨存储源。
4. 文件列表分页可用。

### 25.7 第 6 阶段：WebDAV

任务：

1. WebDAV Token 生成和重置。
2. Basic Auth。
3. `/dav` 虚拟根目录。
4. `/dav/{source_id}`。
5. `OPTIONS`。
6. `PROPFIND Depth 0/1`。
7. `GET / HEAD / PUT / MKCOL / DELETE / MOVE`。
8. 未实现方法返回 501。

验收：

1. WebDAV 客户端能挂载 `/dav`。
2. 可看到自己有权限的存储源。
3. 可直接挂载 `/dav/{source_id}`。
4. 只读权限不能写。
5. `COPY / LOCK / UNLOCK` 返回 501。

### 25.8 第 7 阶段：登录用户图床

任务：

1. 图床配置读取。
2. 存储源 image_bed_enabled。
3. 用户默认图床目标。
4. 图片格式真实校验。
5. 用户图床上传。
6. `/i/{image_id}.{ext}`。
7. Images 表。
8. 图床历史墙。
9. 删除图片。
10. PicGo 兼容接口。

验收：

1. 用户只能选择有读写权限且启用图床的存储源。
2. 上传后返回 `/i/img_xxx.jpg`。
3. URL 不暴露 source_id。
4. 历史墙只显示当前用户图片。
5. PicGo Token 可以上传。

### 25.9 第 8 阶段：匿名公共图床

任务：

1. SQLite 系统设置。
2. 管理员配置匿名图床开关和目标存储源。
3. 匿名上传页面 `/upload`。
4. 匿名上传接口。
5. IP 限流。
6. 图片校验。
7. 匿名图片落盘。
8. 管理员查看/删除匿名图片。

验收：

1. 默认关闭。
2. 未开启时 `/upload` 显示不可用。
3. 开启后匿名可上传图片。
4. 非图片被拒绝。
5. 超限返回 429。
6. 匿名用户不能删除。

### 25.10 第 9 阶段：审计日志与收尾

任务：

1. 审计日志表。
2. 写操作审计。
3. 登录审计。
4. 权限变更审计。
5. 图床上传审计。
6. 最近 200 条审计日志页面。
7. max_entries 清理。
8. 完善错误码。
9. 完善部署文档。

验收：

1. 关键写操作能查到日志。
2. 不记录普通下载和目录浏览。
3. 日志超过上限会清理旧记录。

---

## 26. MVP 最终验收清单

### 26.1 安装与初始化

1. Docker Compose 可启动。
2. 二进制可启动。
3. 首次启动可创建超级管理员。
4. 配置优先级正确。
5. public_url 生效。

### 26.2 用户与权限

1. 超级管理员可创建普通用户。
2. 普通用户不能进入管理员后台。
3. 普通用户只能访问被分配存储源。
4. 只读用户不能写。
5. 禁用用户所有入口失效。

### 26.3 存储源

1. 禁止系统目录。
2. 禁止数据目录。
3. 禁止重叠挂载。
4. root_path 不可修改。
5. 删除存储源不删除物理文件。
6. 禁用存储源后所有入口不可访问。

### 26.4 文件操作

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

### 26.5 公开网盘

1. `/` 是公开网盘首页。
2. `/p/*` 可浏览公开目录。
3. `/raw/*` 可访问公开文件。
4. public_mount_path 隐藏 source_id。
5. 修改 public_mount_path 后旧链接失效。

### 26.6 WebDAV

1. `/dav` 可显示可访问存储源。
2. `/dav/{source_id}` 可直接挂载。
3. Basic Auth 使用 WebDAV Token。
4. 登录密码不能作为 WebDAV Token 使用。
5. 基础方法可用。
6. 未实现方法返回 501。

### 26.7 图床

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

### 26.8 安全

1. Cookie HttpOnly。
2. SameSite=Lax。
3. 写 API 校验 CSRF。
4. 默认不开放 CORS。
5. trusted proxy 生效。
6. Token 只保存哈希。
7. 密码只保存哈希。
8. 明文 Token 只展示一次。

### 26.9 审计

1. 登录事件记录。
2. 用户管理记录。
3. 存储源管理记录。
4. 权限变更记录。
5. 文件写操作记录。
6. 图床上传记录。
7. 匿名图床上传记录。
8. 审计日志最多保留 10000 条默认值生效。

---

## 27. 给编码模型的硬性禁止事项

编码时不得做以下事情：

1. 不要实现 S3 MVP 半成品。
2. 不要启动 S3 端口。
3. 不要使用 GORM。
4. 不要引入 Redis。
5. 不要引入消息队列。
6. 不要实现复杂 RBAC。
7. 不要做子路径权限。
8. 不要把存储源子路径当成新存储源规避权限。
9. 不要维护完整虚拟文件树。
10. 不要把所有文件写入 SQLite。
11. 不要用 xattr 或 sidecar 文件污染用户目录。
12. 不要直接写最终上传路径。
13. 不要在上传未完成时覆盖原文件。
14. 不要允许路径穿越。
15. 不要跟随 symlink。
16. 不要把系统数据目录挂载成存储源。
17. 不要把删除存储源实现成删除真实文件。
18. 不要让普通用户管理存储源。
19. 不要让匿名用户使用 WebDAV。
20. 不要让 PicGo Token 调用普通文件管理 API。
21. 不要把登录密码当 WebDAV 密码。
22. 不要记录明文密码或 Token。
23. 不要开放宽松 CORS。
24. 不要在 MVP 做分片上传。
25. 不要在 MVP 做回收站。
26. 不要在 MVP 做文件复制。
27. 不要在 MVP 做跨存储源移动。
28. 不要在 MVP 做缩略图缓存系统。
29. 不要在 MVP 做配额系统。
30. 不要在 MVP 支持多实例。

---

## 28. 核心实现心智模型

编码时始终遵循这条路径：

```text
识别访问主体
-> 鉴权
-> 解析 source_id 或 public_mount_path
-> 找到存储源
-> 检查存储源状态
-> 检查权限
-> 规范化相对路径
-> 禁止路径穿越
-> 检查排除规则
-> 检查 symlink
-> 获取路径锁
-> 操作真实文件系统
-> 写数据库记录或审计日志
-> 返回统一响应
```

任何入口都不能绕过这条链路。

入口包括：

1. REST 文件 API。
2. 私有网页文件管理器。
3. 公开网盘。
4. WebDAV。
5. 登录用户图床。
6. 匿名公共图床。
7. 后续 S3。

---

## 29. 结论

OmniStore 的 MVP 应该保持克制：先把本地存储源、用户权限、公开网盘、私有文件管理、WebDAV 和图床打通，并确保路径安全、权限一致、上传可靠、审计可追踪。

S3、Multipart、缩略图、配额、策略、回收站、搜索、分享等能力都保留在路线图里，但不能进入 MVP 实现范围。

MVP 成功的标准不是功能多，而是每条核心路径都稳定、安全、可解释，并且不会污染用户目录、误删真实文件或制造协议半成品。
