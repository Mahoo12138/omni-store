-- OmniStore v1.0.0 初始 schema。
-- v1.0.0 尚未发布；首个稳定版本发布前的所有结构变更均合并在此文件中。
-- SQLite 只保存系统数据：用户、权限、配置、Session、Token、S3 Multipart 状态、图床流水、WebDAV 锁、审计日志。

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_public_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- super_admin / user
  is_disabled BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
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

CREATE TABLE IF NOT EXISTS user_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_type TEXT NOT NULL, -- webdav
  token_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id),
  UNIQUE(user_id, token_type)
);

-- 图床 API Token 可按客户端创建多个命名凭据；明文只在创建时返回。
CREATE TABLE IF NOT EXISTS image_bed_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_image_bed_tokens_user ON image_bed_tokens(user_id, created_at);

-- S3 Signature V4 需要使用原始 Secret 重新计算签名，因此 Secret 使用 master key
-- 做可恢复加密；明文只在创建时返回。
CREATE TABLE IF NOT EXISTS s3_credentials (
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

CREATE INDEX IF NOT EXISTS idx_s3_credentials_owner ON s3_credentials(owner_user_id, created_at);

-- S3 Multipart 上传状态与 Part 元数据；真实分片保存在系统 tmp/multipart 下。
CREATE TABLE IF NOT EXISTS s3_multipart_uploads (
  upload_id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_s3_multipart_uploads_owner ON s3_multipart_uploads(owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_s3_multipart_uploads_updated ON s3_multipart_uploads(updated_at);

CREATE TABLE IF NOT EXISTS s3_multipart_parts (
  upload_id TEXT NOT NULL,
  part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 10000),
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(upload_id, part_number),
  FOREIGN KEY(upload_id) REFERENCES s3_multipart_uploads(upload_id) ON DELETE CASCADE
);

-- Multipart ETag 不是最终文件 MD5；保留 size + mtime 用于检测 S3 之外的文件变更。
CREATE TABLE IF NOT EXISTS s3_object_etags (
  storage_source_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_unix_nano INTEGER NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(storage_source_id, object_key),
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storage_sources (
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
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_source_exclude_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_source_id INTEGER NOT NULL,
  pattern TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS access_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS access_policy_sources (
  policy_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  permission TEXT NOT NULL, -- read_only / read_write
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(policy_id, storage_source_id),
  FOREIGN KEY(policy_id) REFERENCES access_policies(id) ON DELETE CASCADE,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_access_policies (
  user_id INTEGER NOT NULL,
  policy_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(user_id, policy_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(policy_id) REFERENCES access_policies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY,
  default_image_bed_storage_source_id INTEGER,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(default_image_bed_storage_source_id) REFERENCES storage_sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL, -- user / anonymous
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

CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_type, owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_images_source_path ON images(storage_source_id, relative_path);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL, -- user / anonymous / system
  actor_user_id INTEGER,
  entry_type TEXT NOT NULL, -- web / webdav / s3 / image_bed / anonymous_image_bed / admin / cli
  action TEXT NOT NULL,
  storage_source_id INTEGER,
  relative_path TEXT,
  target_relative_path TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL, -- success / failed
  error_code TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_user_id);

-- 公开挂载路径修改后保留旧路径，并重定向到存储源的当前挂载路径。
CREATE TABLE IF NOT EXISTS public_mount_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_source_id INTEGER NOT NULL,
  mount_path TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_public_mount_redirects_source ON public_mount_redirects(storage_source_id, created_at);

-- WebDAV 独占写锁跨请求、跨进程重启持久化；过期锁由访问时及后台任务清理。
CREATE TABLE IF NOT EXISTS webdav_locks (
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

CREATE INDEX IF NOT EXISTS idx_webdav_locks_source_path ON webdav_locks(storage_source_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_webdav_locks_expires_at ON webdav_locks(expires_at);
