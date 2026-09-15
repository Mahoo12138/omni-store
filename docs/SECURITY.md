# 身份、权限与存储安全

本文档记录 OmniStore 当前安全边界。

## 1. 身份与 Session

Web 登录使用服务端 Session。

要求：

- 密码使用 bcrypt；
- 不存在用户名也执行等价成本的密码校验，降低枚举时序差异；
- 登录防爆破同时按 IP 和精确用户名限流；
- 成功登录重置对应失败窗口；
- Session 使用独立随机标识；
- CSRF Token 按 Session 稳定派生，多标签页不会因为 `/auth/me` 轮换失效；
- 修改密码撤销其他 Web Session；
- CLI 紧急重置可撤销全部 Session。

## 2. 首个管理员初始化

首次启动使用一次性 Bootstrap Credential。

要求：

- 初始化接口只在系统没有用户时开放；
- 首用户插入必须原子；
- 并发初始化最多一个成功；
- 完成后初始化入口永久关闭；
- Bootstrap 凭据不能成为日常管理员密码或长期 Token。

## 3. Token 与凭据

### WebDAV

使用用户名 + 独立 WebDAV Token 的 Basic Auth。

### 图床

每用户可以持有多个命名 Token，数据库仅保存 hash，支持独立撤销。

### S3

Access Key ID 可以明文保存；Secret Access Key 使用实例 master key 做 AES-256-GCM 可恢复加密，只在创建时展示。

管理员恢复操作必须允许一键撤销账号相关 WebDAV、图床、S3 和 Session 凭据。

## 4. Policy

普通用户有效权限由绑定的多个 Policy 合并。

规则：

- Source 级默认权限；
- 子路径规则按最长路径前缀命中；
- 多 Policy 取最高有效权限；
- 权限至少区分只读/读写；
- REST、WebDAV、S3、登录用户图床使用统一路径权限语义。

权限不是路径安全的替代品，即使管理员也不能绕过不安全路径解析。

## 5. 路径安全

所有外部输入必须转换为 Storage Source 内相对路径。

禁止：

- 绝对路径；
- `..` 跳出 Source；
- 路径分隔符混淆；
- 访问 Source 根之外；
- 通过 symlink 逃逸；
- 用户创建系统保留命名空间。

系统保留前缀：

```text
.omnistore-upload-
.omnistore-copy-
```

用户列表、S3 对象列表等枚举入口隐藏整个保留命名空间；物理用量统计仍计算真实存在的普通文件。

## 6. Symlink

OmniStore 不把 symlink 当普通用户文件继续跟随。

路径检查和最终打开/写入之间必须尽量缩短 TOCTOU 窗口，并通过安全路径解析限制逃逸。

公开入口尤其不能借 symlink 暴露 Source 之外数据。

## 7. 排除规则

Storage Source 可以配置全局排除路径。

排除规则作用于：

- 私有 REST；
- 公开网盘；
- WebDAV；
- S3；
- 图床；
- 扫描、索引和 Reconcile。

排除不等于“文件不存在”，也不减少 Storage Source 的真实物理占用。

## 8. 同源主动内容

公开网盘和分享的 raw 内容必须防止同源 XSS。

HTML、SVG、XML、JavaScript 等主动内容默认强制下载；公开原始内容设置 `nosniff` 与受限 CSP。

图片、视频等允许 inline 的内容必须根据确定的 MIME 和安全策略返回。

## 9. 上传

普通上传：

- 有单文件大小限制；
- 先写同目录内部临时文件；
- journal-first；
- 写完 fsync；
- 再执行原子安装；
- 覆盖时保留旧目标备份直到数据库提交；
- 不允许半写最终路径。

没有对应 journal 的“长得像临时文件”的文件不允许自动删除。

## 10. 配额

Storage Source quota 是物理硬配额；用户 quota 是所有权配额。

必须覆盖所有最终写入口：

- REST；
- WebDAV；
- S3 PUT；
- Multipart complete；
- 图床；
- 复制；
- 移动目标；
- 回收站恢复。

系统保留文件、staging 和宿主机直接创建的普通文件仍计入真实物理使用量。

## 11. 回收站

网页普通删除进入系统数据目录中的回收站；WebDAV/S3/图床协议删除保持其明确的永久删除语义。

恢复时重新校验：

- Policy；
- exclude；
- symlink；
- WebDAV lock；
- Source quota；
- 目标冲突。

## 12. 代理与客户端 IP

只有配置为可信代理的上游才允许影响真实客户端 IP 解析。

不得无条件信任来自公网请求的 `X-Forwarded-For` / `X-Real-IP`。

## 13. 审计

安全相关操作必须可审计，包括：

- 登录成功/失败/限流；
- 用户和权限变更；
- Token/Credential 创建、禁用、撤销；
- 文件写操作；
- 分享创建/撤销；
- Storage Source 管理；
- 恢复和维护动作。

日志禁止记录密码、明文 Token、Secret Access Key 等敏感值。
