# Backup & Restore Design

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：2.0 Scope

## Format

```text
omnistore-backup.zip
├── manifest.json
├── database/omnistore.db
├── config/effective.yaml
├── keys/
└── checksums.txt
```

Manifest：

```json
{
  "format": "omnistore-backup",
  "format_version": 1,
  "omnistore_version": "2.0.0",
  "created_at": "RFC3339"
}
```

## Restore

不能直接信旧 root_path。

所有 Source 进入：

```text
needs_rebind
```

管理员确认新 path 后：

- overlap；
- path safety；
- permissions；
- reserved namespace；
- capability health；
- reconcile。

## Transfer

DB metadata 可恢复。

payload 在 Source 中，由用户自己的 Source backup 决定是否存在。

缺失 payload：

- 不 crash；
- 标记 unavailable；
- 提供报告。

## 静态发布与 `.omnistore/` 恢复补充

系统备份包含 source_static_access/source_static_origins、Site binding、public_asset_id、revision、图床 expires_at 和 managed root 登记；不包含博客原件、快速图床原图或 Transfer payload。这些文件都由用户的 Source 数据备份负责。

恢复后公共发布必须先关闭，校验重新绑定的 Source 和 publish_root 确实是原资源树，再保留原发布 ID 开启。不能把旧 baseUrl 指向任意新目录。图床/Transfer 旧业务定位同样检查真实 payload，缺失时报告 unavailable，不伪造成功或自动按目录名删除。

回收站 payload 不进入系统配置包；快照副本中清理不可恢复的 transient session/part 状态，标记或移除无法配套恢复的回收元数据，不能恢复出“可点击但无文件”的假条目。未知格式明确拒绝，备份压缩包导入不允许路径穿越、软链接或超限展开。
