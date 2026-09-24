-- OmniStore v1.1.0 file experience: per-user recent files.
-- Kept separate from audit_logs so recent-file navigation works when auditing is disabled.

CREATE TABLE IF NOT EXISTS recent_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_source_id INTEGER NOT NULL REFERENCES storage_sources(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  accessed_at DATETIME NOT NULL,
  UNIQUE (user_id, storage_source_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_recent_files_user_accessed
  ON recent_files(user_id, accessed_at DESC, id DESC);
