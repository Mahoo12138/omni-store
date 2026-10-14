-- 分享链接可直接取件/提交；存量任务保留原来的取件码/收件码要求。
ALTER TABLE transfers ADD COLUMN require_code INTEGER NOT NULL DEFAULT 1 CHECK(require_code IN (0, 1));
ALTER TABLE transfer_collections ADD COLUMN require_code INTEGER NOT NULL DEFAULT 1 CHECK(require_code IN (0, 1));
