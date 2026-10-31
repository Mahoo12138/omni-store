# OmniStore 2.0 验收标准

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

本文件是 2.0 RC 前必须全部满足的最终验收基线。

## 1. Migration

- [ ] Fresh database 可以直接创建 2.0 schema
- [ ] 1.1.x database 可以升级到 2.0
- [ ] 已发布 migration 未被修改
- [x] 多 legacy Public Source 时不会随机绑定（2026-11-01：0/1/多候选迁移测试）
- [x] 多 legacy Image Bed Source 时不会随机绑定（2026-11-01：0/1/多候选迁移测试）
- [x] 存量 Source 升级后保留 1.x S3 可达性；fresh 2.0 源默认关闭（2026-11-01 迁移测试）
- [ ] 旧 images/shares/file_records 不丢失
- [ ] 真实 Storage Source 文件不被 migration 移动/删除

## 2. Capability Scope

- [ ] Public Drive 全站最多一个 binding
- [ ] Image Bed 全站最多一个 binding
- [ ] 同一 Source 可被多个 Site Capability 复用
- [ ] WebDAV/S3 为 per-source switch
- [ ] Source rename 不改变 storage_key
- [ ] Source 删除被 active binding 正确阻止

## 3. Service Namespace

- [ ] File REST 不可读写 `.omnistore`
- [ ] Public Drive 不显示
- [ ] WebDAV 不显示/访问
- [ ] S3 不显示/访问
- [ ] Search 不索引
- [ ] Share 不能创建到该 namespace
- [ ] Source physical quota 仍统计
- [ ] collision preflight 不删除未知文件

## 4. Public Drive

- [ ] `/public` 映射唯一绑定 Source
- [ ] Anonymous read only
- [ ] exclude/symlink/active-content 安全
- [ ] Disable 后立即不可访问

## 5. Image Bed

- [ ] 用户不再选择 Source
- [ ] 当前 binding 接收新图
- [ ] 旧图片 URL 继续有效
- [ ] Anonymous 开关正确
- [ ] PicGo 回归
- [ ] Rebind 不移动旧文件

## 6. Protocol

- [ ] WebDAV source switch
- [ ] S3 source switch
- [ ] Bucket = storage_key
- [ ] ListBuckets 权限正确
- [ ] `.omnistore` 不泄漏
- [ ] Multipart 回归
- [ ] LOCK/UNLOCK 回归

## 7. Operation Center

- [ ] real system status
- [ ] Source health
- [ ] capability health
- [ ] DB health
- [ ] reconcile/cleanup/integrity actions audited

## 8. Backup/Restore

- [ ] Backup manifest/checksum
- [ ] DB consistent snapshot
- [ ] config/keys
- [ ] no Source payload
- [ ] Fresh restore
- [ ] Source rebind
- [ ] capability validation
- [ ] reconcile
- [ ] restore report

## 9. Quality

- [ ] frontend tests
- [ ] production build
- [ ] Go tests
- [ ] vet
- [ ] race
- [ ] coverage gates
- [ ] E2E
- [ ] release builds
- [ ] crashcheck 10 rounds
- [ ] real WebDAV/S3/PicGo compatibility matrix

## 10. 静态资源完整验收

- [x] AS-01 每源至多一份静态 HTTP 配置；多源同时发布、内容/CORS/缓存隔离；未配置时不公开（Go 集成测试）
- [ ] AS-02 公开盘关闭、无 Share、无 image 记录，普通磁盘媒体仍可通过 baseUrl 读取
- [ ] AS-03 blog-assets/images/posts/2026/cover.webp 映射成文章相对路径；视频同理
- [ ] AS-04 文件夹上传保留层级，重复同名按 ask/skip/overwrite，不生成随机文件名
- [ ] AS-05 其他登录用户没有目标 Policy 时不能覆盖博客资源；快速图床 Token 不能代替
- [ ] AS-06 WebDAV/S3 写普通目录后可读取；禁用这些协议不阻断静态服务读
- [ ] AS-07 发布根/子目录/index.html 默认不作为目录入口；内部/越界/排除/非法类型 404
- [ ] AS-08 同路径覆盖 URL 不变，原文件 rename/delete 后原站 404；不承诺清除客户端缓存
- [ ] AS-09 普通 PUT 改 source/root 返回 409；reset 后旧 ID 404，relocate 需核验和审计
- [ ] AS-10 short/no-cache/long 与确认规则；304/206 保留必要 CORS/cache 头
- [ ] AS-11 媒体 seek 返回正确 Range；416 与 HEAD 元数据/无体正确
- [ ] AS-12 public_origin 不可信输入不生成外链；特殊文件名分段 URL 编码可往返
- [ ] AS-13 两个真实 origin 的 img/video/fetch/Canvas 工作；管理 API 不因此跨域开放
- [ ] AS-14 同一源两项 Site 服务+两种协议的组合不会泄漏 `.omnistore/`
- [ ] AS-15 备份恢复保留发布 ID 与配置，但核验 Source/发布根前没有自动公开

## 11. 命名空间与图床补充验收

- [ ] NS-08 现存和不存在 `.omnistore` 直接浏览均 404，不以错误内容泄露存在性
- [ ] NS-09 超级管理员通用文件 API 也不能直接访问，专用图床业务入口可按规则读
- [ ] NS-10 编码路径、双编码、反斜杠、query、Destination、S3 key 与 multipart 均无旁路
- [ ] NS-11 `.omnistore.txt` 不因完整段规则误伤，旧 temp 前缀继续保留
- [ ] NS-12 Unknown namespace collision 不被自动接管/删除
- [ ] NS-13 file_records.scope + FTS + Reconcile 组合不会把托管图当 missing，也不公开内部路径
- [ ] IMG-07 匿名默认关闭；保留天数变更不追溯删图；expires_at 与响应 freshness 一致
- [ ] IMG-08 静态资源原件不受图床保留期影响，不进入快速图床历史，源物理/用户用量不重复

## 12. 给 Agent 的证据要求

测试报告需附版本 SHA、命令、退出码、实际场景和失败信息。文档路径/链接检查不等同于 Go、前端、E2E、迁移或 crashcheck 通过。以上勾选只有在代码与测试实际完成后才能更改。
