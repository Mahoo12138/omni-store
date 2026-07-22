# 系统架构

本文档记录技术选型、运行与部署模型、配置边界、系统目录、并发控制、审计与后端代码结构。

## 技术选型

### 后端

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

### 前端

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

### 前端组件约束

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

---

## 运行环境与部署模型

### MVP 生产支持环境

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

### 单实例限制

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

### Docker 路径模型

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

---

## 配置系统

### 配置优先级

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

### YAML 管基础设施，SQLite 管产品状态

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

### 配置示例

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
  cleanup_stale_files: true
  temp_file_max_age_hours: 24

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

### 环境变量命名

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
OMNISTORE_UPLOAD_CLEANUP_STALE_FILES=true
OMNISTORE_UPLOAD_TEMP_FILE_MAX_AGE_HOURS=24
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

---

## 系统数据目录

### 目录结构

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

### 系统数据目录安全规则

系统数据目录不是存储源。

禁止：

1. 把系统数据目录作为存储源。
2. 把系统数据目录的父目录作为存储源。
3. 把系统数据目录的子目录作为存储源。
4. 通过公开网盘、私有网盘、WebDAV、图床暴露系统数据目录。

---

---

## 备份边界

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

---

## 请求级路径锁

### MVP 锁范围

MVP 只做请求生命周期内的内存读写锁。

不做：

1. WebDAV 持久锁。
2. SQLite 锁表。
3. 跨进程锁。
4. 分布式锁。

### 锁 key

锁 key：

```text
source_id + normalized_relative_path
```

所有入口共用同一套锁管理器：

1. REST 文件管理器。
2. WebDAV。
3. 图床上传。
4. 公开 raw 访问。

### 读写规则

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

---

## 审计日志

### MVP 记录范围

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

### 审计日志字段

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

### 保留策略

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

管理后台默认每页展示 50 条，单页最多 200 条；支持按主体、入口、结果和关键字筛选。具体查询参数参见 [API 约定](API.md#审计日志查询)。

---

---

## 后台任务

当前后台任务均由进程内轻量定时器执行，不引入通用任务系统：

1. 每小时清理过期 Session。
2. 启动时及每小时清理超过配置时限的上传临时文件。

Session 删除条件：

```text
expires_at < now()
```

上传临时文件清理只匹配 OmniStore 自身生成的严格文件名，不跟随符号链接；默认时限为 24 小时，可通过配置关闭。

不做：

1. S3 Multipart GC。
2. 缩略图缓存清理。
3. 图床失效图片扫描。
4. 文件索引任务。
5. 定时备份。

审计日志超量清理可以在写入日志后顺手执行，也可以复用 Session 清理任务。

---

---

## 后端代码结构

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
