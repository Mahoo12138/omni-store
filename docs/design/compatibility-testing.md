# Compatibility Test Matrix

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

2.0 必须维护真实客户端表。

## WebDAV

客户端：

- Windows Explorer
- Finder
- rclone
- Cyberduck
- WinSCP
- RaiDrive
- Mountain Duck

测试：

- auth；
- list；
- mkdir；
- upload；
- overwrite；
- range；
- move；
- delete；
- LOCK；
- Unicode。

## S3

- AWS CLI
- rclone
- s3cmd
- mc

测试：

- list buckets；
- list objects；
- put/get/head/delete；
- presign；
- multipart；
- overwrite；
- Unicode keys。

## PicGo

- token；
- upload；
- returned URL。

## Rule

真实失败：

```text
minimal repro
-> classify
-> minimal fix
-> automated regression
```

绝不为了客户端兼容绕过 Security/Quota/Recovery。

## 静态博客兼容性矩阵

新增普通浏览器与第二 origin 博客测试，不把已列客户端名当成已通过结果。必须记录版本和实际操作：文件夹上传保留相对路径，WebDAV/S3 更新后博客直链读取，图片嵌入，视频 seek，CORS fetch/Canvas，禁用公开盘但静态服务继续工作。

检查同一 Source 下 `.omnistore/` 不经 WebDAV/S3/public/raw/ZIP 泄漏。实际 reverse proxy 不允许旁路直读物理目录。PicGo 仍验证快速图床随机 ID 返回，不把它当作已实现的路径型博客部署工具。

## 当前实测记录（2026-10-18）

基线提交 `bac9423`，含本轮工作区修改；macOS 26.6.2 / arm64，Playwright Chromium 151.0.7922.34。测试使用两个独立本地 origin、新临时种子与当前源码构建，不经过生产代理。

| 客户端/场景 | 结果 | 边界 |
| --- | --- | --- |
| Chromium：PNG/JPEG/GIF/WebP `<img>` 解码、Canvas | passed | 无凭据加载；public/allowlist 可读取像素，none 下普通嵌入可显示但 Canvas 不可读 |
| Chromium：fetch/CORS 与后台隔离 | passed | public/allowlist/none、Range 头暴露；后台 API 不因此允许跨域读取 |
| Chromium：WebM 播放与 seek | passed | 真实解码播放、非零 Range 与 206；本地生成 VP8 夹具 |
| Chromium：非法类型/主动内容、静态启停 | passed | 服务端 404/no-store；脚本不执行；公开盘关闭不影响静态读取 |
| Chromium：MP4 播放与 seek | not-tested | 既有 HTTP Range 测试不替代真实 MP4 解码验收 |
| Safari / Firefox、生产反向代理/CDN | not-tested | 本地 Chromium 结果不外推 |
| Windows Explorer / Finder / rclone / Cyberduck / WinSCP / RaiDrive / Mountain Duck | not-tested | 既有 WebDAV API E2E 使用自编请求，不是真实客户端 |
| AWS CLI / rclone S3 / s3cmd / MinIO Client / PicGo | not-tested | 既有 S3/PicGo API 测试不构成客户端矩阵通过 |

复现：先构建前端，再运行 `node scripts/verify-browser.mjs static-browser-compatibility.spec.ts`。完整矩阵仍是 2.0 RC 前的待办。
