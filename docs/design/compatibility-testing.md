# Compatibility Testing Design

状态：Planned / Continuous

## Goal

用真实客户端行为而不是“协议覆盖百分比”驱动兼容性。

## Matrix

### WebDAV

- Windows Explorer
- macOS Finder
- rclone
- Cyberduck
- WinSCP
- RaiDrive
- Mountain Duck

场景：

- connect/auth；
- list；
- mkdir；
- upload/overwrite；
- download/range；
- move/rename；
- delete；
- LOCK/UNLOCK；
- Unicode/path edge cases。

### S3

- AWS CLI
- rclone S3
- s3cmd
- MinIO Client

场景：

- list buckets；
- list objects；
- GET/HEAD；
- PUT；
- delete；
- presigned；
- Multipart；
- overwrite；
- Unicode/key edge cases。

### PicGo

- token auth；
- image upload；
- returned URL；
- error behavior。

## Bug Policy

发现真实客户端失败时：

1. 保存最小复现；
2. 判断是 OmniStore bug、未支持能力还是客户端扩展行为；
3. 只补必要兼容；
4. 固化自动测试；
5. 更新 compatibility matrix。

不为了单个客户端绕过路径安全、权限或写入一致性。
