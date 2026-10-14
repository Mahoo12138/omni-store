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
pnpm exec playwright test
```

确保不是在红色 baseline 上做结构重构。

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

后续变更新增更高 SemVer 迁移；静态 HTTP 重构使用 `v2.0.1.sql`，不得修改已应用文件。

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

新增 Transfer 写入前必须设计：

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
- Transfer Source；
- WebDAV/S3 enabled variants；
- admin/user；
- transfer fixtures。

## 6. Crash Test

扩展 crashcheck：

- Send upload；
- Send finalize；
- Collect submission upload；
- Collect finalize；
- Save to Files；
- Transfer GC。

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
