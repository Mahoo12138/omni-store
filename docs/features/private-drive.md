# 私有网盘与文件操作

## 1. 展示模型

登录用户先看到自己有权限的 Storage Source，再进入 Source 内相对路径。

不构造统一虚拟文件树。

```text
/app
/app/sources/{storage_key}?path=/
```

界面使用 Source 名称，不要求用户理解 key 或真实路径。

## 2. 当前文件能力

`1.0.0` 已支持：

- 浏览；
- 新建文件夹；
- 上传；
- 下载；
- 重命名；
- 同源/跨源移动；
- 同源/跨源复制；
- 回收站；
- 永久清理；
- 分享；
- 全局搜索；
- 文件基础信息。

`1.1` 计划补充批量操作、文件夹上传、拖拽、最近/收藏，详见版本路线。

## 3. 上传

REST 普通上传默认单文件、默认不覆盖。

同名目标：

- 返回 `409`；
- 用户明确确认后使用 `overwrite=true`；
- 文件不覆盖目录；
- 目录不覆盖文件。

写入过程：

```text
planned journal
→ 同目录 temp
→ fsync
→ prepared
→ install/backup
→ DB transaction
→ database-ready
→ cleanup
```

所有列表隐藏系统保留命名空间。

Source 物理使用量仍统计真实存在的普通文件，包括 staging/宿主机手工创建的保留名前缀文件。

## 4. 删除和回收站

网页普通删除进入：

```text
{data.dir}/trash/{trash_key}/payload
```

不是 Source 内隐藏目录。

删除后：

- Source 物理 quota 立即释放；
- 用户 quota 在永久清理后释放；
- 普通用户只看到自己删除的条目；
- 管理员可以查看 Source 内全部；
- 恢复默认原路径，也可指定同 Source 新路径；
- 不覆盖已有目标。

WebDAV/S3/图床协议删除保持永久删除语义。

## 5. Copy / Move

目标冲突返回 `409`，不自动改名、不隐式覆盖。

目录复制：

- 递归检查 exclude；
- 拒绝不支持 symlink；
- 目标同级 staging；
- 完整后原子发布。

跨 Source Move：

- 先完整写目标；
- DB/台账/图床定位提交；
- 再移除源；
- 使用持久阶段日志恢复。

复制产生的新文件归执行用户；移动保留已有所有权，`unowned` 仍保持 unowned。

## 6. 列表、分页、排序

支持：

```text
page
page_size
sort=name|size|mtime|type
order=asc|desc
```

列表实时读取真实目录；全局搜索使用 active `file_records` 的 FTS5 trigram。

## 7. 下载

文件流式返回，不整文件读入内存。

HTTP Range 可用于私有、公开 raw、WebDAV 和后续媒体预览。

私有下载默认：

```text
Content-Disposition: attachment
Cache-Control: private, no-store
```

## 8. 缓存

- JSON API：`no-store`
- 私有下载：`private, no-store`
- 公开 raw：短期 public cache
- 不可变 Image ID：长期 public immutable

## 9. 1.1 规划

当前单文件上传接口不会保留 multipart filename 中的目录路径。

`1.1` 通过明确 `relative_path` + Upload Task Manager 支持 Folder Upload，不通过 ZIP 解压实现。

见：

- `../design/upload-task-system.md`
- `../design/folder-upload.md`
