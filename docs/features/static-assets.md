# 静态资源托管

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：2.0 已确认产品范围；具体实现与接口由 Agent 按本文及关联设计完成。

关联：[产品矩阵](../PRODUCT.md)、[详细设计](../design/static-assets.md)、[公开内容 HTTP 规则](../design/public-content-http.md)、[验收](../ACCEPTANCE.md)。

## 1. 核心用户故事

作为博客作者，我在服务器维护一个有层级的资源目录，只在博客配置一次 baseUrl，文章保存相对资源地址。我可以上传整个目录、覆盖同一路径图片或添加视频，无需逐文件生成随机直链。

```text
博客资源存储源/
├── blog-assets/
│   ├── images/posts/2026/cover.webp
│   └── videos/demo.mp4
└── private-notes/draft.md
```

后台选择 Source 为“博客资源”，发布目录为 `blog-assets`。下例 `ast-0123456789abcdef0123456789abcdef` 为示意 ID，不是凭据：

```text
baseUrl = https://files.example.com/assets/ast-0123456789abcdef0123456789abcdef/
文章图片路径 = images/posts/2026/cover.webp
文章视频路径 = videos/demo.mp4
```

最终路径映射是 `Source.root + publish_root + relativePath`；外部 URL 不含磁盘绝对路径或 `.omnistore/`。

## 2. 后台配置

在存储源管理中通过「配置 → 访问协议 → 静态 HTTP」配置，每个源最多一份，可同时发布多个源。静态 HTTP 的创建与策略保存均在同一弹窗内完成，保存按钮独立于 WebDAV、S3 和存储设置：

| 字段 | 产品含义 | 默认 / 约束 |
| --- | --- | --- |
| enabled | 是否提供公开资源读取 | 默认关闭 |
| source_key | 发布使用的源 | API 路径指定；必须存在且可读 |
| publish_root | 源内发布目录 | 普通相对目录；发布根需额外确认 |
| public_asset_id | 公开发布标识 | 服务端生成并保持稳定；不是密钥 |
| public_origin | 对外资源 origin | 可选；不自动配置 DNS/TLS/反向代理 |
| cache_mode | short / no-cache / long | short |
| cors_mode | none / public / allowlist | public，无凭据 |
| allowed_origins | allowlist 使用的来源 | 完整 origin，不匹配任意后缀 |

`base_url` 根据 public_origin（未指定时取受信任实例公开 origin）和 `/assets/{public_asset_id}/` 生成，不接受客户端随意改写路由前缀。

启用时明确提示：“发布目录内的受支持文件将公开读取，无需登录；不提供目录列表不等于保密。”后台给出目录样例和可能重叠的其他公开入口，确认后才保存。

## 3. 管理与写入

资源仍在普通目录，保持普通文件的 Source、Policy、文件台账、配额、回收站、复制/移动语义。

既有目录上传和 `relative_path` 管线继续使用。不新增公开上传 API，不把 S3 secret 或上传 Token 写进博客。静态文件 GET 不依赖 image 记录，也不要求 Reconcile 先发现文件才能读取；外部修改的索引、归属和用量视图继续通过既有校准更新。

管理员从存储源的「配置 → 访问协议 → 静态 HTTP」管理发布目录，文件写入继续使用普通文件管理器。普通用户必须有路径写权限。同一源内多人写入用子目录 Policy 隔离；不同源可分别配置发布目录、公开 ID、缓存和 CORS。

## 4. 公开读取

仅提供已知普通文件的 GET / HEAD，以及配置允许时的 CORS OPTIONS。

- 请求发布根、子目录或不存在文件均返回真实 404，不列目录、不自动返回 index.html、不跳登录。
- 请求 `.omnistore` 路径段、越界路径、排除项或不允许发布的类型，不提供内容。
- 初始默认服务范围是图片和视频；精确格式、安全策略见公开 HTTP 设计。其他普通文件可存在源中，不等于自动公开。
- 视频按字节 Range 流式读取；返回原始媒体内容，而不是播放器 HTML。不做转码。
- 读取不消费 Share 的下载次数，也不依赖该对象。

## 5. 固定路径的生命周期

| 操作 | 结果 |
| --- | --- |
| 同一路径覆盖 | URL 不变，内容更新；已有客户端缓存可能继续有效到其策略允许的时点 |
| 重命名 / 移动 | 新路径对应新 URL；原站旧路径 404，不自动跟随 |
| 删除 / 移入回收站 | 原站旧路径 404 |
| 恢复到原路径 | 原站同一 URL 可以再次读取 |
| 关闭服务 / 禁用源 | 后续原站请求不再提供资源；不能收回已分发缓存 |
| 切换到无关目录 | 必须明确重置发布 ID，旧 ID 不重新指向另一批内容 |
| 同一批资源迁移磁盘 | 显式 relocate 流程、核验后保留 ID 和相对路径 |

不自动新增历史版本或路径重定向。普通配置 PUT 不允许静默更换 source/publish_root 并复用旧 ID。

## 6. 缓存与跨域

默认 `short` 适合博客固定路径。`long` 仅适合内容修改就更换 URL 的资源，需要确认；详情由 HTTP 设计维护，避免各文档自定数值。

公开媒体读取可跨站嵌入；只为该公开端点提供需要的无凭据 CORS，不修改管理 API 的 CORS/CSRF。Referer/Origin 限制不是私有读取授权，也不能保证防盗链。

## 7. 非目标

不提供公开目录浏览、公开写入、逐文件 image ID 登记、强制文件改名、网站应用托管、视频转码、实时缓存撤回或 CDN 控制平台。
