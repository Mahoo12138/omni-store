# 仪表盘与运行维护设计

> 修订：2026-10-04 / R3。当前实现与 2.0 目标范围分别标注。

当前入口：系统设置 → 仪表盘。运维中心不再独立导航或维护第二份轮询数据。

仪表盘分为系统状态与维护操作、资源指标、统一存储源健康表、站点能力健康和最近失败操作。完整性检查与清理报告在系统状态区域显示，台账校准报告在源表下显示。请求首次失败提供重试；刷新失败保留上次成功的快照并提示数据未更新。

后端复用 `operations.GetStatus()`，连接配置单独补充，移除旧仪表盘未使用的用户明细、权限统计和最近审计明细查询。存储源健康包含真实路径，避免再查询一份源概览。

其余诊断目标：2.0 Scope

Dashboard 不做营销大屏。

## Overview

```text
System
Database
Storage Sources
Site Capabilities
Protocols
Internal Data
Transfer
Recent Problems
```

Site Capability health：

- configured；
- enabled；
- Source accessible；
- reserved namespace valid；
- current usage。

Transfer：

- active send；
- active collect；
- bytes；
- expiring soon；
- failed GC。

危险维护动作必须：

- explicit confirmation；
- audit；
- return report。

## 静态发布与图床诊断

运行中心的 Source 协议列表包含静态 HTTP 启停状态，Site 健康列表只包含三项站点服务。发布根、baseUrl、cache/CORS 在每源静态配置中查看；进一步聚合发布根可读性等诊断仍属于目标范围。图床诊断显示匿名启停、保留策略、旧源引用与托管根归属。

统计区分普通文件（含静态原件）、托管图床、Transfer、临时数据；Source 物理总量包含全部真实字节，分类台账不得简单相加导致重复。清理缓存/Transfer 不得删除普通发布文件。未知 `.omnistore/` 提供明确 blocked 告警，而不是“自动修复”按钮。
