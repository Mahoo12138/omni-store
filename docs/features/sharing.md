# 文件与目录分享

## 1. 定位

Share 用于把某个私有文件/目录通过随机链接向外提供访问。

与公开挂载不同，Share 支持独立生命周期。

## 2. 当前能力

支持：

- 文件；
- 目录；
- 随机 Share Key；
- 可选密码；
- 可选过期时间；
- 可选最大下载次数；
- 管理列表；
- 撤销；
- 审计；
- 与移动/回收/删除生命周期联动。

## 3. 安全

- 密码只保存 hash；
- Share Key 使用不可预测随机值；
- 访问每次校验状态；
- 过期/撤销后立即失效；
- 主动内容不允许通过同源 inline 形成 XSS；
- 不暴露真实 root path。

## 4. 文件生命周期

文件移动时，分享应跟随系统记录的目标更新，而不是永久绑定旧字符串路径。

进入回收站时分享暂时不可用；恢复后根据已确认的生命周期语义恢复；永久删除后分享失效。

## 5. Share 2.0（1.2.0）

`1.2.0` 在不改变 Share 安全模型的前提下升级访问页（见 [`design/share-preview-system.md`](../design/share-preview-system.md)）：

- 文件分享按统一 Preview 类型直接预览（图片/PDF/文本族/音视频），不支持则仅下载；
- 目录分享提供 列表 / 画廊 两种视图，画廊展示图片并可进入与文件管理器相同的预览弹层；
- 目录打包下载使用流式 ZIP（`GET /share/{key}/archive`），直接写入响应，不在磁盘生成中间包，并消耗 1 次下载次数；
- 打包过程继续受 exclude 规则、保留名称、symlink 安全与子树读锁约束；
- 公开信息接口区分"不存在（404）"与"已过期 / 次数用完（410，`SHARE_EXPIRED` / `SHARE_EXHAUSTED`）"，内容接口仍统一折叠为 404，不泄露内部细节；
- 分享管理页提供分享链接二维码；
- 公开页品牌名来自实例品牌设置（`system_settings.instance_name`，管理员后台可改，缺省 OmniStore）。

分享页与文件管理器共用统一 Preview Resolver 与渲染器（`web/src/preview/`），不单独实现第二套预览器。

相关设计：

- [`design/preview-resolver.md`](../design/preview-resolver.md)
- [`design/share-preview-system.md`](../design/share-preview-system.md)
