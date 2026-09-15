# OmniStore 1.0.0 历史路线

状态：Completed / Archived

`V1`、`V2` 是 `1.0.0` 内部开发阶段，不是语义化版本。

2026-08-31，1.0.0 完成稳定发布。

## V1

完成：

1. S3 基础对象子集；
2. S3 独立端口；
3. Path-style；
4. SigV4；
5. S3 Credential；
6. WebDAV LOCK/UNLOCK；
7. 缩略图；
8. Upload Crash Recovery；
9. Existing Directory Import；
10. Audit filter；
11. 多 Image Bed Token；
12. Public mount redirect；
13. 手动系统配置包导出。

### S3 Multipart

完成：

- Create；
- UploadPart；
- ListParts；
- Complete；
- Abort；
- tmp part directory；
- SQLite state；
- orphan/expired GC。

## V2

完成：

1. Access Policy；
2. Source 多 Policy；
3. Subpath Permission；
4. Source/User Quota；
5. file_records；
6. existing file scan；
7. reconcile；
8. user usage；
9. source usage；
10. copy / cross-source move；
11. share；
12. trash；
13. search/index。

## 发布加固

首发 RC 前完成的重要生命周期/安全工作包括：

- same-origin active content isolation；
- user deletion FK/data lifecycle；
- secure first-admin setup；
- frozen v1.0.0 migration；
- unified release gate + race；
- Source topology serialization；
- account recovery / credential revocation；
- login anti-bruteforce and enumeration timing；
- stable per-session CSRF；
- Trash crash recovery；
- existing-directory import transaction boundary；
- cross-source move recovery；
- ancestor/descendant path locking；
- image-bed upload recovery；
- normal upload recovery；
- Multipart complete recovery；
- UploadPart recovery；
- data-dir / SQLite permission hardening；
- critical-package coverage gates；
- reserved namespace / quota consistency；
- recovery isolation from unrelated reserved host files；
- process-level SIGKILL acceptance；
- E2E accessibility and credential-state hardening。

后续新的 Feature 不再追加到本文件。
