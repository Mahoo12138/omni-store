# Backup Format Design

状态：Draft / Planned for 1.4

## Goal

定义可版本化、可验证的 OmniStore 系统备份包。

## Example

```text
omnistore-backup.zip
├── manifest.json
├── database/
│   └── omnistore.db
├── config/
│   └── effective.yaml
├── keys/
└── README-restore.md
```

最终文件名可在实现阶段调整。

## Manifest

至少：

```json
{
  "format": "omnistore-backup",
  "format_version": 1,
  "omnistore_version": "1.4.0",
  "created_at": "RFC3339"
}
```

可以增加文件摘要。

## Include

- SQLite 一致性快照；
- 有效配置；
- keys / master-key 相关必要文件；
- 恢复说明。

## Exclude

- Storage Source 真实内容；
- thumbnail cache；
- tmp；
- Multipart Parts；
- 普通日志。

Trash payload 是否随系统备份迁移必须在 1.4 实现前再次冻结语义；不能默认因为“在 data dir”就自动打包巨大 payload。

## Compatibility

新版本至少应显式判断旧 Backup Format：

- 可直接读取；
- 需要 migration；
- 不支持并给出原因。

不能静默按未知格式恢复。
