-- V1.1：公开挂载路径修改后保留旧路径，并重定向到存储源的当前挂载路径。
CREATE TABLE public_mount_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  mount_path TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(source_id) REFERENCES storage_sources(source_id) ON DELETE CASCADE
);

CREATE INDEX idx_public_mount_redirects_source ON public_mount_redirects(source_id, created_at);
