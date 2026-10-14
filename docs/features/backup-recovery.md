# Backup & Recovery — 2.0

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

系统备份负责 OmniStore 状态，不负责 TB 级真实文件。

## Include

- SQLite consistent snapshot；
- effective config；
- keys；
- manifest/checksums；
- site capability bindings；
- transfer metadata。

## Exclude

- Source content；
- transfer payload；
- cache；
- tmp；
- multipart parts；
- logs。

## Restore

```text
Fresh Instance
-> Import Backup
-> Source Rebind
-> Site Capability validation
-> Reconcile
-> Report
-> Ready
```

Transfer metadata 可以恢复，但如果相应 Source payload 不存在，任务标记 unavailable/expired，不制造数据。

## 静态发布与 `.omnistore/` 恢复补充

系统备份包含 source_static_access/source_static_origins、Site binding、public_asset_id、revision、图床 expires_at 和 managed root 登记；不包含博客原件、快速图床原图或 Transfer payload。这些文件都由用户的 Source 数据备份负责。

恢复后公共发布必须先关闭，校验重新绑定的 Source 和 publish_root 确实是原资源树，再保留原发布 ID 开启。不能把旧 baseUrl 指向任意新目录。图床/Transfer 旧业务定位同样检查真实 payload，缺失时报告 unavailable，不伪造成功或自动按目录名删除。

回收站 payload 不进入系统配置包；快照副本中清理不可恢复的 transient session/part 状态，标记或移除无法配套恢复的回收元数据，不能恢复出“可点击但无文件”的假条目。未知格式明确拒绝，备份压缩包导入不允许路径穿越、软链接或超限展开。
