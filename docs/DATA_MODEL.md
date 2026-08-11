# 数据模型

本文档解释 SQLite 业务表的建议结构与字段语义；数据库迁移文件是最终事实来源。

迁移版本采用 `vMAJOR.MINOR.PATCH`。`migrations/v1.0.0.sql` 是首个稳定版本的冻结基线；迁移器只执行未记录版本，后续结构变化必须新增更高版本 SQL 文件。

### schema_migrations

```sql
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL
);
```

### users

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

### sessions

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

### user_tokens

开发期初始 schema 中，该表只承载 WebDAV Token；图床 Token 使用独立的 `image_bed_tokens` 表。

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
```

### image_bed_tokens

```sql
CREATE TABLE image_bed_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

约束：

1. `token_id` 全局唯一，用于管理接口定位，不能用于鉴权。
2. `token_hash` 全局唯一，数据库不保存明文 Token。
3. 每个用户最多 10 条记录，限制由服务层在事务内执行。
4. 删除用户时必须同步删除其图床 Token。

### s3_credentials

```sql
CREATE TABLE s3_credentials (
  access_key_id TEXT PRIMARY KEY,
  secret_access_key_encrypted BLOB NOT NULL,
  secret_key_nonce BLOB NOT NULL,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

`access_key_id` 可明文保存；Secret Access Key 使用实例 master key 做 AES-256-GCM
可恢复加密，明文只在创建时返回。每个用户最多保留 10 个 S3 凭据。

### s3_multipart_uploads / s3_multipart_parts / s3_object_etags

```sql
CREATE TABLE s3_multipart_uploads (
  upload_id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);

CREATE TABLE s3_multipart_parts (
  upload_id TEXT NOT NULL,
  part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 10000),
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(upload_id, part_number),
  FOREIGN KEY(upload_id) REFERENCES s3_multipart_uploads(upload_id) ON DELETE CASCADE
);

CREATE TABLE s3_object_etags (
  storage_source_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_unix_nano INTEGER NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(storage_source_id, object_key),
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
```

Upload 记录绑定创建者、存储源与对象 Key；Part 表只保存编号、ETag、大小和时间，真实分片位于
`{data.dir}/tmp/multipart/{upload_id}/`。`updated_at` 用于识别超过 24 小时未活动的上传。
`UploadPart` 在文件替换前把新分片摘要与旧 Part 行快照写入 `operations/s3-multipart-parts/`；覆盖旧 Part 时使用 upload 临时目录内的 `.previous` 备份。Part upsert 与 Upload `updated_at` 刷新位于同一事务，启动恢复以 Part 行是否匹配日志快照决定完成、清理或回滚，不新增业务表。
`s3_object_etags` 保存完成后的 Multipart ETag，并用文件 size + mtime 检测 S3 之外的修改；
Multipart 完成时该表的 upsert 与 `s3_multipart_uploads` 删除位于同一事务，磁盘完成日志负责衔接最终对象与该事务；
普通 PUT、DELETE 或检测到物理文件变化时会删除对应记录。

### storage_sources

```sql
CREATE TABLE storage_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT 0,
  public_read_enabled BOOLEAN NOT NULL DEFAULT 0,
  public_mount_path TEXT UNIQUE,
  webdav_enabled BOOLEAN NOT NULL DEFAULT 1,
  image_bed_enabled BOOLEAN NOT NULL DEFAULT 0,
  quota_bytes INTEGER NOT NULL DEFAULT 0 CHECK(quota_bytes >= 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
```

`id` 只用于 SQLite 内部外键；`key` 在创建时由服务端生成，格式为 `src-` 加 16 位小写十六进制随机字符串。Web、WebDAV 和 S3 把 key 当不透明协议值，常规界面使用 `name` 识别存储源。
`quota_bytes=0` 表示不限制；大于 0 时表示该存储源全部普通文件的物理硬配额。1.0.0 / V2 通过实时扫描计算物理用量，并使用文件台账提供校准视图和所有权统计。

### storage_source_exclude_patterns

```sql
CREATE TABLE storage_source_exclude_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_source_id INTEGER NOT NULL,
  pattern TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
```

### public_mount_redirects

保存公开挂载路径修改前的旧路径；请求命中时动态重定向到同一存储源的当前 `public_mount_path`。

```sql
CREATE TABLE public_mount_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_source_id INTEGER NOT NULL,
  mount_path TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
```

约束：

1. 旧路径不作为公开挂载入口展示。
2. 当前挂载路径和旧路径共同参与唯一性及互相包含校验。
3. 存储源删除或当前挂载路径清空时删除对应旧路径。
4. 禁用存储源或关闭公开访问时保留记录，但不提供重定向。

### access_policies

```sql
CREATE TABLE access_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE access_policy_sources (
  policy_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(policy_id, storage_source_id),
  FOREIGN KEY(policy_id) REFERENCES access_policies(id) ON DELETE CASCADE,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);

CREATE TABLE access_policy_path_rules (
  policy_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  path_prefix TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(policy_id, storage_source_id, path_prefix),
  FOREIGN KEY(policy_id, storage_source_id)
    REFERENCES access_policy_sources(policy_id, storage_source_id) ON DELETE CASCADE
);

CREATE TABLE user_access_policies (
  user_id INTEGER NOT NULL,
  policy_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(user_id, policy_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(policy_id) REFERENCES access_policies(id) ON DELETE CASCADE
);
```

`permission`：

```text
read_only
read_write
```

策略 key 由服务端生成，格式为 `pol-` 加 16 位小写十六进制随机字符串，仅用于管理 API 定位。
一个策略可以绑定多个用户和多个存储源；同一用户通过多个策略命中同一存储源时，
`read_write` 高于 `read_only`。超级管理员不需要绑定策略，始终拥有全部存储源的读写权限。

`access_policy_sources.permission` 是该策略在整个存储源上的默认权限。可选的
`access_policy_path_rules` 使用规范化后的源内相对路径（无前导 `/`）覆盖默认权限：同一策略内
匹配目标路径本身或其祖先路径的规则中，路径前缀最长者生效；再将用户绑定的全部策略按
`read_write` 高于 `read_only` 合并。根目录继续使用源级默认权限，不能创建空路径规则。
路径规则不表示独立存储源，也不维护文件级 ACL。

### user_preferences

用于保存用户默认图床目标。

```sql
CREATE TABLE user_preferences (
  user_id INTEGER PRIMARY KEY,
  default_image_bed_storage_source_id INTEGER,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(default_image_bed_storage_source_id) REFERENCES storage_sources(id) ON DELETE SET NULL
);
```

### system_settings

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
anonymous_image_bed_storage_source_id
```

### images

```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL,
  owner_user_id INTEGER,
  storage_source_id INTEGER NOT NULL,
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
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);
```

索引：

```sql
CREATE INDEX idx_images_owner ON images(owner_type, owner_user_id, created_at);
CREATE INDEX idx_images_source_path ON images(storage_source_id, relative_path);
```

API 返回的 `thumbnail_url` 是根据 `image_id` 和 `server.public_url` 计算的派生字段，不写入 `images` 表。缩略图缓存同样不进入 SQLite，其有效性由原图 size + modTime 校验。

图床最终文件完成 `fsync + rename + 目录同步` 后，`images` 与对应的 active `file_records` 使用同一个 SQLite 事务写入。短期上传意图保存在系统数据目录 `operations/image-uploads/`，不新增数据库迁移；恢复时以唯一 `image_id` 是否存在判断事务是否提交。图片提交后允许正常移动、回收或删除，陈旧日志不能把当前路径回退到上传时位置。

### audit_logs

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_user_id INTEGER,
  entry_type TEXT NOT NULL,
  action TEXT NOT NULL,
  storage_source_id INTEGER,
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

### webdav_locks

WebDAV 独占写锁持久化到 SQLite；Token 用于协议状态匹配，不替代用户鉴权。

```sql
CREATE TABLE webdav_locks (
  token TEXT PRIMARY KEY,
  storage_source_id INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  depth TEXT NOT NULL CHECK(depth IN ('0', 'infinity')),
  owner_xml TEXT NOT NULL DEFAULT '',
  owner_user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  refreshed_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

`expires_at` 用于访问时惰性清理和每小时后台清理；存储源或锁创建者删除后，关联锁级联删除。

### file_records

`file_records` 是 1.0.0 / V2 的普通文件元数据台账，用于所有权、用户配额、来源用量校准和搜索；真实文件系统仍是内容与目录结构的最终事实来源。

```text
file_records
```

核心字段：

```text
id
storage_source_id
relative_path
size
owner_user_id
owner_type
created_by_user_id
updated_by_user_id
mtime_unix_nano
record_status
trash_key
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

`(storage_source_id, relative_path)` 唯一。`record_status` 使用 `active / trash`；回收文件的 `relative_path` 改为内部 `trash_key + 子路径` 并设置 `trash_key`，因此原路径可以创建新内容。恢复时重建目标路径并清除 `trash_key`。常规写入口同步 upsert，永久删除和移动同步清理或变更路径。已有目录首次确认导入时，来源、排除规则和磁盘快照中的 `unowned` 记录在同一个事务中创建；后续校准扫描只处理 `active` 台账并保留已知所有权。

### file_search_index

`file_search_index` 是由 `file_records` 触发器维护的 FTS5 trigram 虚拟表，只保存 `active` 文件的相对路径。新增、重命名、移动、回收、恢复和删除台账记录时同步更新索引；迁移不会通过重放旧基线修复索引，后续修正必须使用新版本迁移或显式校准流程。

三个及以上字符的搜索使用 trigram 索引以支持路径内子串匹配；两个字符的关键字使用字面包含查询，兼顾常见双字中文搜索。索引只负责候选匹配，来源授权、禁用状态和排除规则仍在返回结果前校验。真实文件系统是最终事实来源，外部直接修改需要执行台账校准后才会反映到搜索结果。

`users.quota_bytes=0` 表示不限；大于 0 时，用户拥有的 `active + trash` 文件大小之和不得超过该值。回收站仍计入用户配额，永久清理后释放；复制计入执行用户，跨来源移动保留归属且全局用户用量不重复增长。

跨来源移动的崩溃阶段不写入业务表，而是短期保存在系统数据目录 `operations/transfers/`。`target-ready` 只证明目标副本已完整同步；`database-ready` 证明 `file_records`、`images` 和 `file_shares` 的目标定位事务已经提交。提交前恢复会把可能已经切换的台账原样迁回来源以保留所有权，提交后恢复只完成源路径删除。

### file_shares

`file_shares` 保存登录用户创建的文件或目录分享关系，不保存或复制文件内容。核心字段：

```text
id
share_key
storage_source_id
relative_path
entry_type
created_by_user_id
password_hash
expires_at
max_downloads
download_count
trash_key
last_accessed_at
created_at
```

`share_key` 是密码学安全随机生成的唯一公开定位符。`password_hash` 可空且只保存 bcrypt 哈希。`max_downloads=0` 表示不限制；下载前通过单条条件更新原子增加计数。`trash_key` 可空，目标进入回收站时关联对应条目并暂时停用；恢复时更新来源内路径并清空，永久清理通过外键级联删除分享。

同源或跨来源移动同步更新 `storage_source_id + relative_path`；永久删除清理目标及目录子树上的分享。删除来源或创建者会级联撤销关联分享，不影响真实文件。

### share_access_sessions

密码分享解锁后使用短期访问会话：

```text
id
share_id
token_hash
expires_at
created_at
```

浏览器只持有随机明文 Token 的 `HttpOnly` Cookie，数据库只保存哈希。会话最长 12 小时且不超过分享有效期；撤销分享时级联删除，过期记录在校验时惰性清理。

### trash_entries

回收站顶层条目保存 `trash_key`、来源、原路径、类型、文件数、总大小、删除用户和时间。物理内容位于系统 `data/trash/{trash_key}/payload`，不属于任何用户存储源。`file_records.trash_key` 和 `images.trash_key` 关联条目；图片在回收期间不参与历史墙或公开读取，恢复后继续使用原 `image_id` 与公开 URL。

`storage_source_id` 和 `deleted_by_user_id` 都使用限制删除语义：来源或用户的回收站非空时，不能删除对应来源/用户记录，必须先恢复或永久清理，避免物理内容成为孤儿。

不使用 xattr、sidecar 文件或 OmniStore 特殊标签污染用户目录。

---
