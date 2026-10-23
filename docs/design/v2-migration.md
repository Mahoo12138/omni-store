# 2.0 Migration Design

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：Required

## 1. 不修改历史 migration

只新增：

```text
migrations/v2.0.0.sql
```

## 2. Storage Source Rebuild

SQLite 推荐通过 temp table rebuild，生成目标字段：

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

### WebDAV

保留 legacy `webdav_enabled` 值。

### S3

1.x 没有 per-source switch。

为避免升级后突然丢失已有 S3 行为：

- existing Source migration 为 `s3_enabled=true`；
- fresh 2.0 Source 默认 `false`。

管理员升级后可逐 Source 关闭。

## 3. Public Drive Legacy

Legacy：

```text
N sources can public_read_enabled
+ mount path
```

2.0：

```text
0/1 site binding
```

Migration：

- exactly 1 legacy public Source -> 自动绑定并 enabled；
- 0 -> disabled/unbound；
- >1 -> disabled/unbound，记录 migration warning，要求管理员选择。

绝不能随机选第一个。

删除 `public_mount_redirects`。

旧 public mount URL 不保证兼容。

## 4. Image Bed Legacy

Legacy：

- multiple Sources `image_bed_enabled`；
- per-user default preference。

2.0：

- one global binding。

Migration：

- exactly 1 enabled Source -> bind；
- otherwise unbound/disabled；
- 删除 per-user source preference；
- existing `images` 不移动，不修改 source/path。

新上传只有绑定完成后可用。

## 5. Site Binding Rows

插入：

```text
public_drive
image_bed
transfer_center
```

Transfer 默认 disabled/unbound。

## 6. Reserved Namespace Collision

SQL migration 不能安全判断所有宿主机路径。

2.0 启动时/binding 时做 preflight：

```text
<source>/.omnistore
```

若存在但没有可信 OmniStore ownership marker：

- 不删除；
- 不接管；
- binding health = blocked；
- 管理员收到明确提示。

## 7. UI

Migration 完成但 capability unbound 时：

Admin 首页显示：

```text
2.0 Upgrade Required
- Configure Public Drive
- Configure Image Bed
- Configure Transfer Center
```

不是后台静默失败。

## 8. Rollback

Database migration 不承诺降级回 1.x。

2.0 Upgrade 前应建议导出/复制系统数据目录备份。

真实 Storage Source 文件不由 migration 移动或删除。

## 9. 本次图床 / 静态资源拆分

2.0.0 直接建出三项 Site binding（公开盘、图床、流转中心），静态访问按源存放于 source_static_access/source_static_origins，不保留 static_assets Site 枚举。升级不自动发布任何源，也不推断发布身份；未配置源默认不公开，不得从旧 public_read_enabled、image_bed_enabled 或个人图床偏好推断发布范围。

图片类旧记录继续保留 ID、source、path；不能凭登录/匿名标签把所有登录用户图归为静态资源。用户需要路径型博客时，选择现有普通目录并配置发布服务；需要搬迁旧图片则是明确文件迁移工作，不能自动从 original_filename 还原并覆盖可能同名文件。

保留旧 `/i/` 业务读取兼容，不改写旧图片 URL 成静态 URL。停用旧的个人 source preference 不意味着删除原文件。

## 10. 命名空间简化不是磁盘批量改名

新 2.0 目标是 `.omnistore/`。此前文档使用的 `.omnistore-services/` 不是已验证上线事实。若 Agent 工作树已经按旧草案写过实际数据，必须检查已有代码、DB 定位和已登记磁盘根，再设计停写、备份、带日志的明确迁移；不能通过全盘名字匹配直接 rename 或删除。

已有未知 `.omnistore/` 原地保留并阻止托管初始化。只为静态发布配置普通目录时不创建 `.omnistore/`，迁移 SQL 不操作文件系统。

## 11. 台账 / 搜索升级

新增 file_records.resource_scope，默认 file；只有新内部托管图床写入 image_bed。更新 FTS 触发器及普通 Reconcile 的 missing 分支，不能只在列表里隐藏。检测历史已索引保留路径，清除搜索条目不等于删除磁盘内容。以包含普通文件、旧 images、新托管图床和 Transfer 的混合源测试“不丢台账、不漏数据、不重复计费”。

## 12. 发布身份、恢复与风险

source_static_access/source_static_origins 随系统备份保存，恢复保持 public_asset_id。迁移部署时，管理员应先关闭静态协议，确认恢复同一资源树后再启用；无关目录用 reset 新 ID。当前系统备份保留协议启停状态，不自动代替发布根核验。

升级不承诺支持数据库回退。迁移前保存可恢复系统快照与 keys，文件由既有备份方案保护；所有不确定的 legacy 绑定进入待配置状态。`v2.0.0.sql` 未发布前可以整合新设计，已发布 1.x SQL 不改写。
