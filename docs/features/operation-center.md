# 仪表盘与运行维护

> 修订：2026-10-04 / R3。当前实现与 2.0 目标范围分别标注。

系统设置只保留“仪表盘”入口，运行维护功能已合并其中。原 `section=operations` 地址自动转到 `section=stats`。

当前实现使用一个 `/api/v1/admin/overview` 聚合请求：系统连接配置与运维服务生成的健康快照一起返回，每 30 秒刷新。系统状态、全部存储源健康、数据库、缓存与回收站、流转负载、站点能力和最近失败操作在同一页查看；完整性检查、清理和台账校准执行后刷新这份快照。源列表没有前 4 条限制，禁用状态与目录可访问性分别展示。

下列目标中尚未列入当前实现的诊断项仍属于 2.0 目标范围。

目标：

> 管理员快速判断系统是否需要处理。

展示：

- version / uptime；
- DB health；
- Source accessible；
- Source physical quota；
- Site Capability binding/health；
- WebDAV/S3 switches；
- file ledger/reconcile；
- trash；
- cache；
- multipart；
- transfer active usage；
- recent failed audit。

操作：

- Source check；
- Reconcile；
- Cache cleanup；
- Multipart cleanup；
- Transfer expired cleanup；
- SQLite integrity check。

不内置 Prometheus/Grafana。

## 静态发布与图床诊断

运行中心的 Source 协议列表包含静态 HTTP 启停状态，Site 健康列表只包含三项站点服务。发布根、baseUrl、cache/CORS 在每源静态配置中查看；进一步聚合发布根可读性等诊断仍属于目标范围。图床诊断显示匿名启停、保留策略、旧源引用与托管根归属。

统计区分普通文件（含静态原件）、托管图床、Transfer、临时数据；Source 物理总量包含全部真实字节，分类台账不得简单相加导致重复。清理缓存/Transfer 不得删除普通发布文件。未知 `.omnistore/` 提供明确 blocked 告警，而不是“自动修复”按钮。
