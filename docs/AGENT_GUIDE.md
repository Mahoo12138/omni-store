# Agent 开发规则

本文档是 Agent 修改 OmniStore 时的最小约束。

## 1. 开始任务前

先读取：

1. `PRODUCT.md`
2. `ROADMAP.md` / 当前版本 roadmap
3. 与改动最相关的 feature/design 文档
4. `ARCHITECTURE.md`
5. 涉及安全时读取 `SECURITY.md`
6. 涉及数据库时读取 migration + `DATA_MODEL.md`

## 2. 基本原则

- 优先修改已有代码，不机械重写模块。
- 不为未来需求提前引入抽象。
- 不引入未经讨论的依赖。
- 不改变 Storage Source = 本地目录的核心模型。
- 不引入 Redis/PostgreSQL/队列/微服务。
- 不把 roadmap 中未来能力当成当前事实。
- 不为了“代码更漂亮”破坏 Crash Recovery、quota、锁或兼容性。
- 单次任务只解决明确范围。

## 3. 数据库

- 已发布 migration 不修改。
- 新表/列/索引用新的 SemVer migration。
- migration 是 Schema 最终事实。
- 同步更新 `DATA_MODEL.md`。

## 4. 文件写操作

增加新的最终写入入口时必须回答：

- Policy 怎么检查？
- Path 怎么规范化？
- Exclude 怎么处理？
- Symlink 怎么处理？
- Reserved namespace 怎么处理？
- WebDAV lock 怎么处理？
- Source quota 怎么处理？
- User quota 怎么处理？
- file_records 怎么更新？
- 崩溃发生在哪些阶段？
- 启动恢复如何处理？

如果这些问题未回答，不应直接增加“简单写文件”路径。

## 5. 前端

- 复用 UI 基础组件。
- 服务端状态用 TanStack Query。
- 不引入多套 CSS / UI 系统。
- 状态必须覆盖 loading / empty / error / disabled / focus-visible。
- 移动端不能隐藏核心任务能力。

## 6. 安全

禁止：

- 日志输出明文 Token、密码、S3 Secret；
- 无条件信任代理头；
- 拼接真实文件路径；
- 根据内部临时文件名删除来源不明文件；
- 为测试绕过权限或安全路径；
- 通过前端隐藏代替后端授权。

## 7. 完成任务后

至少说明：

1. 修改文件；
2. 设计原因；
3. 执行测试；
4. 是否影响 migration/API/security；
5. 文档是否同步；
6. 剩余风险。

发布相关任务必须运行统一 Release Gate。
