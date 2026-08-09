# OmniStore

OmniStore 是一款以本地目录为真实数据源的轻量级自部署存储中心，面向个人、家庭和小团队，统一提供公开网盘、私有文件管理、分享、WebDAV、图床与可选 S3 接口。

项目优先保证轻量、可靠、边界清晰：Go 后端以单二进制交付，React 前端通过 `go:embed` 嵌入，SQLite 只保存用户、权限、配置和审计等系统数据。

## 核心能力

- 本地存储源及只读 / 读写权限管理
- 公开网盘、私有文件管理、回收站和跨来源复制 / 移动
- 用户与存储源配额、文件台账和跨来源搜索
- 可选密码、有效期和下载次数限制的文件 / 目录分享
- WebDAV 基础读写与持久独占写锁
- 可选的 S3 Path-style 对象读写、Signature V4 鉴权与 Multipart Upload
- 登录用户图床、匿名公共图床、缩略图与 PicGo 兼容接口
- 路径安全、排除规则、请求级锁与审计日志

## 快速开始

环境要求：Go 1.25+、Node.js 24+ / Corepack + pnpm 10+。

```bash
corepack enable
cd web
pnpm install --frozen-lockfile
pnpm run build
cd ..

go build -o omnistore ./cmd/omnistore
./omnistore server
```

默认监听 `0.0.0.0:8080`，数据目录为 `./data`。配置项及 Docker 部署方式参见[开发指南](docs/DEVELOPMENT.md)。
首次启动会在日志中输出一次性管理员初始化凭据；也可在启动前通过
`OMNISTORE_BOOTSTRAP_TOKEN` 指定。打开 `/setup` 并提交该凭据后，初始化入口永久关闭。

需要隔离的开发、演示或 E2E 环境时，可运行 `./scripts/test-env.sh run`，服务将使用 `config.test.yaml` 和被忽略的 `.testdata/`，监听 `127.0.0.1:18080`。测试账号和 E2E 命令参见[开发指南](docs/DEVELOPMENT.md#隔离测试与演示环境)。

## 项目文档

完整文档索引位于 [`docs/README.md`](docs/README.md)，常用入口如下：

- [产品定义与 MVP 边界](docs/PRODUCT.md)
- [系统架构](docs/ARCHITECTURE.md)
- [身份、权限与存储安全](docs/SECURITY.md)
- [路线图与开发阶段](docs/ROADMAP.md)
- [开发指南](docs/DEVELOPMENT.md)
- [1.0.0 验收清单](docs/ACCEPTANCE.md)
- [发布流程](docs/RELEASING.md)
- [Changelog](CHANGELOG.md)
- [Agent 开发规则](docs/AGENT_GUIDE.md)

## 许可证

OmniStore 使用 [MIT License](LICENSE)。
