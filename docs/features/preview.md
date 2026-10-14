# 统一文件预览

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

当前 main 已实现，是 2.0 基线。

Resolver：

```text
File
-> Preview Resolver
-> Renderer
```

支持：

- image；
- text；
- markdown；
- JSON/YAML；
- code；
- PDF；
- audio/video；
- unsupported -> download。

Transfer Center 必须复用该 Renderer，不创建第三套预览系统。

安全：

- 主动内容仍强制安全 header；
- Markdown 不执行 raw HTML；
- Audio/Video 使用 Range；
- 不做服务端转码。

## 静态原始媒体不是预览页面

静态资源路由返回媒体字节，不重定向到登录态 Preview 页面。博客直接 `<img>` / `<video>` 使用原件，预览 UI 仍只负责用户界面的内容查看。普通资源与托管业务资源采用不同授权 resolver，共享 renderer 不能等于共享裸路径访问。

静态默认允许的具体媒体格式与主动内容拒绝规则见 [公开 HTTP](../design/public-content-http.md)。尤其不能因为已有预览支持 PDF/Markdown/代码，就默认把整个静态发布根所有类型都公开。
