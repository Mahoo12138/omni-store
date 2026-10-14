# 能力作用域与文件管理归属

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：2.0 已确认设计。替代把“所有站点功能文件都写进内部目录”的推导。

## 1. Scope

Site：`public_drive`、`image_bed`、`transfer_center`。
Source Protocol：WebDAV、S3、静态 HTTP。静态访问使用 `source_static_access` 中的每源配置；发布范围本身是管理员的公开授权。
Resource：普通 Preview、Share、Copy、Move、Download、Trash、Favorite。

一个 Site 服务最多一个当前 Source binding；可以 disabled/unbound。同一个 Source 可以承担多个 Site 服务。静态 HTTP 每源指定一个普通发布目录，各源可以同时开启，不引入任意 mount 映射。

管理员在「系统设置 → 站点配置 → 站点服务」统一管理公开网盘、快速图床和文件中转的开关与绑定；图床的匿名上传和保留策略也在此管理。「通用配置」集中品牌信息、运行信息与配置导出，旧的三个独立设置入口不再出现在导航中。

## 2. 文件类别

| 服务 | 用户是否维护目录名 | 原件位置 | 通用协议可以访问 |
| --- | --- | --- | --- |
| 快速图床 | 否，随机图片 ID | `.omnistore/image-bed/` | 否，需 `/i/` 业务读取 |
| Transfer Send/Collect | 包内可保留逻辑层级 | `.omnistore/transfer/` | 否，需任务/提交授权 |
| 静态资源 | 是，路径就是公开身份 | 普通目录 | 是，需协议开关和用户 Policy |
| 公开网盘 | 是 | 普通目录 | 按各入口权限 |

因此“Site 服务单例”和“系统托管命名空间”不是同一个维度。

## 3. 当前绑定与历史定位

图床 / Transfer 的当前绑定只决定新写入位置；已有业务记录保存自己的 source/path。不能解除当前绑定就删除仍承载历史数据的 Source。

静态资源无逐文件业务 ID，发布配置决定当前映射。切换 source/root 属于公开身份变更：reset 新 ID 或有核验的 relocate 保持旧 ID，不能直接更换下拉框后沿用同一 baseUrl。

## 4. 启停含义

公开盘、静态资源 enabled=false：后续原站公开读取 404，不保证收回缓存。
快速图床 enabled=false：关闭入口和新上传，历史图片按自身记录和源状态读取；批量撤下是独立明确动作。
Transfer enabled=false：关闭新任务/新提交入口，已有发件包读取仍按任务有效期/撤销状态；已接受的写入按一致性边界完成或回滚，不把开关当磁盘删除指令。

## 5. 权限

静态配置由管理员发布；静态写入走普通路径 Policy，不因为登录就允许修改全部公开资源。图床/Transfer 的服务授权只在自己托管范围内有效，不授予 backing Source 根权限。

## 6. 依赖

三种 Site 服务与静态 HTTP 协议相互独立。静态资源不依赖公开盘启用、Share 存在或图床 images 登记。禁用公开盘不能顺带关闭博客资源；启用公开盘也不能公开 `.omnistore/`。
