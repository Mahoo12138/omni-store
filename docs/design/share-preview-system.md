# Share Preview System Design

状态：Draft / Planned for 1.2

## Principle

Share 只负责匿名访问生命周期；内容展示复用 Preview Resolver。

```text
Share authorization
      ↓
File Descriptor
      ↓
Preview Resolver
```

## File Share

根据 Preview Type 展示图片、PDF、文本、音视频或下载 fallback。

## Directory Share

两种视图：

- List；
- Gallery（图片为主）。

## ZIP Download

目录打包下载使用流式 ZIP：

```text
Directory traversal
→ ZIP writer
→ HTTP response
```

不先在系统目录生成完整大 ZIP 再发送。

打包过程继续受 share 状态、exclude 和文件安全规则约束。

## Password / Expiry

密码、过期、次数限制状态页保持清晰、简洁，不能把错误统一伪装成 404 而导致用户无法理解。

安全敏感场景仍应避免泄露不必要内部信息。
