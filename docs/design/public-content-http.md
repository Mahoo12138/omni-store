# 公开资源 HTTP、缓存与跨域契约

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

适用：2.0 静态资源读取；快速图床和其他公开内容复用明确安全规则，不共享业务授权。下面的限额与默认值是项目设计选择，不是宣称 HTTP 标准要求。

## 1. 响应矩阵

| 请求情况 | 项目目标响应 |
| --- | --- |
| 允许公开的普通媒体文件 | GET 200，准确 Content-Type，流式体 |
| 相同文件 HEAD | 与 GET 的表示元数据一致，无体 |
| 合法单段 Range GET | 206，正确 Content-Range / Content-Length |
| 不可满足 Range | 416，`Content-Range: bytes */{size}` |
| 条件验证命中且仍允许访问 | 304，无体 |
| 文件不存在、目录、内部命名空间、已停用空间 | 404，`Cache-Control: no-store` |
| 类型不在公开允许范围 | 404，不在此端点降级执行内容 |
| 非允许方法 | 405；内部路径拒绝规则在静态 fallback 前 |

Range/HEAD/条件请求细节以 RFC 9110 为准；不能在检查当前访问状态前提前返回 304。If-Range 无有效强验证依据时不假装匹配，可返回完整 200。多范围请求不承诺优化，可忽略 Range 返回完整 200，并设置合理复杂度限制；不得伪造 Content-Range。[标准来源见参考资料](../REFERENCES.md)。

## 2. 内容类型与安全

第一批必测静态格式：JPEG、PNG、GIF、WebP、MP4、WebM。AVIF、音频等仅在检测/读取和浏览器测试补齐后扩充 allowlist，不因扩展名就自动允许；不提供转码。

使用服务端受限读取的类型判断，结合扩展名和签名；不信上传 Content-Type，不对巨大文件为了检测而全量读内存。类型矛盾/无法安全判断则不公开。静态端点默认不发布 HTML、JS、CSS、XML、SVG、服务器脚本、配置/备份文件；普通文件 API 仍可按现有安全附件语义下载它们。未来 SVG 图片支持需独立安全验收，不在此包暗中开放同源主动内容。

所有公开原始内容保留 `X-Content-Type-Options: nosniff` 和适用的受限 CSP。媒体 GET 不包裹 HTML。安全判断不能只依赖 Content-Disposition，也不得为预览创建可执行 Blob/iframe 来绕过主动内容限制。

## 3. 静态资源缓存档位

| cache_mode | Cache-Control | 使用契约 |
| --- | --- | --- |
| short | `public, max-age=300` | 默认；固定路径可能更新 |
| no-cache | `no-cache` | 可存储，使用前验证 |
| long | `public, max-age=31536000, immutable` | 内容变化必须换 URL，后台需确认 |

`long` 不创建版本存储、不按文件名 hash 自动推断，也不能约束宿主机手工覆盖；是管理员选择的发布契约。关闭服务、改缓存策略、删除文件或重置发布 ID，都不能即时撤回已经分发到浏览器/CDN 的缓存。不得在界面承诺即时清除所有客户端副本。

ETag/Last-Modified 必须描述当前文件表示。可复用有效且与当前文件身份/元数据一致的内容摘要；无可信强摘要时只能用明确的弱验证器或时间条件，不把 size+mtime 伪装为强 ETag。普通写入后失效旧摘要；外部修改的验证器必须重新核验或保守返回 200。不能每个视频 Range 请求都先完整 hash 大文件。强验证器不足不能阻止基本 200/206 播放。

图床不沿用固定路径的覆盖模式：不可变随机 ID 原图可按独立长期策略缓存；有 `expires_at` 的图片 freshness 不超过剩余有效时间。快速图床默认不自动过期，图床保留期不施加到静态目录。

## 4. CORS 与跨域嵌入

默认对静态资源路由采用 `cors_mode=public`：`Access-Control-Allow-Origin: *`，不发 `Access-Control-Allow-Credentials`。静态响应不发 Set-Cookie、不按登录 Cookie 改内容，成功与条件/Range响应保持一致策略。

`none` 不添加 CORS 头，不等于阻止普通 `<img>/<video>` 跨域嵌入。`allowlist` 只向明确匹配的 Origin 返回 ACAO，并合并 `Vary: Origin`；不反射任意 Origin。CORS 不是图片保密或阻止下载的认证机制。

OPTIONS 只处理 GET/HEAD 所需预检；允许必要的 Range 等请求头、暴露 `ETag, Accept-Ranges, Content-Range`。请求包含认证写入头或试图开放 PUT/POST 时不得成功预检。内部目录和不存在发布空间先按路径安全拒绝。

公开媒体响应可设 `Cross-Origin-Resource-Policy: cross-origin`，避免误套后台的 same-origin 策略阻断博客。该规则只在公开媒体路由应用；不改全局后台 API/CSRF/Cookie 边界。Canvas/脚本读取应使用无凭据跨域请求；不把服务端密钥放进博客。

## 5. 验收重点

真实浏览器从第二个 origin 加载图片和视频，seek 触发 Range；另用 fetch/Canvas 验证 CORS。后台 API 在同样 origin 条件下仍不因此开放。测试 200/206/304/404/416/OPTIONS 的状态、类型、缓存头、CORS、无 Cookie 和 HEAD 无体。若前置代理直接提供文件，应用层测试通过仍不代表部署边界通过，需验证真实代理链。
