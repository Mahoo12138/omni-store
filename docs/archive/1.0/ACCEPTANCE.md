# OmniStore 1.0.0 验收基线

状态：Completed / Archived

本文件保留首发稳定版验收范围的结构性记录。当前发布门禁以仓库 `scripts/verify-release.sh` 和自动测试为最终事实来源。

## 安装与初始化

- Linux amd64/arm64 可构建；
- Docker Compose 可运行；
- 单二进制可运行；
- Data Dir 安全；
- SQLite 初始化/迁移正确；
- 一次性 Bootstrap 首管理员；
- 并发初始化只能成功一次。

## Auth / Security

- 登录/退出；
- CSRF；
- brute-force limiter；
- password/session revoke；
- WebDAV/ImageBed/S3 credential lifecycle；
- trusted proxy；
- path traversal；
- symlink；
- reserved namespace；
- active content isolation。

## Storage Source / Policy

- Source create/import/delete；
- overlap protection；
- exclude；
- source disable；
- Policy merge；
- subpath permission；
- read/write boundary。

## Files

- list/stat；
- mkdir；
- upload；
- overwrite；
- download/range；
- rename/move；
- copy；
- cross-source move；
- trash/restore/purge；
- quota；
- file_records；
- reconcile；
- search。

## Public / Share

- public mount；
- redirect；
- raw；
- share password；
- expiry；
- download count；
- revoke；
- move/trash lifecycle。

## WebDAV

- supported methods；
- token auth；
- LOCK/UNLOCK；
- write-lock enforcement；
- quota/security consistency。

## S3

- SigV4；
- bucket/object operations；
- presign；
- Multipart；
- ETag；
- recovery；
- credential lifecycle。

## Image Bed

- authenticated upload；
- anonymous upload；
- token；
- image validation；
- history；
- thumbnail；
- PicGo；
- trash lifecycle。

## Crash Recovery

进程级 SIGKILL 验证覆盖关键写路径，包括：

- overwrite upload；
- directory copy；
- cross-source move；
- same-source move；
- trash；
- restore；
- purge；
- Multipart complete；
- image upload。

## Release Gate

统一门禁：

- frontend tests/build；
- Go format/vet/test；
- coverage；
- race；
- browser E2E；
- release build；
- cross-build；
- compose config；
- diff check。

1.0 发布后，本验收文件不再扩展下一版本 Feature。
