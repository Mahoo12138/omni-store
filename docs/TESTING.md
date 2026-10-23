# 2.0 本次新增测试设计

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

本页补充 [验收清单](ACCEPTANCE.md)，保持现有全仓、race、浏览器和 crashcheck 门禁。以下是 Agent 应实现的测试，不是本次文档生成的执行结果。

## 1. 组合测试夹具

创建一个普通 Source，包含 public.txt、blog-assets 的嵌套媒体、private-notes、图片内部目录、Transfer 内部目录及模拟未知目录。再建立两个用户：一名只有 `blog-assets/member-a` 写权限，一名只有图床使用权限。三个 Site 服务可以全绑定该源，WebDAV/S3/静态 HTTP 均开启，分别验证权限。另建第二个静态发布源，验证同路径内容、CORS、缓存与启停互不影响。

另建一个只读普通源、一个不可访问源、一个同名但不相关的候选发布目录。不要使用真实用户文件或生产 keys。夹具显式生成所需图片/视频，不依赖外网。

## 2. 表驱动路径测试

输入包括 `.omnistore`、`.omnistore/transfer/x`、`normal/.omnistore/x`、编码点与分隔符、`../`、反斜杠、软链接、大小写变体、双编码、合法 `%` / `_` / 空格 / 中文与 `.omnistore.txt`。

逐一覆盖 REST path/query/body、上传 relative_path、WebDAV Destination、S3 Object Key、Share 源路径和目录 ZIP。断言失败前无 mkdir、临时文件、multipart 状态副作用；HTTP status 是 404 而不是“200 的错误页”。不强制所有 malformed HTTP 返回 404，区分协议解析错误与资源隔离。

## 3. 静态资源端到端

Given 静态服务绑定 blog-assets，公开盘关闭；When 通过普通文件夹上传 posts/a.webp、videos/demo.mp4；Then 按 baseUrl + relativePath 可从另一 origin 读取，目录及 private-notes 不可读，Source key 不是 public_asset_id 的替代。

随后同路径覆盖、原子 rename、move to trash、restore、禁用服务与启用，验证各时点的 origin 状态。检查 short 的 cache 头与验证器变化，但不声称控制了浏览器所有历史缓存。

## 4. 并发与发布身份

两个管理员用相同 revision 保存配置，只有一个成功。长视频 GET 与 rebind 并发，不出现旧配置鉴权却读取新源；候选源没有核验时不能 relocate。reset 后旧 ID 不落到新根。重复 upload 和 overwrite 仍有配额锁，失败不破坏旧内容。

## 5. 台账与清理

在同一个源中上传普通文件、快速图片、Transfer 文件；跑普通 Reconcile、FTS 重建、quota 汇总、备份和图片/Transfer 清理。验证只处理自己的 scope，普通 blog-assets 不被 TTL GC 触碰，物理字节全部计入源用量，用户图床字节不加两次。

## 6. 公开 HTTP

测试 GET/HEAD、Range 首段/尾段/越界/If-Range、多段降级策略、304、404 no-store 和 MIME 不匹配。Media 在第二 origin 中播放/seek。CORS public/none/allowlist、Vary 合并、无 credentials、CORP 与后台隔离均断言响应头，不仅看 UI。

## 7. 迁移与恢复

源上预放真实同名 `.omnistore/`，启动不能接管或删除。含旧图片、public mounts、无 image 记录博客文件、最近/收藏的 1.x fixture 升级后，旧内容不被自动移位、新静态发布默认关闭。恢复配置可保留 ID，但目录重新核验前无公开读取。

## 8. 最低交付证据

固定测试源文件的 hash 验证其不被不相关维护改动；并发测试不靠 sleep 猜测完成；crashcheck 测 FS/DB 交界，普通 HTTP 覆盖真实状态与头。记录真实客户端名称/版本、系统、操作、结果和例外，未测试项标记 not-tested。

## 9. 2.0 可靠性检查入口（2026-10-18）

- `internal/transfers/recovery_batch_test.go`：收集占位/日志/部分写入/提交后恢复，失败重试、日志归属、托管根变化与幂等恢复。
- `internal/files/managed_write_test.go`：精确临时路径在写入前校验，配额/读取失败保留原件，临时文件冲突不接管，软链接无写入副作用。
- `cmd/crashcheck/transfers.go`：真实 SIGKILL 覆盖发送上传/定稿、收集批次、保存到文件、GC，重启后比对文件字节、台账和计数，再验证重试与重复清理。
- `web/e2e/static-browser-compatibility.spec.ts`：本地第二 origin 的 PNG/JPEG/GIF/WebP 解码、Canvas/fetch、三种 CORS、管理 API 隔离、WebM 解码播放/非零 Range seek、非法类型、公开盘关闭与静态服务启停。

视频夹具在仓库内，生成方式见 `web/e2e/fixtures/generate-static-video.mjs`，不依赖远程媒体。双 origin Chromium 用例不替代 MP4、Safari/Firefox、实际反向代理/CDN 或真实 WebDAV/S3/PicGo 客户端矩阵。
