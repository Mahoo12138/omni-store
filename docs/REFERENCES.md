# 核对基线与技术参考

本文件用于区分已核对事实、用户确认目标与本次建议的实现默认值。它不是历史开发归档。

## 1. 仓库基线

核对时间：2026-09-29。固定提交：`af9a3859bedcd7736ced38ecb8da285a11e595c8`。

- [API 基线](https://github.com/Mahoo12138/omni-store/blob/af9a3859bedcd7736ced38ecb8da285a11e595c8/docs/API.md)：普通上传 relative_path、Preview raw、Share archive 等。
- [图床基线](https://github.com/Mahoo12138/omni-store/blob/af9a3859bedcd7736ced38ecb8da285a11e595c8/docs/features/image-bed.md)：图床随机 ID 和原先的 Source 选择模型。
- [当前提交](https://github.com/Mahoo12138/omni-store/commit/af9a3859bedcd7736ced38ecb8da285a11e595c8)：文档同步 Preview & Sharing，不能据此声称本包新能力已实现。

本包以会话已生成的完整 2.0 ZIP 为底本，保留其其余功能范围；不把原仓库中的过期 1.x roadmap 再复制成第二套当前计划。

## 2. 用户在本轮确认的目标

`.omnistore/` 替代冗长托管根名称；通用内部路径读取/浏览返回真实 404；匿名快速图床用于取得直链；博客的图片/视频按普通目录和 baseUrl + relativePath 管理，独立静态服务，无需公开盘。

short/no-cache/long、CORS 默认值、配置 revision 与表字段是本包为 Agent 给出的实现契约；没有把这些写成仓库当前已经存在的接口。

## 3. 一手规范 / 官方实现资料

- [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)：状态码、HEAD、Range、条件请求与验证器。项目的隐藏策略是选择 404，不是“所有拒绝一律必须 404”的标准要求。
- [RFC 9111 HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)：no-cache、freshness、验证语义。项目选择 300 秒为 short 默认值。
- [RFC 8246 Immutable Responses](https://www.rfc-editor.org/rfc/rfc8246.html)：freshness 生命周期内的不可变承诺。
- [MDN 同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)：嵌入与脚本读取的区别。
- [MDN CORS 配置](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS)：公开无凭据读取与路由级开放。
- [MDN CORP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy)：跨域资源嵌入控制。
- [AWS S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html)、[HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)：协议读取与错误响应格式。OmniStore 的保留路径拒绝是自身策略，不声称完整复现 AWS IAM 行为。
- [SQLite CREATE INDEX](https://www.sqlite.org/lang_createindex.html)：唯一约束、NULL 与表达式索引，供既有 Transfer 路径唯一性设计参考。

## 4. 校验范围

本次实际执行的是文档结构/链接/JSON/SQL片段检查和压缩包完整性检查。没有运行 OmniStore Go 测试、E2E、实际数据库升级、HTTP 服务或客户端兼容性测试。这些保持在 TASKS / ACCEPTANCE 待执行。
