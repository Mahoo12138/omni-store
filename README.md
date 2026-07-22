# OmniStore

OmniStore 是一款以本地目录为真实数据源的轻量级自部署存储中心，面向个人、家庭和小团队，统一提供公开网盘、私有文件管理、WebDAV 与图床能力。

项目优先保证轻量、可靠、边界清晰：Go 后端以单二进制交付，React 前端通过 `go:embed` 嵌入，SQLite 只保存用户、权限、配置和审计等系统数据。

## 核心能力

- 本地存储源及只读 / 读写权限管理
- 公开网盘与登录后的私有文件管理器
- 基础 WebDAV 读写
- 登录用户图床、匿名公共图床与 PicGo 兼容接口
- 路径安全、排除规则、请求级锁与审计日志

## 快速开始

环境要求：Go 1.25+、Node.js 24+ / npm 11+。

```bash
cd web
npm install
npm run build
cd ..

go build -o omnistore ./cmd/omnistore
./omnistore server
```

默认监听 `0.0.0.0:8080`，数据目录为 `./data`。配置项及 Docker 部署方式参见[开发指南](docs/DEVELOPMENT.md)。

## 项目文档

完整文档索引位于 [`docs/README.md`](docs/README.md)，常用入口如下：

- [产品定义与 MVP 边界](docs/PRODUCT.md)
- [系统架构](docs/ARCHITECTURE.md)
- [身份、权限与存储安全](docs/SECURITY.md)
- [路线图与开发阶段](docs/ROADMAP.md)
- [开发指南](docs/DEVELOPMENT.md)
- [MVP 验收清单](docs/ACCEPTANCE.md)
- [Agent 开发规则](docs/AGENT_GUIDE.md)
