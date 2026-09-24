-- Per-user bookmarks for files and directories.
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_source_id INTEGER NOT NULL REFERENCES storage_sources(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE (user_id, storage_source_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_created
  ON favorites(user_id, created_at DESC, id DESC);
