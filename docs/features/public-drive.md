# Public Drive — 2.0

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

## 定位

全站唯一长期匿名只读文件空间。

## Binding

Admin：

```text
Public Drive
enabled
Storage Source
```

最多一个 Source。

## Route

```text
/public/*
```

直接映射绑定 Source 的根。

## Breaking

删除：

- `public_read_enabled`
- `public_mount_path`
- multiple public mounts
- public mount redirect alias

## Safety

必须：

- hide `.omnistore`；
- exclude；
- symlink safety；
- active content isolation；
- no write。

Public Drive binding 不影响登录用户普通 Policy。

## 与静态资源托管的区别

公开网盘是可浏览的长期公开文件空间；[静态资源托管](static-assets.md) 是按源配置的静态 HTTP 协议，不提供目录列表。Site 公开盘与静态 HTTP 配置互相独立，静态资源不需要公开网盘开启或 public mount。

可以绑定同一个源，但公开网盘若公开了包含 blog-assets 的普通目录，该目录仍会经公开网盘被浏览。后台必须提示这种额外暴露；不能拿静态端点“不列目录”的规则推断全站不列目录。

`.omnistore/` 在所有入口都隔离，直接读/浏览返回真实 404；公开盘不能为了同源共享而公开内部图床或 Transfer 数据。
