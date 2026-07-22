# 公开网盘

公开网盘的产品行为、挂载模型、路由和匿名访问能力。

### 首页就是公开网盘

整个网站首页 `/` 是公开网盘入口。

匿名访客访问首页时，看到所有已公开挂载的目录入口。

首页不是登录页。

登录入口是：

```text
/login
```

登录用户私有网盘是：

```text
/app
```

管理员后台是：

```text
/admin
```

### 公开挂载模型

公开网盘不是直接暴露 `source_id`。

存储源公开后，挂载到一个虚拟路径：

```text
public_mount_path
```

示例：

```text
/photos
/downloads
/anime/wallpapers
/public/docs
```

真实映射示例：

```text
photos -> /data/media/photos -> /photos
software -> /mnt/downloads/software -> /downloads/software
```

### public_mount_path 规则

规则：

1. 当 `public_read_enabled = true` 时，必须配置 `public_mount_path`。
2. 当 `public_read_enabled = false` 时，可以为空。
3. 必须以 `/` 开头。
4. 不能是 `/`。
5. 只允许小写字母、数字、短横线、下划线和 `/`。
6. 不同公开挂载路径不能相同。
7. 不允许路径互相包含。

禁止互相包含示例：

```text
已有 /anime，则不能再挂载 /anime/wallpapers
已有 /anime/wallpapers，则不能再挂载 /anime
```

### public_mount_path 修改

MVP 允许超级管理员修改 `public_mount_path`。

规则：

1. 修改时重新校验格式和冲突。
2. 修改后旧公开网盘链接失效。
3. 不做旧路径重定向。
4. 图床 URL 不受影响。
5. 写入审计日志。

### 公开网盘路由

MVP 使用固定前缀，避免和 API、后台、前端路由冲突。

```text
GET /                     公开网盘首页
GET /p/*virtual_path      公开目录浏览页面
GET /raw/*virtual_path    公开文件原始访问
```

示例：

```text
/p/photos
/p/photos/2026
/raw/photos/2026/a.jpg
```

### 匿名公开访问能力

匿名访客只能：

1. 浏览公开网盘目录。
2. 下载公开网盘文件。
3. 访问公开 raw 文件。

匿名访客不能：

1. 上传普通文件。
2. 删除文件。
3. 重命名。
4. 移动。
5. 创建目录。
6. 使用 WebDAV。
7. 使用 S3。

公开网盘访问仍必须检查：

1. 存储源存在。
2. 存储源未禁用。
3. `public_read_enabled = true`。
4. 路径未命中排除规则。
5. 路径未穿越。
6. 路径段不是 symlink。

---
