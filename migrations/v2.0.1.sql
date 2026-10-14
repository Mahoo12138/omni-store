-- 静态 HTTP 从全站单例能力改为每个存储源独立的匿名只读协议。
-- 保留已有公开标识、配置版本、启停状态及来源白名单；不触碰磁盘文件。
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

INSERT INTO source_static_access
  (storage_source_id, enabled, publish_root, public_asset_id, public_origin, cache_mode, cors_mode, revision, updated_at)
SELECT b.storage_source_id, b.enabled, s.publish_root, s.public_asset_id,
       COALESCE(s.public_origin, ''), s.cache_mode, s.cors_mode, b.revision, b.updated_at
FROM site_capability_bindings b JOIN static_asset_settings s ON s.id = 1
WHERE b.capability = 'static_assets' AND b.storage_source_id IS NOT NULL
  AND s.public_asset_id IS NOT NULL AND s.public_asset_id != '';

INSERT INTO source_static_origins (storage_source_id, origin, created_at)
SELECT a.storage_source_id, o.origin, o.created_at
FROM source_static_access a CROSS JOIN static_asset_origins o;

DROP TABLE static_asset_origins;
DROP TABLE static_asset_settings;

CREATE TABLE site_capability_bindings_next (
  capability TEXT PRIMARY KEY CHECK(capability IN ('public_drive', 'image_bed', 'transfer_center')),
  enabled BOOLEAN NOT NULL DEFAULT 0,
  storage_source_id INTEGER REFERENCES storage_sources(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL
);
INSERT INTO site_capability_bindings_next
SELECT * FROM site_capability_bindings WHERE capability != 'static_assets';
DROP TABLE site_capability_bindings;
ALTER TABLE site_capability_bindings_next RENAME TO site_capability_bindings;
CREATE INDEX idx_site_capability_source ON site_capability_bindings(storage_source_id);
