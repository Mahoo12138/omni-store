# 发布流程

OmniStore 使用 SemVer。

## 1. 开发版本

主分支开发构建可以使用：

```text
1.x.y-dev+sha.<commit>
```

正式产物必须由版本 Tag 触发。

## 2. RC

功能冻结后：

```text
v1.1.0-rc.1
v1.1.0-rc.2
...
```

RC 阶段：

- 不继续扩大 Feature Scope；
- 只接受 release blocker；
- 安全修复；
- 兼容性修复；
- 测试稳定性；
- 发布配置修正；
- 必要文档修正。

## 3. 发布门禁

统一执行：

```bash
./scripts/verify-release.sh
```

门禁包括：

- Release metadata / migration；
- Frontend test；
- Production build；
- Go format；
- vet；
- Go tests；
- statement coverage；
- critical package coverage；
- race detector；
- Browser E2E；
- release binary；
- Linux amd64/arm64 cross-build；
- Compose config（环境支持时）；
- repository diff check。

## 4. Crash Recovery

重要版本在 RC 阶段额外执行：

```bash
OMNISTORE_CRASH_ROUNDS=10 ./scripts/verify-crash-recovery.sh
```

用于真实进程级 SIGKILL 验证。

## 5. Tag

发布 Tag：

```bash
git tag -a v1.1.0-rc.1 -m "OmniStore v1.1.0-rc.1"
git push origin v1.1.0-rc.1
```

稳定版：

```bash
git tag -a v1.1.0 -m "OmniStore v1.1.0"
git push origin v1.1.0
```

## 6. CI 产物

Version Tag 触发：

- release gate；
- Docker amd64/arm64；
- Linux amd64/arm64 archive；
- checksum；
- GitHub Release。

带 `-rc.N` 的版本标记为 prerelease。

稳定版本才允许更新 `latest` Docker tag。

## 7. Migration Freeze

发布稳定版本后，对应 migration 成为冻结历史。

例如：

```text
v1.0.0.sql
```

不能因为 1.1 开发方便直接修改。

## 8. 发布后检查

至少验证：

- 二进制 version 输出；
- Docker pull/run；
- 全新安装；
- 现有数据升级；
- 登录；
- Source；
- 基础文件 CRUD；
- 关键协议入口；
- 备份/恢复（版本涉及时）。

发现 blocker 发布 patch 或下一 RC，不回写已发布 Tag。
