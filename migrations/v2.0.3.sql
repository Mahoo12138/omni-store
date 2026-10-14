-- 访客身份仅用于文件中转，不创建普通用户、登录 Session 或存储权限。
CREATE TABLE transfer_guest_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL
);
CREATE INDEX idx_transfer_guest_expiry ON transfer_guest_identities(expires_at);

CREATE TABLE transfers_next (
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
INSERT INTO transfers_next
  (id, public_key, owner_user_id, storage_source_id, title, description, pickup_code_hash,
   password_hash, max_downloads, download_count, expires_at, status, total_files, total_size,
   created_at, finalized_at, revoked_at, updated_at, require_code)
SELECT id, public_key, owner_user_id, storage_source_id, title, description, pickup_code_hash,
       password_hash, max_downloads, download_count, expires_at, status, total_files, total_size,
       created_at, finalized_at, revoked_at, updated_at, require_code FROM transfers;
INSERT INTO sqlite_sequence (name, seq)
SELECT 'transfers_next', seq FROM sqlite_sequence WHERE name = 'transfers'
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'transfers_next');
UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'transfers'), 0))
WHERE name = 'transfers_next';
DROP TABLE transfers;
ALTER TABLE transfers_next RENAME TO transfers;
CREATE INDEX idx_transfers_owner ON transfers(owner_user_id, created_at);
CREATE INDEX idx_transfers_guest ON transfers(owner_guest_id, status);
CREATE INDEX idx_transfers_source ON transfers(storage_source_id);
CREATE INDEX idx_transfers_gc ON transfers(status, expires_at);

CREATE TABLE transfer_collections_next (
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
INSERT INTO transfer_collections_next
  (id, public_key, owner_user_id, storage_source_id, title, description, code_hash, password_hash,
   max_file_size, max_total_size, require_name, require_note, allowed_exts, expires_at, status,
   total_files, total_size, created_at, closed_at, updated_at, require_code)
SELECT id, public_key, owner_user_id, storage_source_id, title, description, code_hash, password_hash,
       max_file_size, max_total_size, require_name, require_note, allowed_exts, expires_at, status,
       total_files, total_size, created_at, closed_at, updated_at, require_code FROM transfer_collections;
INSERT INTO sqlite_sequence (name, seq)
SELECT 'transfer_collections_next', seq FROM sqlite_sequence WHERE name = 'transfer_collections'
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'transfer_collections_next');
UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'transfer_collections'), 0))
WHERE name = 'transfer_collections_next';
DROP TABLE transfer_collections;
ALTER TABLE transfer_collections_next RENAME TO transfer_collections;
CREATE INDEX idx_transfer_collections_owner ON transfer_collections(owner_user_id, created_at);
CREATE INDEX idx_transfer_collections_guest ON transfer_collections(owner_guest_id, status);
CREATE INDEX idx_transfer_collections_source ON transfer_collections(storage_source_id);
CREATE INDEX idx_transfer_collections_gc ON transfer_collections(status, expires_at);
