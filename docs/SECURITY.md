# 2.0 安全模型

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

## 1. 基础安全

继续保留：

- bcrypt；
- server-side session；
- stable per-session CSRF；
- login limiter；
- trusted proxy；
- password/session revoke；
- Token/Credential revoke；
- same-origin active content isolation；
- symlink protection；
- path locking；
- journal-first crash recovery。

## 2. Scope 与权限

### Resource

普通文件操作必须经过 Policy。

### Public Drive

匿名只读由 Site Capability 直接授权，不依赖匿名用户 Policy。

### Image Bed

登录用户使用 Site Capability 上传，不要求其拥有 backing Source 的普通 File Manager 权限。

匿名上传只有管理员开启时可用。

## 3. `.omnistore`

这是 2.0 系统保留 namespace。

所有 generic path API 必须隔离；直接读取/浏览命中时返回 404，不能只隐藏列表：

```text
.omnistore
```

包括：

- File REST；
- Public Drive；
- Share creation；
- WebDAV；
- S3；
- Search；
- Favorite/Recent；
- generic Copy/Move target。

业务模块只能通过内部 Service API 访问。

Source physical quota仍统计。

## 4. Active Content

Preview、Share 与公开业务页面统一复用安全 Content Header。

HTML/SVG/XML/JS 等主动内容不能获得同源脚本执行能力。

Markdown 不渲染 raw HTML。

## 5. Protocol

WebDAV/S3 不能看到 `.omnistore`。

即使用户拥有 Source 根 read/write Policy，也不代表拥有 Service Namespace 权限。

## 6. Deletion

Site Capability Rebind/Disable 不删除任何真实 payload。

图床清理只删除由图片记录与明确路径共同证明归属的 payload。

不得扫描目录后按命名模式直接删除未知文件。

## 7. 静态资源发布与后台授权隔离

静态协议仅发布普通目录的明确范围。公开 GET/HEAD 依赖该源静态协议的显式发布授权，普通写入依赖用户 Source/子路径 Policy；快速图床上传授权不能升级为任意目录写权限。

公开资源配置由管理员确认。publish_root 不允许在 `.omnistore/` 中、不允许根外或软链接逃逸。发布目录包含草稿/密钥时，不列目录不能保护它们；UI 必须警告，默认媒体 allowlist 也不是替管理员分类资料。

public_asset_id 是公开定位符，不是访问令牌。不可通过 Origin/Referer 或未列目录向用户承诺私有性。公开静态响应不得设置管理 Cookie 或开放凭据式跨域。

## 8. 404 与递归边界

`.omnistore` 完整路径段对普通读取、浏览返回真实 404，包含 query/path/Destination/S3 key/编码路径；站点直接路径在 SPA fallback 前阻断。身份鉴权仍先按各协议执行。

包括管理员在内的普通文件接口不能用 override 跳过；Share ZIP、父目录复制/删除、全局搜索的间接访问同样隔离。S3 响应用协议格式，不往 S3 HEAD 塞 REST JSON。完整矩阵见 [托管路径](design/managed-namespace.md)。

## 9. 静态媒体与匿名保留

静态端点仅提供已验证允许类型，不为托管博客资源解除 HTML/JS/SVG 等主动内容限制。安全 header、CORS、CORP、缓存策略按 [公开 HTTP](design/public-content-http.md) 逐路由配置，禁止为了博客图片开放整个后台 API。

图床匿名保留期由独立策略控制，修改策略不静默提前删除历史图片。所有过期清理仍需对象记录和可恢复删除步骤，不能将博客发布目录纳入 GC。隐藏文件仍计入源物理用量。
