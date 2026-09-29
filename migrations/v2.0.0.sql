-- OmniStore 2.0.0 — Capability Scope 重构
--
-- 破坏性变更（允许破坏兼容，不允许破坏数据）：
-- 1. storage_sources 移除 public_read_enabled / public_mount_path / image_bed_enabled，
--    新增 s3_enabled（Source Protocol 独立开关）。
-- 2. 新增 site_capability_bindings：四项 Site Capability 单例绑定。
-- 3. 新增 static_asset_settings / static_asset_origins（静态资源发布配置）。
-- 4. 新增 managed_root_registrations（.omnistore/ 托管根所有权登记）。
-- 5. 删除 public_mount_redirects；user_preferences 移除图床 Source 偏好。
--
-- 旧公开挂载与图床 Source 选择按以下规则收敛到新的 Site 绑定：
-- - public_drive：绑定唯一公开挂载源；若存在多个挂载则取挂载路径最靠前者。
-- - image_bed：优先匿名图床已配置且仍存在的源，否则取第一个启用图床的源；
--   仅当匿名图床开启或存在用户偏好时 enabled=1。
-- 旧图片记录继续按自身 storage_source_id 读取，不做物理迁移。

-- 1. Site Capability 绑定：每项能力全站单例。
CREATE TABLE IF NOT EXISTS site_capability_bindings (
  capability TEXT PRIMARY KEY CHECK(capability IN
    ('public_drive', 'image_bed', 'static_assets', 'transfer_center')),
  enabled BOOLEAN NOT NULL DEFAULT 0,
  storage_source_id INTEGER REFERENCES storage_sources(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL
);

INSERT INTO site_capability_bindings (capability, enabled, storage_source_id, revision, updated_at)
  VALUES ('public_drive', 0, NULL, 0, datetime('now')),
         ('image_bed', 0, NULL, 0, datetime('now')),
         ('static_assets', 0, NULL, 0, datetime('now')),
         ('transfer_center', 0, NULL, 0, datetime('now'));

CREATE INDEX IF NOT EXISTS idx_site_capability_source
  ON site_capability_bindings(storage_source_id);

-- 2. 静态资源发布配置（单例）与允许来源白名单。
CREATE TABLE IF NOT EXISTS static_asset_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  publish_root TEXT NOT NULL DEFAULT '',
  public_asset_id TEXT UNIQUE,
  public_origin TEXT,
  cache_mode TEXT NOT NULL DEFAULT 'short' CHECK(cache_mode IN ('short', 'no-cache', 'long')),
  cors_mode TEXT NOT NULL DEFAULT 'public' CHECK(cors_mode IN ('none', 'public', 'allowlist')),
  updated_at DATETIME NOT NULL
);

INSERT INTO static_asset_settings (id, updated_at) VALUES (1, datetime('now'));

CREATE TABLE IF NOT EXISTS static_asset_origins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL
);

-- 3. `.omnistore/` 托管根所有权登记：名称本身不证明归属，
--    初始化托管根的服务必须登记来源 ID、实例标识与随机 nonce。
CREATE TABLE IF NOT EXISTS managed_root_registrations (
  storage_source_id INTEGER PRIMARY KEY REFERENCES storage_sources(id) ON DELETE CASCADE,
  ownership_nonce TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  registered_at DATETIME NOT NULL
);

-- 4. 公开网盘绑定：旧公开挂载收敛为全站单 Source。
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

-- 5. 图床绑定：匿名设置优先，其次第一个启用图床的源。
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

-- 6. storage_sources 重建：删除 public/image-bed 功能字段，新增 s3_enabled。
CREATE TABLE IF NOT EXISTS storage_sources_v2 (
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

-- 7. 删除用户图床 Source 偏好（2.0 全站单绑定，用户不再选择源）。
CREATE TABLE IF NOT EXISTS user_preferences_v2 (
  user_id INTEGER PRIMARY KEY,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

INSERT INTO user_preferences_v2 (user_id, updated_at)
  SELECT user_id, updated_at FROM user_preferences;

DROP TABLE user_preferences;
ALTER TABLE user_preferences_v2 RENAME TO user_preferences;

-- 8. 删除旧公开挂载重定向表与图床 Source 选择设置。
DROP TABLE IF EXISTS public_mount_redirects;

DELETE FROM system_settings WHERE key = 'anonymous_image_bed_storage_source_id';
