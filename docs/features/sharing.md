# 文件分享

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

Share 是 Resource Capability。

语义：

```text
Existing File/Directory
-> Share
```

不是 Transfer。

保留：

- password；
- expiry；
- download limit；
- revoke；
- Preview；
- Directory Gallery；
- Stream ZIP；
- QR；
- expired/exhausted status。

2.0 不把 Share 合并进 Transfer。

区别：

```text
Share    = 已有资源增加访问入口
Transfer = 创建一次独立临时交付
```

## 与静态发布的关系

Share 不是博客静态资源的必经步骤。静态服务基于一个发布根长期按路径读取，不为每个文件创建 Share，不消耗 Share 下载额度，也不继承其密码/有效期。

Share 指向普通文件时继续沿用文件生命周期；指向 `.omnistore/` 的直接 Share 创建拒绝，目录打包不能递归带出内部服务文件。随机图片 ID 和 Transfer 任务应通过各自业务入口访问。
