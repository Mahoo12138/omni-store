# 常见问题

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

## Docker Source 提示“目录不可写”

这通常不是文件逻辑故障，而是容器进程用户和挂载目录权限不匹配。

OmniStore 应继续以非 root 用户运行，不要为了绕过权限把主服务改成 root。

对确认由 OmniStore 独占的空 volume，可以用 root 的一次性容器初始化属主，例如：

```bash
docker compose run --rm --user 0:0 --entrypoint sh omnistore \
  -c 'chown 1000:1000 <容器内存储源目录> && chmod 0750 <容器内存储源目录>'
```

再用应用用户验证：

```bash
docker compose run --rm --user 1000:1000 --entrypoint sh omnistore \
  -c 'test -r <容器内存储源目录> && test -w <容器内存储源目录> && echo source-permission-ok'
```

Bind Mount 不应对包含其他应用数据的目录盲目递归 `chown`，优先共享组或 ACL。

## 为什么 2.0 升级后 Public Drive / Image Bed 可能要求重新确认 Source？

1.x 允许多个 Source 带 public/image-bed 标记，无法无歧义转换成 2.0 的全站单一 binding。

迁移规则：

- 恰好一个候选：自动绑定；
- 零个：保持 disabled；
- 多个：保持 disabled/unbound，管理员手动选择。

绝不能随机选第一个。

## 为什么 S3 Bucket 是随机 key？

Source name 可以改，协议地址不能随 UI 名称漂移。

`storage_key` 是稳定、不透明、符合 Path-style bucket/path 要求的协议 ID。

## 博客 baseUrl 场景应该用哪个服务？

用静态 HTTP 访问：每个源独立配置一个普通发布目录，可同时发布多个源，文章保存相对路径。不是给每个文件创建 Share，也不是把博客目录上传到随机 ID 图床。图片和视频都保留用户文件名。

## 登录上传是否意味着私有读取？

不是。快速图床的登录/匿名描述上传身份，`/i/` 默认公开；静态资源的管理需授权但发布目录内允许的资源公开读取。真正私有文件继续通过普通受保护下载或受限制 Share。

## 所有站点服务文件都放在 .omnistore/ 吗？

不是。系统托管的图床在其中；静态资源和公开盘只是发布普通目录，SQLite/配置/密钥在系统数据目录。通用 HTTP/API/协议对内部路径读取/浏览返回 404，不意味着专用图床接口不能返回被授权的图片。

## 匿名图床一定几天后删除吗？

不一定。2.0 默认不自动过期；管理员可单独设置匿名保留天数，上传前显示并固化到本次图片。图床保留期只作用于图片，不复用到博客静态资源。

## 公开资源不列目录，能当私有存储吗？

不能。知道路径即可读。若另开公开盘指向同目录，还可能从那个入口浏览；两项公开能力分别配置。不要把密钥和草稿放进发布目录。

## 为什么覆盖图片后博客还看到旧图？

固定 URL 可能仍有新鲜缓存。默认 short 控制原站发出的 freshness；已选择 long/immutable 则承诺更新时换 URL。删除、停用原站不能即时收回浏览器/CDN 缓存，详见公开 HTTP 规范。
