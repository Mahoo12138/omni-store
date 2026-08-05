# 图床

登录用户图床、匿名公共图床、图片校验、公开 URL、历史与 PicGo 接口规范。

### 图床不是独立存储源类型

图床是存储源上的一种可选能力。

存储源字段：

```text
image_bed_enabled
```

含义：该存储源允许承载图床图片。

### 图床全局根目录

图床根目录放在 YAML 配置中：

```yaml
image_bed:
  root_path: "/images"
```

这个路径是存储源内部的相对路径。

示例：

```text
/images
```

存储源只配置是否开启图床能力，不单独配置图床根目录。

### 登录用户图床目标

每个用户可以从以下存储源中选择默认图床目标：

1. 用户拥有读写权限。
2. 存储源未禁用。
3. 存储源 `image_bed_enabled = true`。

用户可以有多个可用图床目标，但 MVP 只保存一个默认图床目标。

网页端上传可以提供下拉框临时切换目标。

PicGo / API Token 上传使用用户默认图床目标，不允许客户端指定存储源或目录。网页端临时选择目标时仅展示名称，内部请求使用系统生成 key。

用户可以为不同客户端创建多个命名图床 Token。每个 Token 独立保存哈希、记录最近使用时间并可单独撤销；单个用户最多同时保留 10 个。

### 登录用户图床落盘路径

使用稳定的 `user_public_id`，不使用 username。

格式：

```text
/{image_bed.root_path}/users/{user_public_id}/{yyyy}/{mm}/{uuid}.{ext}
```

示例：

```text
/images/users/u_7k3f9a2d/2026/07/8f3a9c2e4d.jpg
```

### 匿名公共图床

MVP 支持匿名公共图床，但默认关闭。

匿名公共图床是超级管理员显式开启的能力。

SQLite 系统设置字段：

```text
anonymous_image_bed_enabled
anonymous_image_bed_storage_source_id
```

匿名公共图床目标存储源必须满足：

```text
is_disabled = false
image_bed_enabled = true
```

匿名上传不需要登录。

匿名用户不能：

1. 选择存储源。
2. 选择目录。
3. 删除图片。
4. 查看历史墙。
5. 浏览目标存储源。

匿名图床落盘路径：

```text
/{image_bed.root_path}/anonymous/{yyyy}/{mm}/{uuid}.{ext}
```

示例：

```text
/images/anonymous/2026/07/8f3a9c2e4d.jpg
```

### 匿名图床限流

匿名图床必须做简单内存级 IP 限流。

默认：

```yaml
image_bed:
  anonymous_rate_limit:
    enabled: true
    per_ip_per_hour: 60
```

规则：

1. 按客户端 IP 统计匿名上传次数。
2. 默认每 IP 每小时最多 60 张。
3. 进程内内存计数，服务重启后清空。
4. 超过限制返回 `429 Too Many Requests`。
5. 只有请求来自 trusted proxy 时才信任 `X-Forwarded-For`。

### 图片格式校验

MVP 只支持：

```text
jpg
jpeg
png
webp
gif
```

不支持：

```text
svg
avif
tiff
bmp
heic
heif
```

后端不能只相信文件扩展名或 `Content-Type`。

校验流程：

1. 限制请求体大小。
2. 写入临时文件。
3. 读取文件头。
4. 判断真实 MIME 类型。
5. 尝试用 Go 图片库 decode config。
6. 获取宽高。
7. 确认格式在允许列表中。
8. 以服务端识别结果决定最终扩展名。
9. 移动到最终路径。
10. 写入 `Images` 表。

### 图片公开 URL

图床公开 URL 使用稳定短路径：

```text
/i/{image_id}.{ext}
```

示例：

```text
https://store.example.com/i/img_8k3f9a2d.jpg
```

公开 URL 不暴露：

1. 存储源内部 key。
2. public_mount_path。
3. 真实相对路径。
4. 用户 ID。

后端通过 `image_id` 查询 `Images` 表。

### image_id 生成

`image_id` 使用不可预测随机 ID。

格式：

```text
img_{random}
```

`random` 使用安全随机数生成，建议 128-bit。

禁止使用：

1. 数据库自增 ID。
2. 用户名。
3. 时间戳。
4. 原始文件名。

数据库必须对 `image_id` 加唯一索引。

如果冲突，重新生成。

URL 中扩展名必须和数据库记录一致，不一致返回 `404`。

### Images 表字段

MVP `Images` 表至少包含：

```text
id
image_id
owner_type          user / anonymous
owner_user_id       可为空
storage_source_id
relative_path
original_filename
public_url
size
mime_type
width
height
ext
created_at
```

登录用户上传：

```text
owner_type = user
owner_user_id = 当前用户 ID
```

匿名上传：

```text
owner_type = anonymous
owner_user_id = null
```

### 图床历史墙

登录用户只能看到自己上传的图片：

```text
owner_user_id = current_user_id
```

即使多个用户共用同一个图床存储源，历史墙也按用户隔离。

匿名用户没有历史墙。

超级管理员可以在后台查看和删除匿名上传记录。

### 图床删除

登录用户在图床历史墙删除图片时：

1. 只能删除自己上传的图片。
2. 查询 `Images` 表。
3. 检查用户当前是否仍对该存储源有读写权限。
4. 删除物理文件。
5. 删除 `Images` 表记录。
6. 写审计日志。

如果物理文件已不存在：

1. 删除 `Images` 表记录。
2. 返回成功。

普通文件管理器或 WebDAV 删除了图床图片时，也必须同步清理对应 `Images` 记录。

### 图床生命周期

规则：

1. 关闭 `image_bed_enabled`：停止新上传，不影响旧图公开 URL。
2. 策略不再授予用户该存储源权限：该用户不能继续上传或管理旧图，但旧图公开 URL 继续可访问。
3. 禁用存储源 `is_disabled = true`：该存储源所有图床 URL 不可访问，建议返回 `404`。
4. 删除存储源绑定：删除相关图床记录，真实文件保留。

### PicGo 兼容上传接口

MVP 提供最小 PicGo 兼容接口：

```text
POST /api/v1/image-bed/upload
```

鉴权：

```text
Authorization: Bearer {image_bed_token}
```

请求：

```text
multipart/form-data
file: 图片文件
```

不允许传：

1. 存储源选择参数。
2. 目录。
3. 文件名模板。

成功响应：

```json
{
  "success": true,
  "data": {
    "url": "https://store.example.com/i/img_xxxxx.jpg"
  }
}
```

失败响应：

```json
{
  "success": false,
  "message": "图片格式不支持"
}
```

OmniStore 自己的前端 API 可以继续使用统一响应格式；PicGo 接口为了兼容第三方工具可以单独使用 PicGo 友好格式。

### 缩略图

V1.1 为图床历史墙提供后端缩略图：

```text
/t/{image_id}.jpg
```

规则：

1. 首次访问时按需生成最长边 480px 的 JPEG；小图不放大。
2. 历史接口通过 `thumbnail_url` 返回预览地址，原图打开、复制 URL 和 Markdown 仍使用 `public_url`。
3. 缓存键包含原图 size、modTime、输出规格和实现版本，原图被替换后自动生成新变体。
4. 同一缓存键的并发请求只生成一次，缓存文件使用临时文件加原子重命名提交。
5. 缓存位于 `OMNISTORE_DATA_DIR/cache/thumbnails/`，不在用户存储源中创建 sidecar。
6. 缓存文件超过 30 天未访问后，由启动任务和每日后台任务清理；图片从图床入口删除时同步清理对应缓存。
7. 单张原图最大允许 4000 万像素参与缩略图解码，缓存未命中时全局串行生成，限制解码峰值内存。
8. 缩略图公开响应使用 ETag 和一小时浏览器缓存；存储源禁用或图片记录不存在时返回 404。

---
