# Upload Task System — Current Baseline

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

状态：Implemented in 1.1 / Reuse in 2.0

2.0 不重新实现上传任务管理器。

当前能力：

```text
single file
multi-file
folder upload
relative_path
worker concurrency
progress
retry
cancel
conflict policy
```

## Reuse

新增服务上传必须复用现有 Upload Task Manager 的任务/进度/Worker 概念。

可以为不同目的地增加 adapter：

```text
Upload Task Manager
├── File API Adapter
└── Image Bed Adapter
```

不要复制一份新的队列实现。

## Backend

普通 Folder Upload 已采用：

```text
target root + relative_path
```

客户端不能指定内部真实路径；`relative_path` 只表示源内普通路径。

## Non-goals

2.0 新增上传入口不因为复用上传 UI 就自动获得：

- 断点续传；
- chunk resumable upload；
- 浏览器刷新后继续任务。

这些需要独立需求。

## 两类上传目的地

任务调度 UI 可复用，但上传授权适配器必须区分：普通文件（含博客静态目录，路径 Policy）、快速图床（服务授权，系统分配图片 ID）。不要因为它们共用队列，就向客户端暴露内部 Source/路径或统一为 generic upload 的 internal bypass。

静态目录上传保留 relative_path；图床不允许借 relative_path 越出托管范围。匿名图床不接收目录批量视频。暂停调度不等于跨浏览器刷新续传；进度和取消语义继续遵循已有任务契约。
