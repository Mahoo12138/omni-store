# Upload Task System Design

状态：1.1 已实现

## Problem

当前文件管理器的上传更接近“一个请求 = 一个文件”。多文件和目录上传需要统一的任务状态、进度、并发、失败重试和取消体验。

## Goals

统一管理：

```text
单文件上传 ─┐
多文件上传 ─┼─→ Upload Task Manager
文件夹上传 ─┘
```

## Task Model

建议前端模型：

```text
UploadTask
- id
- sourceKey
- targetPath
- kind: file | files | directory
- conflictPolicy
- status
- totalFiles
- completedFiles
- failedFiles
- skippedFiles
- totalBytes
- uploadedBytes
- items[]
```

Item：

```text
queued
uploading
succeeded
failed
skipped
cancelled
```

## Worker Pool

限制并发，例如 3～6 个请求，不一次对数百文件并发。

每个 File 独立调用后端上传 API，因此：

- 已成功项无需重复；
- 失败项可独立重试；
- 后端现有单文件 Crash Recovery 可以复用。

## Progress

总进度优先按 Bytes；同时显示：

```text
137 / 420 files
256 MB / 786 MB
```

## Pause

若第一阶段的网络请求不能真正恢复 offset，“暂停”只能停止派发新任务，并允许当前请求结束/取消。

不能把这种暂停宣传为“断点续传”。

## Persistence

1.1 第一版可以只维护页面/会话级任务，不承诺浏览器刷新后继续。

持久上传任务与断点续传不应顺手扩大 Scope。
