# OmniStore 1.x 路线图

本文档描述 `1.0.0` 之后的长期版本路线。

旧的 `1.0.0 / V1 / V2` 路线已经完成并归档到 [`archive/1.0/ROADMAP.md`](archive/1.0/ROADMAP.md)。

## 1. 规划原则

OmniStore 后续不再采用“一个版本承载所有下一阶段 Epic”的方式。

定义：

```text
Epic = 长期产品方向
Version = 一次有明确主题、可以独立交付的版本
Feature = Version 内可实现、可验收的能力
```

一个 Epic 可以跨多个版本；一个版本也不需要等待所有长期目标完成。

版本发布后再进入下一主题，避免再次形成无限膨胀的大版本。

## 2. 版本路线

| 版本 | 主题 | 目标 |
| --- | --- | --- |
| `1.1.0` | File Experience | 提升文件管理、上传和日常网盘体验 |
| `1.2.0` | Preview & Sharing | 建立统一预览，并升级分享浏览体验 |
| `1.3.0` | Operation Center | 提升系统状态可见性和管理员维护能力 |
| `1.4.0` | Backup & Recovery | 完成系统数据备份、新实例恢复和存储源重新绑定 |
| `1.5.0` | Compatibility | 以真实 WebDAV/S3/PicGo 客户端驱动兼容性完善 |

详细范围见 [`roadmap/README.md`](roadmap/README.md)。

## 3. 依赖关系

```text
1.1 Upload Task Manager
        │
        ├── Folder Upload
        ├── Multi File Upload
        └── Drag & Drop

1.2 Preview Resolver
        │
        ├── File Explorer Preview
        └── Share 2.0

1.4 Backup Format
        │
        └── Restore → Source Rebind → Reconcile
```

兼容性修复可以在每个版本中随真实问题持续进入 patch；`1.5.0` 的意义是进行一次系统化兼容矩阵收口，而不是此前禁止修兼容问题。

## 4. 不进入路线图的方向

长期 Non-goals 见 [`PRODUCT.md`](PRODUCT.md)，包括：

- 远程 Storage Source；
- 同步盘；
- CAS/Chunk/去重/版本存储；
- 集群、多节点；
- Redis/PostgreSQL/消息队列；
- 插件系统；
- Office 在线编辑；
- 服务端复杂媒体转码。

## 5. 版本完成标准

每个 Minor Version 至少满足：

1. 版本 Scope 已冻结。
2. Feature 有明确验收标准。
3. 迁移只新增，不修改历史 migration。
4. 对应 API / feature / design 文档与实现一致。
5. `scripts/verify-release.sh` 全绿。
6. 必要的真实客户端/恢复/崩溃测试完成。
7. 进入 `vX.Y.Z-rc.N` 后只修 blocker、兼容和测试稳定性问题。
8. RC 稳定后发布 `vX.Y.Z`。
