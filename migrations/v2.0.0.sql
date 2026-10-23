-- OmniStore 2.0.0 — Capability Scope 重构 + 文件流转中心
--
-- 破坏性变更（允许破坏兼容，不允许破坏数据）：
-- 1. storage_sources 移除 public_read_enabled / public_mount_path / image_bed_enabled，
--    新增 s3_enabled（Source Protocol 独立开关）。
-- 2. site_capability_bindings 收敛为三项 Site Capability；静态 HTTP 不再是全站单例能力。
-- 3. 新增 source_static_access / source_static_origins：每个存储源独立的匿名只读发布。
-- 4. 新增 managed_root_registrations（.omnistore/ 托管根所有权登记）。
-- 5. 删除 public_mount_redirects；user_preferences 移除图床 Source 偏好。
-- 6. 新增文件流转中心台账：发送任务、收集任务、访客身份、访问会话与下载名额声明。
--
-- 旧公开挂载与图床 Source 选择按以下规则收敛到新的 Site 绑定：
-- - public_drive：绑定唯一公开挂载源；若存在多个挂载则取挂载路径最靠前者。
-- - image_bed：优先匿名图床已配置且仍存在的源，否则取第一个启用图床的源；
--   仅当匿名图床开启或存在用户偏好时 enabled=1。
-- - 静态 HTTP：不自动发布任何源。旧 public_read_enabled/public_mount_path 只用于
--   收敛公开网盘绑定，不能推断发布范围；需要公开静态资源时由管理员显式配置。
-- 旧图片记录继续按自身 storage_source_id 读取，不做物理迁移。

-- 1. Site Capability 绑定：每项能力全站单例。
CREATE TABLE site_capability_bindings (
  capability TEXT PRIMARY KEY CHECK(capability IN
    ('public_drive', 'image_bed', 'transfer_center')),
  enabled BOOLEAN NOT NULL DEFAULT 0,
  storage_source_id INTEGER REFERENCES storage_sources(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL
);

INSERT INTO site_capability_bindings (capability, enabled, storage_source_id, revision, updated_at)
  VALUES ('public_drive', 0, NULL, 0, datetime('now')),
         ('image_bed', 0, NULL, 0, datetime('now')),
         ('transfer_center', 0, NULL, 0, datetime('now'));

-- 2. 公开网盘绑定：旧公开挂载收敛为全站单 Source。
UPDATE site_capability_bindings SET enabled = 1,
  storage_source_id = (
    SELECT s.id FROM storage_sources s
    WHERE s.public_read_enabled = 1 AND s.public_mount_path IS NOT NULL
    ORDER BY s.public_mount_path
    LIMIT 1
  )
WHERE capability = 'public_drive'
  AND EXISTS (
    SELECT 1 FROM storage_sources s
    WHERE s.public_read_enabled = 1 AND s.public_mount_path IS NOT NULL
  );

-- 3. 图床绑定：匿名设置优先，其次第一个启用图床的源。
UPDATE site_capability_bindings SET enabled = 1,
  storage_source_id = COALESCE(
    (
      SELECT s.id FROM storage_sources s
      JOIN system_settings cfg ON cfg.key = 'anonymous_image_bed_storage_source_id'
        AND CAST(cfg.value AS INTEGER) = s.id
      LIMIT 1
    ),
    (
      SELECT s.id FROM storage_sources s
      WHERE s.image_bed_enabled = 1
      ORDER BY s.id
      LIMIT 1
    )
  )
WHERE capability = 'image_bed'
  AND (
    EXISTS (
      SELECT 1 FROM system_settings
      WHERE key = 'anonymous_image_bed_enabled' AND value = 'true'
    )
    OR EXISTS (SELECT 1 FROM user_preferences WHERE default_image_bed_storage_source_id IS NOT NULL)
  );

-- 4. 按源静态 HTTP 发布配置与允许来源白名单。默认全部关闭：
--    升级不迁移任何发布身份，避免把旧公开挂载误当成静态资源站点。
CREATE TABLE source_static_access (
  storage_source_id INTEGER PRIMARY KEY REFERENCES storage_sources(id) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT 0,
  publish_root TEXT NOT NULL,
  public_asset_id TEXT NOT NULL UNIQUE,
  public_origin TEXT NOT NULL DEFAULT '',
  cache_mode TEXT NOT NULL DEFAULT 'short' CHECK(cache_mode IN ('short', 'no-cache', 'long')),
  cors_mode TEXT NOT NULL DEFAULT 'public' CHECK(cors_mode IN ('none', 'public', 'allowlist')),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL
);

CREATE TABLE source_static_origins (
  storage_source_id INTEGER NOT NULL REFERENCES source_static_access(storage_source_id) ON DELETE CASCADE ON UPDATE CASCADE,
  origin TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (storage_source_id, origin)
);

-- 5. storage_sources 重建：删除 public/image-bed 功能字段，新增 s3_enabled。
CREATE TABLE storage_sources_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL,
  is_disabled BOOLEAN NOT NULL DEFAULT 0,
  webdav_enabled BOOLEAN NOT NULL DEFAULT 1,
  s3_enabled BOOLEAN NOT NULL DEFAULT 0,
  quota_bytes INTEGER NOT NULL DEFAULT 0 CHECK(quota_bytes >= 0),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

INSERT INTO storage_sources_v2
  (id, key, name, description, root_path, is_disabled, webdav_enabled, s3_enabled, quota_bytes, created_at, updated_at)
SELECT id, key, name, description, root_path, is_disabled, webdav_enabled, 0, quota_bytes, created_at, updated_at
FROM storage_sources;

DROP TABLE storage_sources;
ALTER TABLE storage_sources_v2 RENAME TO storage_sources;

CREATE INDEX idx_site_capability_source ON site_capability_bindings(storage_source_id);

-- 6. 删除用户图床 Source 偏好（2.0 全站单绑定，用户不再选择源）。
CREATE TABLE user_preferences_v2 (
  user_id INTEGER PRIMARY KEY,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

INSERT INTO user_preferences_v2 (user_id, updated_at)
  SELECT user_id, updated_at FROM user_preferences;

DROP TABLE user_preferences;
ALTER TABLE user_preferences_v2 RENAME TO user_preferences;

-- 7. 删除旧公开挂载重定向表与图床 Source 选择设置。
DROP TABLE IF EXISTS public_mount_redirects;

DELETE FROM system_settings WHERE key = 'anonymous_image_bed_storage_source_id';

-- 8. `.omnistore/` 托管根所有权登记：名称本身不证明归属，
--    初始化托管根的服务必须登记来源 ID、实例标识与随机 nonce。
CREATE TABLE managed_root_registrations (
  storage_source_id INTEGER PRIMARY KEY REFERENCES storage_sources(id) ON DELETE CASCADE,
  ownership_nonce TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  registered_at DATETIME NOT NULL
);

-- 9. 图床托管台账作用域（IMG）：普通校准/FTS 只处理 file scope；
--    image_bed scope 只能由图床服务写入与维护。
ALTER TABLE file_records ADD COLUMN resource_scope TEXT NOT NULL DEFAULT 'file';

UPDATE file_records SET resource_scope = 'image_bed'
WHERE EXISTS (
  SELECT 1 FROM images
  WHERE images.storage_source_id = file_records.storage_source_id
    AND images.relative_path = file_records.relative_path
);

CREATE INDEX idx_file_records_scope
  ON file_records(resource_scope, record_status);

-- 10. 图床保留策略（IMG-04）：默认不自动过期；设置保留期后由服务写入绝对失效时间。
ALTER TABLE images ADD COLUMN expires_at DATETIME;

-- 11. FTS 只索引 file scope 的 active 行（普通搜索不依赖图片台账）。
DROP TRIGGER IF EXISTS trg_file_search_insert;
DROP TRIGGER IF EXISTS trg_file_search_update;
DROP TRIGGER IF EXISTS trg_file_search_delete;

CREATE TRIGGER trg_file_search_insert
AFTER INSERT ON file_records
WHEN NEW.record_status = 'active' AND NEW.resource_scope = 'file'
BEGIN
  INSERT INTO file_search_index(rowid, relative_path) VALUES (NEW.id, NEW.relative_path);
END;

CREATE TRIGGER trg_file_search_update
AFTER UPDATE OF relative_path, record_status, resource_scope ON file_records
BEGIN
  DELETE FROM file_search_index WHERE rowid = OLD.id;
  INSERT INTO file_search_index(rowid, relative_path)
    SELECT NEW.id, NEW.relative_path WHERE NEW.record_status = 'active' AND NEW.resource_scope = 'file';
END;

CREATE TRIGGER trg_file_search_delete
AFTER DELETE ON file_records
BEGIN
  DELETE FROM file_search_index WHERE rowid = OLD.id;
END;

-- 按 scope 重建索引：历史 image_bed 行（旧图片台账）退出普通搜索。
DELETE FROM file_search_index
WHERE rowid NOT IN (SELECT id FROM file_records
  WHERE record_status = 'active' AND resource_scope = 'file');
INSERT INTO file_search_index(rowid, relative_path)
SELECT id, relative_path FROM file_records
WHERE record_status = 'active' AND resource_scope = 'file'
  AND id NOT IN (SELECT rowid FROM file_search_index);

-- 12. 文件流转中心（2.0 Epic B / Phase 4）：独立 domain 台账，不写 file_records。
-- 载荷物理位置：`.omnistore/transfer/send/<public_key>/` 与
-- `.omnistore/transfer/collect/<public_key>/<submission_id>/`；
-- 源物理用量照常统计这些字节；绑定 Source 是创建时的快照，重绑只影响新任务。
--
-- 访客身份仅用于文件中转，不创建普通用户、登录 Session 或存储权限。
CREATE TABLE transfer_guest_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL
);

CREATE INDEX idx_transfer_guest_expiry ON transfer_guest_identities(expires_at);

-- 任务所有者二选一：登录用户或访客身份。访客删除受 RESTRICT 保护，
-- 避免历史任务的所有者被静默抹掉。
-- require_code 默认 1：分享链接可直接取件/提交，只有显式关闭时才免码。
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_key TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER REFERENCES users(id),
  owner_guest_id INTEGER REFERENCES transfer_guest_identities(id) ON DELETE RESTRICT,
  storage_source_id INTEGER NOT NULL REFERENCES storage_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  pickup_code_hash TEXT NOT NULL,
  password_hash TEXT,
  max_downloads INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0,
  expires_at DATETIME,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'revoked', 'expired')),
  total_files INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  finalized_at DATETIME,
  revoked_at DATETIME,
  updated_at DATETIME NOT NULL,
  require_code INTEGER NOT NULL DEFAULT 1 CHECK(require_code IN (0, 1)),
  CHECK((owner_user_id IS NOT NULL AND owner_guest_id IS NULL) OR
        (owner_user_id IS NULL AND owner_guest_id IS NOT NULL))
);

CREATE INDEX idx_transfers_owner ON transfers(owner_user_id, created_at);
CREATE INDEX idx_transfers_guest ON transfers(owner_guest_id, status);
CREATE INDEX idx_transfers_source ON transfers(storage_source_id);
CREATE INDEX idx_transfers_gc ON transfers(status, expires_at);

CREATE TABLE transfer_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  ext TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  UNIQUE(transfer_id, relative_path)
);

CREATE TABLE transfer_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_key TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER REFERENCES users(id),
  owner_guest_id INTEGER REFERENCES transfer_guest_identities(id) ON DELETE RESTRICT,
  storage_source_id INTEGER NOT NULL REFERENCES storage_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  code_hash TEXT NOT NULL,
  password_hash TEXT,
  max_file_size INTEGER,
  max_total_size INTEGER,
  require_name INTEGER NOT NULL DEFAULT 0,
  require_note INTEGER NOT NULL DEFAULT 0,
  allowed_exts TEXT NOT NULL DEFAULT '',
  expires_at DATETIME,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed', 'revoked', 'expired')),
  total_files INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  closed_at DATETIME,
  updated_at DATETIME NOT NULL,
  require_code INTEGER NOT NULL DEFAULT 1 CHECK(require_code IN (0, 1)),
  CHECK((owner_user_id IS NOT NULL AND owner_guest_id IS NULL) OR
        (owner_user_id IS NULL AND owner_guest_id IS NOT NULL))
);

CREATE INDEX idx_transfer_collections_owner ON transfer_collections(owner_user_id, created_at);
CREATE INDEX idx_transfer_collections_guest ON transfer_collections(owner_guest_id, status);
CREATE INDEX idx_transfer_collections_source ON transfer_collections(storage_source_id);
CREATE INDEX idx_transfer_collections_gc ON transfer_collections(status, expires_at);

CREATE TABLE transfer_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES transfer_collections(id) ON DELETE CASCADE,
  submitter_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL
);

CREATE INDEX idx_transfer_submissions_collection ON transfer_submissions(collection_id, created_at);

CREATE TABLE transfer_submission_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES transfer_submissions(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  ext TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  UNIQUE(submission_id, relative_path)
);

CREATE TABLE transfer_access_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  transfer_id INTEGER REFERENCES transfers(id) ON DELETE CASCADE,
  collection_id INTEGER REFERENCES transfer_collections(id) ON DELETE CASCADE,
  ip_address TEXT,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL
);

CREATE INDEX idx_transfer_access_sessions_gc ON transfer_access_sessions(expires_at);
