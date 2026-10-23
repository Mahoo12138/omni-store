# 2.0 发布流程

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

## 1. Version

开发构建：

```text
2.0.0-dev+sha.<commit>
```

RC：

```text
v2.0.0-rc.1
```

Stable：

```text
v2.0.0
```

## 2. 2.0 特殊升级验收

除统一 Release Gate 外必须有：

### Upgrade Matrix

```text
1.1.0/1.1.1 schema
    -> 2.0.0
```

验证：

- 用户；
- Source；
- Policy；
- file_records；
- images；
- shares；
- WebDAV credentials；
- S3 credentials；
- recent/favorites；
- Preview/Share 现有功能。

### Breaking Config

升级后明确提示管理员：

- Public Drive binding；
- Image Bed binding；
- Transfer binding；
- S3 Source switches。

不得静默把多个 legacy public/image source 任意选一个。

## 3. RC Freeze

进入 RC：

- 不新增 Transfer Feature；
- 只修 blocker/security/migration/compatibility/test；
- 不再次调整核心 Scope。

## 4. Gate

```bash
./scripts/verify-release.sh
OMNISTORE_CRASH_ROUNDS=10 ./scripts/verify-crash-recovery.sh
```

默认开发版本已统一为 `2.0.0-dev`（Go、Web 包、Docker 与门禁脚本）；正式构建仍通过 `OMNISTORE_RELEASE_VERSION`/构建参数注入版本和 commit。迁移文件的序号不代表已发布同名产品版本。

开发中可设置 `OMNISTORE_ALLOW_DIRTY=1` 验证未提交修改；这不会满足正式发布的干净工作区或 tag 要求。浏览器阶段使用 `node scripts/verify-browser.mjs` 创建独立新实例。Crashcheck 默认运行全部场景，`OMNISTORE_CRASH_SCENARIO` 仅用于定位，不应在完整发布验收时设置。

## 5. Real Acceptance

- fresh install；
- upgrade install；
- Public Drive；
- Image Bed；
- Transfer Send；
- Transfer Collect；
- WebDAV；
- S3；
- Backup/Restore；
- real client matrix。

## 6. 本次扩展的 2.0 发布门禁

必须完成 [ACCEPTANCE](ACCEPTANCE.md) 的 AS/NS/IMG 场景，特别是整个发布目录不会被默认公开、内部命名空间全入口 404、旧 `/i/` 不被重绑破坏、static reset/relocate 不误映射、客户端缓存失效边界与 CORS。

升级说明明确：快速图床和静态目录不是同一数据模型；未配置源默认不提供静态 HTTP，`v2.0.0` 迁移不自动发布任何源、也不推断发布身份；不自动搬迁旧图片；普通文件写权限不因协议启用扩大。若未完成上述门禁，不能把文档包的链接检查结果当作 RC 测试结果。
