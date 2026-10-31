# 2.0 开发指南

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

## 1. 基线

开始 2.0 前：

```bash
go test ./...
go test -race ./...
cd web
pnpm test
pnpm run build
cd ..
node scripts/verify-browser.mjs
```

确保不是在红色 baseline 上做结构重构。

浏览器验收要求 Node.js 24+。`verify-browser.mjs` 构建当前 Go 服务，创建独立临时数据目录与动态 HTTP/S3 端口，生成新种子并运行 Playwright；不复用 18080 上的开发实例，也不清空 `.testdata/`。先构建前端，保证 Go 嵌入当前产物。脚本清除继承的 `OMNISTORE_*` 部署环境变量，避免种子写入错误目录；测试结束关闭自身服务，成功删除临时环境，失败/中断保留日志、数据和 Playwright 证据并打印路径。

可转发 Playwright 的选择参数，例如：

```bash
node scripts/verify-browser.mjs static-browser-compatibility.spec.ts
```

## 2. Migration

禁止修改：

```text
v1.0.0.sql
v1.1.0.sql
v1.1.1.sql
```

初始 2.0 schema 保存在：

```text
migrations/v2.0.0.sql
```

2.0 发布前，所有 2.0 schema 变更都并入 `v2.0.0.sql`；发布后新增更高 SemVer 迁移，不得修改已应用文件。

Migration 必须同时测试：

- fresh DB；
- 1.1.x upgrade DB。

## 3. Breaking Change 策略

2.0 不保留旧/新两套业务模型。

正确：

```text
migration
-> service
-> API
-> frontend
-> tests
-> docs
```

不正确：

```text
旧 public mount + 新 public drive binding 长期并存
```

## 4. File/Service Write

新增服务写入前必须设计：

- path；
- reserved namespace；
- quota；
- lock；
- journal；
- DB commit boundary；
- startup recovery；
- cleanup；
- GC。

禁止直接 `os.WriteFile` 作为业务完成方案。

## 5. E2E

Playwright 使用 clean test seed。

2.0 seed 必须提供：

- General Source；
- Public Source；
- Image Source；
- WebDAV/S3 enabled variants；
- admin/user。

## 6. Crash Test

crashcheck 场景：

- overwrite upload；
- directory copy；
- same-source move；
- cross-source move；
- trash；
- restore；
- permanent delete；
- multipart complete；
- image upload。

`scripts/verify-crash-recovery.sh` 已覆盖以上进程场景。按场景名子串筛选可缩短修复循环：

```bash
OMNISTORE_CRASH_SCENARIO=trash OMNISTORE_CRASH_ROUNDS=3 ./scripts/verify-crash-recovery.sh
```

筛选不替代发布前的完整 10 轮。失败保留独立 fixture、数据库、日志与 `crash.json`；检查最终文件字节与业务台账，不只检查服务能重启。

## 7. 文档同步

完成一阶段后更新：

- STATUS；
- TASKS；
- API；
- DATA_MODEL；
- feature/design；
- CHANGELOG。

## 8. 静态资源实施补充

新设计仍沿用现有 UI/路由/样式栈，不引入静态站点生成器或媒体转码服务。按 `NS → binding/schema → quick image-bed → static-assets → integration` 顺序实现，详见 [测试设计](TESTING.md)。

开发时用两个本地 origin 验证博客嵌入；最终再经生产相同反向代理配置测试。公开域名配置不自动申请证书，不在资源 origin 暴露管理员 API。所有内部路由在 SPA fallback 前拒绝。

只更新文档不能标记实现完成；需要运行代码测试后更新 STATUS/TASKS。包中的 SQL 仅是结构契约片段，不要直接当全量 migration 执行。
