# 系统架构

本文档记录技术选型、运行与部署模型、配置边界、系统目录、并发控制、审计与后端代码结构。

## 技术选型

### 后端

1. 语言：Go。
2. 架构：模块化单体。
3. 数据库：SQLite。
4. 数据库访问：`database/sql` + 原生 SQL + Repository 层。
5. SQLite 驱动：优先 `modernc.org/sqlite`，因为 pure Go、无 CGO，便于单二进制跨平台构建。
6. 迁移：按稳定版本命名为 `migrations/vMAJOR.MINOR.PATCH.sql`，按 SemVer 顺序执行并通过 `go:embed` 打包。
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
2. 访问策略、存储源规则与用户绑定。
3. 存储源。
4. 存储源排除规则。
5. 存储源是否公开。
6. 公开挂载路径。
7. 存储源是否启用 WebDAV。
8. 存储源是否启用图床。
9. 存储源硬配额。
10. 用户默认图床目标。
11. 匿名公共图床是否启用。
12. 匿名公共图床目标存储源。
13. Session。
14. Token 哈希。
15. 图床图片记录。
16. 审计日志。

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
  login_rate_limit:
    enabled: true
    window_minutes: 15
    max_failures_per_ip: 50
    max_failures_per_username: 10

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
OMNISTORE_LOGIN_RATE_LIMIT_ENABLED=true
OMNISTORE_LOGIN_RATE_LIMIT_WINDOW_MINUTES=15
OMNISTORE_LOGIN_RATE_LIMIT_MAX_FAILURES_PER_IP=50
OMNISTORE_LOGIN_RATE_LIMIT_MAX_FAILURES_PER_USERNAME=10
OMNISTORE_UPLOAD_MAX_FILE_SIZE_MB=1024
OMNISTORE_UPLOAD_CLEANUP_STALE_FILES=true
OMNISTORE_UPLOAD_TEMP_FILE_MAX_AGE_HOURS=24
OMNISTORE_IMAGE_BED_ROOT_PATH=/images
OMNISTORE_IMAGE_BED_USER_MAX_FILE_SIZE_MB=20
OMNISTORE_IMAGE_BED_ANONYMOUS_MAX_FILE_SIZE_MB=10
```

S3 Secret 加密使用：

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
  operations/
    file-uploads/
    image-uploads/
    s3-multipart-parts/
    s3-multipart-completions/
    transfers/
  trash/
    .operations/
  logs/
```

说明：

1. `omnistore.db`：SQLite 数据库。
2. `keys/`：后续保存 master key 或密钥材料。
3. `cache/`：可重建缓存；1.0.0 / V1 使用 `cache/thumbnails/` 保存图床缩略图。
4. `tmp/`：内部临时任务目录；S3 Multipart 分片位于 `tmp/multipart/{upload_id}/`。
5. `trash/`：回收站真实内容，按随机条目 key 隔离，不位于用户存储源；`.operations/` 保存权限为 `0600` 的短期操作日志和跨盘复制阶段标记，恢复或永久清理后删除对应条目目录。
6. `operations/file-uploads/`：REST、WebDAV 与 S3 共用普通上传的短期 `0600` 意图与 `database-ready` 标记；覆盖写的旧文件备份位于目标同目录，完成或回滚后清理。
7. `operations/image-uploads/`：图床上传的短期 `0600` 意图；`images` 提交前用于删除临时或随机最终文件，提交后只清理日志。
8. `operations/s3-multipart-parts/`：`UploadPart` 文件替换前写入的短期 `0600` 意图；记录新分片摘要与旧 Part SQLite 快照，覆盖写的旧分片备份位于对应 upload 临时目录，提交或回滚后清理。
9. `operations/s3-multipart-completions/`：Multipart 合并前写入的短期 `0600` 完成意图；记录 upload ID、对象、ETag、大小和 SHA-256，最终 ETag 与临时状态原子提交后清理。
10. `operations/transfers/`：跨来源移动的短期 `0600` 意图与阶段标记；数据库提交前用于回滚目标，提交后用于继续删除源路径，完成后清理。
11. `logs/`：可选。1.0.0 可以只输出 stdout。

### 系统数据目录安全规则

系统数据目录不是存储源。

服务启动、CLI 管理命令和测试种子入口都会创建专用数据根目录，并把根目录及 `keys/`、`cache/`、`tmp/`、`operations/`、`trash/` 主动收紧为 `0700`，不依赖进程 `umask`。SQLite 主文件在驱动打开前用 `0600` 原子创建；已有宽权限数据库会在读取前收紧，WAL/SHM 等侧文件继承私有权限。自定义数据库路径位于数据目录之外时只修改数据库文件本身，不修改可能由其他程序共享的既有父目录。

数据根目录必须是专用普通目录，不能直接使用文件系统根、当前工作目录、用户主目录或 symlink；内部固定子目录也不能是 symlink。数据库文件必须是普通文件且不能是 symlink。权限或路径类型无法验证时启动失败，不能为了可用性继续打开敏感数据。

禁止：

1. 把系统数据目录作为存储源。
2. 把系统数据目录的父目录作为存储源。
3. 把系统数据目录的子目录作为存储源。
4. 通过公开网盘、私有网盘、WebDAV、图床暴露系统数据目录。

---

---

## 备份边界

1.0.0 不提供 Web UI 备份/恢复或定时备份任务；V1 阶段提供管理员手动导出系统配置包，但仍不提供自动备份或一键恢复。

必须在部署文档中明确需要备份：

```text
config.yaml
OMNISTORE_DATA_DIR/omnistore.db
OMNISTORE_DATA_DIR/keys/
```

启用 S3 后必须备份 master key。否则数据库恢复后已有 S3 Secret 无法解密。

可以不备份：

```text
OMNISTORE_DATA_DIR/cache/
OMNISTORE_DATA_DIR/tmp/
```

用户真实存储源文件不由 OmniStore MVP 负责备份。管理员应使用自己的 NAS、rsync、restic、borg、文件系统快照或云备份方案。

1.0.0 / V1 配置包包含生效 YAML、经清理的 SQLite 一致性快照、`keys/` 普通文件、清单和恢复说明。导出过程在系统数据目录的 `tmp/` 下创建权限为 `0600` 的临时 ZIP，响应结束后立即删除。密钥收集不跟随 symlink；配置包不包含真实存储源、回收站载荷、缓存、上传临时文件或日志。

为保证包内数据库可独立恢复，副本会清除 Web 登录 Session、密码分享访问 Session、WebDAV 锁、未完成 S3 Multipart 状态和回收站元数据，然后执行 `VACUUM` 与 `foreign_key_check`。在线数据库不受清理影响；有效分享及长期 WebDAV、图床和 S3 凭据保留。因此该功能定位为“系统配置快照”，不是完整文件备份或数据库逐字节归档。

---

---

## 文件锁

### 请求级路径锁

所有读写入口继续使用请求生命周期内的内存读写锁，避免单进程内同时修改同一路径。

### 锁 key

锁 key：

```text
storage_source_id + normalized_relative_path
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
6. 复制。
7. 跨来源移动。

路径锁不是字符串精确锁：同一存储源内，根路径、祖先目录和后代条目视为相交范围；写锁与相交的读写锁互斥，不相交的兄弟路径以及不同存储源仍可并发。不含 `source_key + NUL + path` 结构的配额等协调 key 继续使用精确匹配。等待队列允许不相交请求越过，但冲突请求保持先到顺序，避免持续读流量饿死目录写操作。

复制、移动和重命名涉及源路径和目标路径：

1. 计算两个锁 key。
2. 排序。
3. 按固定顺序加锁。
4. 避免死锁。

跨来源操作把两个存储源 key 也纳入锁 key，并按固定顺序获取。WebDAV 持久锁使用一次多来源原子检查，不能串联两个单来源守卫造成自锁或检查窗口。

跨来源移动还维护磁盘阶段日志：`intent → target-ready → database-ready`。目标数据在写 `target-ready` 前完成文件与目录同步；台账、图床和分享定位提交后才写 `database-ready`，源路径只允许在该阶段之后删除。启动恢复对尚未提交的状态执行反向事务并删除目标，对已提交状态继续 `RemoveAll` 源路径；源删除失败不再尝试用可能残缺的源目录回滚。反向事务直接迁回文件台账，不能通过重新扫描把原所有权降级为 `unowned`。

跨来源复制不直接写最终目标。服务先在目标同级创建严格命名的 `.omnistore-copy-<随机值>.staging`，完整复制并逐级同步目录后，使用同文件系统原子 `rename` 发布。轻量 `cpy-*` 日志记录来源、目标与 staging；`database-ready` 前启动恢复会删除 staging、已发布目标及可能已提交的目标台账，之后只保留最终目标并清理日志。staging 在文件列表、S3 列举、搜索校准、配额和其他递归操作中均作为内部路径跳过，关联日志未恢复时禁止删除任一来源。

同来源重命名/移动和永久删除使用 `pth-*` 路径意图。移动在原子 `rename` 与目录同步后，将 `images`、有效 `file_shares` 和 `file_records` 的路径变更放进一个 SQLite 事务；`database-ready` 前恢复一律把真实路径和全部元数据反向迁回，之后确认目标存在并只清理日志。永久删除不可逆，恢复器会继续 `RemoveAll` 并在单个事务内清理三类元数据。REST、WebDAV DELETE/MOVE 与 S3 DeleteObject 共用该文件服务路径，数据库错误不再被吞掉。

图床上传使用独立的短期操作日志。图片临时文件先 `fsync`，真实格式校验后记录包含随机 `image_id`、临时/最终路径和不可变图片元数据的意图；原子重命名和父目录同步完成后，`images` 与 `file_records` 在同一 SQLite 事务提交。启动恢复以 `images.image_id` 是否存在为提交边界：未提交状态删除内部临时文件或随机最终文件，已提交状态保留当前图片生命周期位置并只删除日志。上传日志恢复安排在跨来源移动与回收站恢复之后，避免把后来合法移动或回收的图片按旧上传路径处理。

普通文件上传在写入时同步计算 SHA-256，临时文件和父目录同步后写入独立意图。新建文件随后原子重命名；覆盖写先把旧目标原子重命名为严格内部备份，再安装新目标。`file_records` 提交后写 `database-ready`，此后只清理临时文件、旧备份和日志，不再根据最初路径改动最终文件，因此提交后发生的合法移动或删除不会被恢复器逆转。标记前的恢复通过临时、最终和备份三者状态，并核对大小、`mtime` 与内容摘要，选择完成新台账或恢复旧目标；日志损坏或不能证明唯一版本时拒绝启动并保留现场。

来源和用户还有一层独立于路径锁的生命周期读写锁。所有会创建、移动或删除真实数据及恢复日志的在线操作持有相关来源和执行用户的共享锁，并在取得锁后重新确认数据库实体仍存在；管理员删除持有独占锁，从等待在途操作结束开始，连续完成回收站/恢复日志复检和数据库删除。锁按“来源、用户、数字 ID”的稳定顺序获取，避免跨来源操作与并发删除形成死锁。Multipart Complete 在写入完成意图后切换到普通上传的共享锁；删除流程会把该意图视为硬冲突，因此锁交接窗口不会留下无来源或无用户的恢复日志。

`UploadPart` 在分片临时文件与目录完成同步后，写入包含 upload 身份、新 MD5/大小/时间和旧 Part SQLite 快照的独立意图。重复 PartNumber 上传先核对旧最终分片摘要，再把旧文件改名为 `.previous`，安装新分片并同步目录，最后原子 upsert Part 和 Upload 活动时间。启动恢复以 Part 行为提交边界：新文件已经唯一安装时补交事务，数据库已经提交时只清理备份和日志，文件替换尚未完成时恢复旧分片或删除新建意图；任何未知文件、摘要不符或缺失唯一旧版本的组合都拒绝启动并保留现场。分片恢复先于 Multipart Complete 恢复执行。

Multipart Complete 在调用普通文件上传前，按客户端选择的 Part 顺序复核每片大小与 MD5，同时计算最终内容 SHA-256，并把旧对象是否存在及其大小、`mtime` 一并写入独立完成意图。普通上传把对象安全落盘后，完成器持有最终对象读锁完成 SHA-256 校验、文件台账幂等写入、`s3_object_etags` upsert 与 `s3_multipart_uploads` 删除；后两者位于同一 SQLite 事务，Part 行通过外键级联删除。启动恢复先运行普通上传恢复，再处理 Multipart 完成意图：Upload 行仍存在且最终摘要匹配、同时能与旧对象状态区分时补交事务；对象不匹配或与同内容旧对象无法区分时只撤销完成意图并保留分片供客户端重试。Upload 行已不存在即视为永久提交，只清理分片目录与日志，不按历史路径读取或复活对象。运行期过期任务跳过带完成意图的 upload ID。

目录操作只需锁目录根路径，锁管理器会自动覆盖其全部后代，不要求递归锁每个子文件。

### WebDAV 持久写锁

1.0.0 / V1 使用 SQLite `webdav_locks` 表，只实现 RFC 4918 独占写锁。锁范围为 `storage_source_id + normalized_relative_path + depth`，支持 `Depth: 0` 和 `Depth: infinity`，并保存创建者、owner XML、刷新时间和过期时间。

持久锁检查位于核心文件服务中，因此 REST、WebDAV、图床等入口无法绕过。文件写操作持有进程级持久锁检查守卫直到真实文件操作完成，避免“检查通过后才创建 LOCK”的竞态；之后仍获取原有请求级路径锁。

删除和移动在同一持久锁临界区内清理已消失资源自身的锁：`DELETE` 删除目标及后代锁根，`MOVE` 删除源路径及后代锁根而不迁移 Token；目标路径之外的祖先锁不受影响。

过期锁在每次持久锁访问时惰性删除，并由后台任务每小时清理。当前仍为单实例架构，不提供分布式锁协调。

### 存储源配额写守卫

有限额存储源的 REST、WebDAV、S3、Multipart Complete 与图床最终写入共享同一进程级 `quota:{source_key}` 写守卫。守卫内实时递归统计全部普通文件，再计算本次最终文件允许占用的最大大小；覆盖写会扣除旧文件大小。内容先写同目录临时文件，发现超限后删除临时文件，不触碰最终路径。

用量统计不跟随 symlink，排除规则不减少物理用量，并只忽略严格匹配 OmniStore 上传临时文件命名的文件。无限额写入只持有共享协调锁，彼此仍可并发；管理员更新配额需要独占同一协调锁，因此会等待进行中的写入结束，新写入也会重新读取最新配额。`file_records` 保存所有权与校准视图，来源物理硬配额仍以实时扫描为准，避免外部直接写入绕过配额事实。

已有目录导入由 HTTP 层编排、`sources` 与 `files` 共同执行：文件服务根据预检规则扫描磁盘快照，`sources.CreateWithInitializer` 随后在根目录拓扑写锁内重做真实路径、重叠、读写和非空检查，非空目录要求显式确认；来源、排除规则和快照中的 `unowned` 台账通过同一个 SQLite 事务提交。扫描或事务失败不会出现内部半成品，直接 API、前端向导和预检后目录变化也不能绕过服务层约束。外部文件系统本身不受数据库锁控制，提交后发生的外部变化仍由手动校准收敛。

全局搜索不引入独立后台任务：`file_records` 的 SQLite 触发器同步维护 `file_search_index` FTS5 trigram 索引。常规写入口即时可搜索；外部直接修改通过管理员校准扫描写入台账和索引。目录实时列表仍直接读取真实文件系统。

文件分享由 `internal/shares` 管理 SQLite 元数据与公开授权，真实文件读取继续复用 `internal/files`。分享不复制内容：同源/跨源移动事务同步其来源与路径；移入回收站时记录 `trash_key` 并停用，恢复时更新路径，永久删除或清理时删除关系。密码解锁会话仅存 Token 哈希并在访问时惰性清理，不新增后台任务。下载次数通过 SQLite 条件更新原子预留，内容仍由 `http.ServeContent` 流式返回。

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
16. 分享创建、撤销和匿名分享下载。
17. 命令行重置管理员密码。

不记录：

1. 普通下载。
2. 目录浏览。
3. 公开图片访问。
4. 公开 raw 文件访问（分享 raw 下载除外，后者需要记录匿名下载审计）。

### 审计日志字段

```text
id
actor_type             user / anonymous / system
actor_user_id          可为空
entry_type             web / webdav / s3 / image_bed / anonymous_image_bed / admin / cli
action                 upload / delete / move / login_success 等
storage_source_id 可为空
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

HTTP/S3 监听前先同步恢复 `trash/.operations/` 中的中断操作。SQLite 中是否存在对应 `trash_entries` 是提交边界：已提交则维持回收站状态，未提交则维持源路径或恢复目标状态；跨文件系统 copy/delete 使用单独的“目标副本已完整落盘”标记判断同时存在的两份数据。损坏日志或无法无损判定的状态会阻止启动并保留现场，不静默猜测。

1. 每小时清理过期 Session。
2. 启动时及每小时清理超过配置时限的上传临时文件。
3. 启动时及每小时清理过期 WebDAV 持久锁。
4. 启动时及每天清理超过 30 天未访问的缩略图缓存。
5. 启动时及每小时清理超过 24 小时未活动的 S3 Multipart 状态与孤儿分片目录；带持久分片或完成意图的 upload ID 必须跳过，交由启动恢复器处理。

Session 删除条件：

```text
expires_at < now()
```

上传临时文件清理只匹配 OmniStore 自身生成的严格文件名，不跟随符号链接；默认时限为 24 小时，可通过配置关闭。

暂不做：

1. 图床失效图片扫描。
2. 定时备份。

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
  登录、Session、Cookie、密码哈希、Token 哈希、Session 级稳定 CSRF

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

internal/s3api/
  Signature V4、基础对象操作、Multipart 状态与协议响应

internal/publicdisk/
  公开网盘虚拟挂载解析、公开目录浏览、raw 文件访问

internal/shares/
  文件与目录分享、密码会话、有效期、下载次数和生命周期同步

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
7. WebDAV、REST、S3、图床、公开网盘必须复用核心文件服务；登录用户入口必须复用路径权限计算。

统一权限函数示例：

```go
PermissionAtPath(user, sourceKey, relativePath string) string
CanReadPath(user, sourceKey, relativePath string) bool
CanWritePath(user, sourceKey, relativePath string) bool
CanWriteSubtree(user, sourceKey, relativePath string) bool
IsPathExcluded(sourceID, relativePath string) bool
```

---
