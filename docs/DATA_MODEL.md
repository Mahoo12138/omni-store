# 2.0 数据模型

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

本文 SQL 是 2.0 目标结构片段，不是可以对生产库直接执行的完整迁移；Agent 必须结合固定基线实现 `v2.0.0.sql`。代码/迁移记录描述实现事实，本文描述待实现目标。

已发布：

```text
v1.0.0.sql
v1.1.0.sql
v1.1.1.sql
```

2.0 新增：

```text
v2.0.0.sql
```

## 1. storage_sources

2.0 目标字段：

```text
id
key
name
description
root_path
is_disabled
webdav_enabled
s3_enabled
quota_bytes
created_at
updated_at
```

删除：

```text
public_read_enabled
public_mount_path
image_bed_enabled
```

建议新 Source：

```text
webdav_enabled = false
s3_enabled = false
```

协议默认显式开启。

## 2. site_capability_bindings

```sql
CREATE TABLE site_capability_bindings (
  capability TEXT PRIMARY KEY,
  storage_source_id INTEGER,
  is_enabled BOOLEAN NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE RESTRICT,
  CHECK(capability IN ('public_drive', 'image_bed', 'transfer_center')),
  CHECK(is_enabled = 0 OR storage_source_id IS NOT NULL)
);
```

一个 capability 一行。

## 3. 删除历史模型

2.0 删除：

```text
public_mount_redirects
user_preferences.default_image_bed_storage_source_id
```

如果 `user_preferences` 没有其他有效字段，可以整体删除。

## 4. images

保留现有：

```text
storage_source_id
relative_path
```

旧图片不迁移物理文件。

2.0 新上传统一使用当前 Image Bed binding，并写入：

```text
.omnistore/image-bed/...
```

images 仍可对应 legacy path。新图床台账标记 `resource_scope=image_bed`；已存在普通路径旧图不自动移动或改归属，不能把所有登录用户图片推断成博客静态资源。

## 5. transfers

建议：

```sql
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('send','collect')),
  owner_user_id INTEGER NOT NULL,
  storage_source_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  pickup_code_digest BLOB NOT NULL UNIQUE,
  password_hash TEXT,
  expires_at DATETIME NOT NULL,
  max_downloads INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  max_total_bytes INTEGER NOT NULL DEFAULT 0,
  max_file_bytes INTEGER NOT NULL DEFAULT 0,
  max_submission_bytes INTEGER NOT NULL DEFAULT 0,
  allowed_extensions_json TEXT,
  require_submitter_name BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  closed_at DATETIME,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE RESTRICT
);
```

状态按 kind 由 Service 校验。

Send：

```text
draft
active
expired
revoked
```

Collect：

```text
active
closed
expired
revoked
```

`storage_source_id` 是创建时 snapshot；管理员之后 Rebind 不改变已有 Transfer。

## 6. transfer_submissions

```sql
CREATE TABLE transfer_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_key TEXT NOT NULL UNIQUE,
  transfer_id INTEGER NOT NULL,
  submitter_name TEXT,
  note TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','discarded')),
  created_at DATETIME NOT NULL,
  submitted_at DATETIME,
  FOREIGN KEY(transfer_id) REFERENCES transfers(id) ON DELETE CASCADE
);
```

外部提交者不能通过 submission key 枚举或读取其他 Submission。

## 7. transfer_files

```sql
CREATE TABLE transfer_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL,
  submission_id INTEGER,
  relative_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT,
  sha256 TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(transfer_id) REFERENCES transfers(id) ON DELETE CASCADE,
  FOREIGN KEY(submission_id) REFERENCES transfer_submissions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_transfer_files_scope_path
ON transfer_files(
  transfer_id,
  COALESCE(submission_id, 0),
  relative_path
);
```

使用 expression unique index 是因为 SQLite 的普通 UNIQUE 会把多个 `NULL` 视为不同值；Send 的 `submission_id IS NULL` 时也必须禁止同一路径重复。

Send：`submission_id IS NULL`。

Collect：必须属于同一 Transfer 的 Submission；该交叉一致性由 Service 在事务内校验。

## 8. transfer_access_sessions

密码解锁使用短期 HttpOnly Session。

保存随机 token hash，不保存明文。

Public preview 不计入“下载次数”；只有用户明确触发 attachment/ZIP 下载时才原子增加 `download_count`。媒体 Range 预览不会因为多个 Range 请求重复扣次数。

## 9. Transfer Quota

Transfer 临时字节不进入普通 `file_records` 和 User Quota。

Transfer Service 计算：

- per transfer max；
- per user active total；
- site active total；
- collection max；
- submission max。

Source physical quota仍从真实文件系统统计。

## 10. file_records

普通网盘、静态资源原件与需要计费的图床文件继续使用，但必须分开 `resource_scope`。静态资源是普通文件，不另建一行副本；图床 images 与 file_records 不重复累加用量。

Transfer payload 不进入普通 Search/Recent/Favorite。

Collect 的 `Save to Files` 执行后，目标副本进入普通 `file_records`。

## 11. system_settings

继续保存：

- instance name；
- Transfer defaults/limits；
- anonymous image-bed setting；
- 其他小型实例设置。

Capability -> Source 关系不得塞进 JSON/system_settings，使用外键表。

## 12. 按源静态 HTTP 配置

`source_static_access` 每个源至多一行，替代全站静态 binding 和单例 settings。各源独立维护公开身份、版本、缓存和 CORS 策略。

```sql
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

```

v2.0.1 保留已有公开 ID、路径、origin、版本和启停状态，不移动文件。白名单外键随跨源 relocate 迁移；已有配置的目标源不能被覆盖。移除配置必须先关闭协议，只撤销公开身份，不删除文件；源有静态配置时禁止删除。

无需逐文件发布记录，公开读取使用普通源路径，不依赖 images 台账或 Reconcile。

## 13. 普通台账 / 图床台账隔离

目标 migration 增加：

```sql
ALTER TABLE file_records ADD COLUMN resource_scope TEXT NOT NULL DEFAULT 'file'
  CHECK(resource_scope IN ('file', 'image_bed'));

CREATE INDEX idx_file_records_scope_source
  ON file_records(resource_scope, storage_source_id, record_status);
```

同步修改所有 FTS 触发器和初始重建查询，只纳入 `resource_scope='file' AND record_status='active'` 的允许路径；对旧保留路径也过滤。普通 Reconcile 的 upsert 和 missing 删除同样限定 file scope。用户配额可以聚合 file 和 image_bed，但不能再重复加 images.size。

新图床原件写入 image_bed scope。旧 images 若仍位于普通目录，其 legacy file 行保持原访问语义，重构时单独标识来源，不执行路径猜测搬迁。Transfer 不进入此表。

## 14. 匿名图片保留期

```sql
ALTER TABLE images ADD COLUMN expires_at DATETIME;
CREATE INDEX idx_images_expiry ON images(expires_at)
  WHERE expires_at IS NOT NULL;
```

旧图 expires_at 保持 NULL。匿名保留天数是站点设置，创建新图时固化绝对 expires_at；改变默认值不追溯修改历史记录。只有图床服务按明确图记录撤下/清理，不把静态目录加入 TTL 清理任务。

## 15. 托管根登记

```sql
CREATE TABLE source_managed_roots (
  storage_source_id INTEGER PRIMARY KEY,
  ownership_nonce TEXT NOT NULL UNIQUE,
  namespace_version INTEGER NOT NULL DEFAULT 1 CHECK(namespace_version = 1),
  created_at DATETIME NOT NULL,
  FOREIGN KEY(storage_source_id) REFERENCES storage_sources(id) ON DELETE RESTRICT
);
```

使用实例持久标识、数据库登记与磁盘 marker 配对。该登记不是图片/Transfer payload 的删除清单；GC 仍需具体对象及日志证明归属。备份/恢复保留登记，找不到匹配时报告 blocked，不自动接管目录。
