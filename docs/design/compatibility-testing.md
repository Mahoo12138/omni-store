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
