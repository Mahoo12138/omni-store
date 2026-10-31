# 静态资源发布设计

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：2.0 目标实现契约。产品层由 [静态资源功能](../features/static-assets.md) 定义，HTTP 细节见 [公开响应规范](public-content-http.md)。

## 1. 按存储源配置的公开 HTTP 协议

静态访问是匿名、只读的 HTTP 协议，配置属于 Source Protocol。每个 Source 在 `source_static_access` 有至多一份发布配置，各源可同时开启。它不属于 `site_capability_bindings`，也不引入任意 mount 映射。

发布空间定位由 `(storage_source_id, publish_root)` 决定，公开身份由 `public_asset_id` 决定。`public_asset_id` 生成至少 128-bit 随机值，格式 `ast-` 加 32 位小写十六进制；这是公开标识而不是访问密码。

`publish_root` 保存规范化源内相对目录：`blog-assets`，不以 `/` 起止；根为 `""`。根发布必须显式 `confirm_publish_root=true`。禁止发布 `.omnistore` 任意后代、系统数据目录、软链接目录或源外目录。

## 2. 请求映射

```text
GET /assets/{public_asset_id}/{relative_path...}
  → 获取静态发布配置的一致性快照
  → 检查 enabled、配置版本、Source 状态
  → 解析 relative_path；拒绝越界与保留段
  → 合并 publish_root，检查普通路径 exclude 与安全边界
  → 获取普通资源读取锁并打开文件
  → 确认是普通文件且符合公开类型策略
  → 缓存条件 / Range / 流式响应
```

不允许任意 publication ID 在未匹配时回退为 Source key、public mount 或磁盘目录。读取不查询 images；file_records 不存在也不使普通磁盘文件无法发布。静态发布不复制内容，不创建 sidecar，不隐式生成普通文件归属。

同一请求使用同一配置快照，避免途中重绑导致鉴权在旧根、读取却在新根。切换配置等待相关短临界区，长下载可持有已打开安全文件直到结束；不在每个分块重新拼路径。禁止整段视频读取到内存。

## 3. 发布目录预检

检查 Source/目录存在且可读，返回样例路径、将公开的范围、受支持类型、与公开盘的重叠提示、未知内部目录告警。不得实际创建服务目录或写入用户文件。若要通过 UI 上传还应另检用户写权限；只读发布目录本身允许静态读取服务。

预检结果不是长期授权。最终提交在配置锁中复检，在同一事务更新该源发布配置、CORS 白名单与 revision，并写审计。不能因为 disabled 状态就接受根外/保留路径，稍后启用才发现越界。

## 4. 上传与普通文件管理的复用

上传目标是 `publish_root + relativePath`。File Upload API 的 path 和 relative_path 必须继续区分，不把整条路径塞入 multipart filename。目录选择默认保留选中根名称；上传前展示最终目标预览，避免 `blog-assets/blog-assets/` 的意外双层嵌套。

不自动 rename，不自动扁平化、不压缩包解压、不重编码视频。批量冲突 ask/skip/overwrite 继续由任务模型控制；上传失败只重试相应文件。已经确定相对路径的静态 URL 不应被上传服务随机改写。

WebDAV/S3 更新普通目录时同样生效，需遵守 Source 开关、凭据、Policy、锁和配额。用户仅有快速图床 Token，不等于能向该目录按路径写文件。

## 5. 公共 origin 与 baseUrl

`public_origin` 为可选的 HTTPS origin，如 `https://files.example.com`（本地测试可 HTTP）；不包含 userinfo、path、query、fragment。未设置时复用受信任实例公开 origin。不得直接使用未经校验的 Host/X-Forwarded-Host 拼接可信外链。

`base_url = public_origin + /assets/{public_asset_id}/`，末尾始终有 `/`。前端对每个文件名段分别 URL 编码，不能把整条带 `/` 路径编码成一段，也不能去除中文、空格、`%`、`#` 等合法字符。文章存未编码的逻辑相对路径或明确编码后的 URL，两种输入不得混用二次编码。

配置 public_origin 只改变输出链接，不执行 DNS/TLS/代理配置，不代表创建了新域名。部署文档应说明代理只暴露静态读取路由，管理 Cookie 不应在独立资源域使用宽 Domain。

## 6. 启停与重绑

| 操作 | 发布 ID | 数据动作 | 对外行为 |
| --- | --- | --- | --- |
| 改显示名/缓存/CORS | 保持 | 无 | 新响应按新策略 |
| 关闭再开启同一空间 | 保持 | 无 | 关闭期间原站 404 |
| 改 public_origin | 保持 | 无 | 不自动保障旧域名可用 |
| 更换 source 或 publish_root（无关内容） | 必须新建 ID | 不移动、不删除 | 旧 ID 原站 404 |
| relocate 同一批内容 | 核验后保留 | 由管理员事先迁移或独立安全复制 | 相对 URL 保持 |

普通 PUT 若改变已有发布空间 root/source 返回 `409 STATIC_REBIND_REQUIRED`，要求专用 rebind 操作。`reset` 生成新 ID；`relocate` 必须有维护状态、同一批数据确认和核验记录（文件清单与内容核验结果或管理员明确承担核验责任的审计），不能通过任意下拉框悄悄保留 ID。

同一源不创建多历史活跃发布空间或旧 URL 自动重定向；需要保留旧 origin 时由部署维护。跨源重绑不能覆盖目标源已有配置。移除配置必须先关闭协议，只撤销公开身份，不删除文件。源删除还检查 Site binding、旧 images、垃圾站和日志引用。

## 7. 服务与权限

创建/修改发布配置：超级管理员。写普通文件：当前用户/凭据的 Source+子路径 Policy。公共读取：静态服务的显式发布授权，不是匿名用户 Policy，也不授予写权限。

为任何可写发布目录增加“本目录资源公开可读”提示。撤销某用户写权限会阻止其后续修改，但不自动撤销该源已配置的公开读取；管理员应关闭协议/调整发布范围或删除文件来撤下。

## 8. 不增加的复杂度

不做每文件发布开关、版本存储、自动追踪博客引用、路径重定向表、全盘扫描才能首次读取或基于图床流水的发布。两类存储角色通过不同业务入口区分，而不是引入新 Storage Source 类型。
