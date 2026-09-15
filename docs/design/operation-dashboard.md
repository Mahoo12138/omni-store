# Operation Dashboard Design

状态：Draft / Planned for 1.3

## Goal

Dashboard 只展示 OmniStore 有真实数据支撑、管理员确实会据此行动的信息。

## Cards / Sections

### System

- Version；
- Uptime；
- Database status。

### Storage

每 Source：

- Enabled；
- Accessible；
- Physical usage；
- File-record usage；
- Quota；
- Last reconcile。

### Internal Data

- Trash；
- Thumbnail cache；
- Multipart temp；
- Pending operation/recovery state（如果存在可稳定判断的状态）。

### Recent Problems

从审计/健康检查显示最近失败，不制造“趋势分析”伪指标。

## Actions

- Check Source；
- Reconcile；
- Cleanup thumbnail cache；
- Cleanup expired Multipart；
- SQLite integrity check。

危险维护动作必须二次确认，并记录审计。
