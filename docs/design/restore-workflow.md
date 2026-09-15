# Restore Workflow Design

状态：Draft / Planned for 1.4

## Goal

在新机器或新数据目录恢复 OmniStore 系统状态。

## Flow

```text
Fresh OmniStore
      ↓
Select Backup
      ↓
Validate manifest/checksum/version
      ↓
Restore system state
      ↓
Storage Sources = Unbound / Needs confirmation
      ↓
Admin rebinds local directories
      ↓
Safety preflight
      ↓
Reconcile
      ↓
Ready
```

## Why Rebind

旧实例：

```text
/mnt/photos
```

新实例可能：

```text
/data/photos
```

不能把旧绝对 root path 当作一定存在的恢复事实。

## Rebind Preflight

- 目录存在；
- 是否可读/可写；
- 是否与其他 Source 重叠；
- symlink/root/home 等安全规则；
- 非空目录确认；
- reserved namespace；
- exclude。

## Reconcile

重新关联后以真实文件系统校准 `file_records`，但不凭权限猜测所有权。

## Recovery Report

恢复结束展示：

- 成功恢复的系统数据；
- 未绑定 Source；
- Reconcile 状态；
- 无法恢复/已撤销的 transient state；
- 需要管理员处理的问题。
