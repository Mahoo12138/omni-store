# 数据模型

本文档解释 SQLite 业务模型和生命周期。**迁移文件是最终事实来源。**

稳定迁移按：

```text
migrations/vMAJOR.MINOR.PATCH.sql
```

命名。`v1.0.0.sql` 是首个稳定版本冻结基线；已记录的 migration 永久跳过，后续结构变化只能新增更高版本。

## 1. Schema Migration

`schema_migrations`

- `version`：SemVer 迁移版本；
- `applied_at`：应用时间。

## 2. 用户与凭据

### users

核心字段：

- 内部整数 ID；
- `user_public_id`：不可变公开随机标识；
- `username`；
- `display_name`；
- `password_hash`；
- `role`；
- `is_disabled`；
- timestamps。

角色：

```text
super_admin
user
```

### sessions

保存 Web Session、CSRF hash、过期时间、UA 与 IP。

### user_tokens

目前主要承载 WebDAV Token，数据库只保存 hash。

### image_bed_tokens

每个用户可以持有多个命名图床 Token。

### s3_credentials

- `access_key_id` 为外部定位 ID；
- Secret Key 使用 master key 加密；
- 支持禁用、撤销、最后使用时间。

## 3. Storage Source

### storage_sources

主要字段：

- `id`：内部外键；
- `key`：系统生成的不透明 `src-*` key；
- `name`；
- `description`；
- `root_path`；
- `is_disabled`；
- 公开挂载配置；
- WebDAV / image-bed 开关；
- `quota_bytes`；
- timestamps。

`quota_bytes=0` 表示不限。

### storage_source_exclude_patterns

保存 Source 全局排除规则。

### public_mount_redirects

保存公开挂载路径改名后的历史别名，用于 308 重定向。

## 4. Policy

Policy 模型用于复用权限配置。

概念包括：

- Policy；
- User ↔ Policy 绑定；
- Policy ↔ Storage Source 规则；
- Source 级默认权限；
- 子路径权限规则。

有效权限由全部绑定 Policy 合并，子路径使用最长前缀并在多策略间取最高权限。

## 5. 文件台账

`file_records` 不是虚拟文件树，而是对真实文件的系统视图。

保存：

- Storage Source；
- relative path；
- active / trash 等状态；
- 文件大小、mtime；
- 所有者；
- 写入主体元数据。

用途：

- 用户用量；
- 所有权；
- 搜索索引；
- 生命周期联动；
- 外部文件 Reconcile。

宿主机外部已有文件扫描进入时可以标记为 `unowned`，不能因为“某用户有权限”就猜测所有者。

## 6. Search

active 文件台账建立 FTS5 trigram 索引。

搜索结果仍必须二次经过：

- Source 状态；
- 用户权限；
- exclude；
- 文件状态。

## 7. Share

分享模型保存：

- 随机 share key；
- Source + relative path；
- 创建者；
- 密码 hash（可选）；
- 过期时间（可选）；
- 最大下载次数（可选）；
- 当前计数；
- 撤销状态；
- timestamps。

移动/回收/删除必须和有效分享生命周期联动，不能留下指向错误文件的静态路径。

## 8. Image Bed

图片记录保存：

- image ID；
- owner（匿名可以为空或使用明确匿名主体语义）；
- Storage Source；
- relative path；
- extension/MIME；
- size；
- timestamps；
- trash linkage。

图片公开 URL 使用稳定 image ID，不直接暴露真实 root path。

## 9. Trash

回收站真实 payload 位于系统数据目录，而不是 Source 内的隐藏目录。

SQLite 保存：

- `trash_key`；
- Source；
- 原 relative path；
- 删除者；
- 元数据；
- 时间；
- operation state。

永久清理后释放用户配额；恢复时重新建立 active 台账。

## 10. S3 Multipart

关键表：

- `s3_multipart_uploads`
- `s3_multipart_parts`
- `s3_object_etags`

真实 Part 位于：

```text
{data.dir}/tmp/multipart/{upload_id}/
```

Multipart ETag 只在对应物理对象 size + mtime 仍匹配时有效；S3 之外修改对象后应失效/重建相关记录。

## 11. Audit

审计保存：

- actor；
- entry type；
- action；
- Source；
- path / target path；
- IP；
- User-Agent；
- success/failed；
- error code；
- timestamp。

用户删除时审计历史可以保留，但用户外键必须安全处理。

## 12. Operation Journal

关键崩溃恢复日志主要位于系统 operation 目录，而不是把每个阶段都扩大成业务表。

操作日志必须包含足够信息区分：

- planned；
- prepared；
- filesystem ready；
- database ready；
- cleanup pending；

具体阶段取决于不同操作。

恢复器以 SQLite 提交边界、摘要和明确 journal 所有权判断完成或回滚。
