# 2.0 实施顺序

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

本文件给编码 Agent 使用。必须按依赖顺序推进，不允许先堆 UI 再补数据一致性。

## 当前推进位置（2026-10-18）

现有代码已包含 Capability/Source Protocol、Send/Collect、Operation、Backup 的主要服务与 UI，迁移链已收敛到 `v2.0.0.sql`（2.0 增量迁移在发布前合并）；不要因下方原始阶段清单而重复创建迁移或回退这些实现。具体事实与验证边界见 [STATUS](STATUS.md)。

本轮补齐 Phase 4–6 的写入中断恢复和 GC 一致性，扩展 Phase 10 的 Transfer crashcheck，完成 Phase 9 的 Chromium 双 origin 静态媒体子集，并闭环下载名额按访问会话与目标去重的计数语义。尚未进入 RC：继续补真实协议客户端矩阵、MP4/其他浏览器/代理、访客实际配额压测，以及 Transfer 预览目标。所有未实测项保持待验收。

## Phase 0 — Baseline

1. 运行当前所有测试。
2. 记录当前 `main` Preview & Share 2.0 行为。
3. 不回退已完成 1.1 / Preview & Sharing。
4. 新建 2.0 migration 和 feature branch。

完成：

```text
baseline green
```

## Phase 1 — Capability Scope 数据模型

1. 新增 `site_capability_bindings`。
2. 重构 `storage_sources`：
   - 删除 public/image-bed 功能字段；
   - 保留 WebDAV；
   - 新增 S3 per-source 开关。
3. 删除 `public_mount_redirects`。
4. 删除用户 Image Bed Source preference。
5. 新增 Site Capability Repository / Service。
6. Source 删除增加 active binding guard。
7. 增加 Service Namespace 安全规则。

先完成 Service/Test，再改 UI。

## Phase 2 — Public Drive / Image Bed 迁移

### Public Drive

- `/public` 固定映射全局绑定 Source；
- 删除 mount path UI；
- 删除多 Source public tree；
- service namespace 永远隐藏。

### Image Bed

- Admin 设置一个全局 Source；
- 用户上传不再选择 Source；
- 新图片写入全局 Source；
- 旧图片记录继续按自身 `storage_source_id` 读取，不强制物理迁移；
- Anonymous Image Bed 同样使用该 Source。

## Phase 3 — Source Protocol

Storage Source 设置页改成：

```text
Protocols
[ ] WebDAV
[ ] S3
```

S3：

```text
Bucket = storage_key
```

WebDAV：

```text
Path ID = storage_key
```

验证 Source rename 不改变协议地址。

## Phase 4 — Transfer Core

先实现：

- Transfer model；
- Site binding；
- internal service namespace；
- quota；
- expiry；
- key/code；
- password；
- public lookup；
- GC；
- audit；
- crash recovery。

此时不做复杂 UI。

## Phase 5 — Transfer Send

1. Create Draft。
2. Upload local files/folder。
3. Existing File -> copy snapshot。
4. Finalize -> Active。
5. Public receive page。
6. Preview / Download / ZIP。
7. Pickup code / password / QR。
8. Revoke / Expire / GC。
9. History。

## Phase 6 — Transfer Collect

1. Create Collection。
2. Public upload-only endpoint。
3. Submission transaction。
4. Submission Inbox。
5. Preview / Download。
6. Save to Files。
7. Close / Expire / GC。
8. Rate limit / abuse tests。

## Phase 7 — Operation Center

在前面数据模型稳定后实现 Dashboard 和维护动作。

## Phase 8 — Backup & Recovery

Backup 必须包含：

- DB snapshot；
- config；
- keys；
- Site Capability binding；
- Transfer metadata。

不包含：

- Source content；
- Transfer payload；
- temp/cache。

Restore 后依赖 Source Rebind。

## Phase 9 — Compatibility

跑真实客户端矩阵，把问题固化为自动测试。

## Phase 10 — RC

新增 2.0 E2E：

- Site binding；
- Public Drive；
- Image Bed；
- WebDAV/S3 toggle；
- Transfer Send；
- Transfer Collect；
- transfer expiry/GC；
- backup restore；
- upgrade from 1.1.x。

运行：

```bash
./scripts/verify-release.sh
OMNISTORE_CRASH_ROUNDS=10 ./scripts/verify-crash-recovery.sh
```

## 本次实施顺序补充（覆盖旧 Phase 1–3 的局部顺序）

1. 先完成统一 `.omnistore/` 解析、404、递归隔离和台账 scope，确保 Site 服务共用源时无旁路。
2. Phase 1 的 binding 枚举保留三项；静态 HTTP 使用 source_static_access / source_static_origins / revision，并迁移已有单例配置；managed root 登记独立保留。
3. Phase 2 中快速图床专注随机 ID 图片上传；普通登录用户博客场景不再落到图床托管根。原有图床 Token/历史/旧 ID 读取保留。
4. 在 Phase 2–3 之间增加 Static Assets 子阶段：配置与预检 → 普通目录映射 → GET/HEAD/Range/条件缓存 → 无凭据 CORS → root/source reset/relocate → 博客双 origin 验收。
5. 同一源开启公开盘、图床、静态资源、Transfer、WebDAV、S3 的组合测试先完成，再进入 Transfer UI 扩展。
6. Operation / Backup / Compatibility 增加静态发布健康、ID/root 重绑校验及真实博客嵌入用例，其余 2.0 计划不移除。

这个新增子阶段不创建新的 1.x 版本，也不是增加独立存储后端。已存在上传任务、relative_path 和预览代码继续复用。全程区分文档校验、单元测试、端到端测试及真实部署验收，未运行不得标记完成。
