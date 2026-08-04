# 数据模型

本文档解释 SQLite 业务表的建议结构与字段语义；数据库迁移文件是最终事实来源。

迁移版本采用 `vMAJOR.MINOR.PATCH`。当前 `v1.0.0` 尚未发布，初始结构统一维护在 `migrations/v1.0.0.sql`；发布后该文件必须冻结。

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

### storage_sources

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

### storage_source_exclude_patterns

```sql
CREATE TABLE storage_source_exclude_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(source_id) REFERENCES storage_sources(source_id)
);
```

### public_mount_redirects

保存公开挂载路径修改前的旧路径；请求命中时动态重定向到同一存储源的当前 `public_mount_path`。

```sql
CREATE TABLE public_mount_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  mount_path TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(source_id) REFERENCES storage_sources(source_id) ON DELETE CASCADE
);
```

约束：

1. 旧路径不作为公开挂载入口展示。
2. 当前挂载路径和旧路径共同参与唯一性及互相包含校验。
3. 存储源删除或当前挂载路径清空时删除对应旧路径。
4. 禁用存储源或关闭公开访问时保留记录，但不提供重定向。

### user_source_permissions

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

### user_preferences

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
anonymous_image_bed_source_id
```

### images

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

API 返回的 `thumbnail_url` 是根据 `image_id` 和 `server.public_url` 计算的派生字段，不写入 `images` 表。缩略图缓存同样不进入 SQLite，其有效性由原图 size + modTime 校验。

### audit_logs

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

### webdav_locks

WebDAV 独占写锁持久化到 SQLite；Token 用于协议状态匹配，不替代用户鉴权。

```sql
CREATE TABLE webdav_locks (
  token TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  depth TEXT NOT NULL CHECK(depth IN ('0', 'infinity')),
  owner_xml TEXT NOT NULL DEFAULT '',
  owner_user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  refreshed_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY(source_id) REFERENCES storage_sources(source_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

`expires_at` 用于访问时惰性清理和每小时后台清理；存储源或锁创建者删除后，关联锁级联删除。

### V2 file_records 规划

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
