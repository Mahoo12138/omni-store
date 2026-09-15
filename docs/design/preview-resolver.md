# Preview Resolver Design

状态：Draft / Planned for 1.2

## Goal

文件管理器与 Share 共用一套内容预览能力。

## Model

```text
File Descriptor
      ↓
Preview Resolver
      ↓
Preview Type
      ↓
Renderer
```

建议类型：

```text
image
text
markdown
json
code
pdf
audio
video
unsupported
```

## Resolution

Resolver 根据：

- extension；
- trusted/detected MIME；
- size；
- capability；

决定 Renderer。

不能只信用户上传时的 Content-Type。

## Text

文本预览必须限制最大读取量，避免浏览器/后端为超大日志一次加载全部内容。

## PDF

优先浏览器原生能力或轻量前端 renderer，不引入服务端 Office 转换服务。

## Audio / Video

依赖 HTTP Range/206 和浏览器原生媒体播放。

不进行服务端 transcoding。

## Security

主动内容不能因为“Preview”重新绕过 1.0 已建立的同源内容隔离。

HTML/SVG/JS 不能直接作为普通 iframe 页面在同源执行。

## Fallback

任何无法安全/稳定预览的文件：

```text
Unsupported Preview
[Download]
```
