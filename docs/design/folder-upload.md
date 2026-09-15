# Folder Upload Design

状态：Draft / Planned for 1.1

## Problem

用户有整个目录树需要上传，例如博客静态资源：

```text
blog-images/
├── avatar.png
├── posts/
│   └── 2026/
│       └── a.webp
└── projects/
    └── omnistore/
        └── cover.png
```

当前普通上传只使用文件 basename，无法保留目录层级。

## Browser

浏览器通过目录选择能力获取 File 列表及相对路径，例如：

```text
file.name               = a.webp
file.webkitRelativePath = blog-images/posts/2026/a.webp
```

## API

不要把路径偷偷编码进 multipart filename。

建议显式传：

```text
target root path
relative_path
overwrite
```

语义：

```text
target=/assets
relative_path=blog-images/posts/2026/a.webp

→ /assets/blog-images/posts/2026/a.webp
```

具体字段可以在实现前根据现有 API 风格冻结。

## Server Validation

`relative_path` 必须：

1. Normalize；
2. 拒绝 absolute / `..`；
3. 检查每个 segment 的 reserved namespace；
4. 合并目标 root；
5. 对最终路径检查 Policy；
6. 对需要创建的父目录检查写权限；
7. 应用 exclude；
8. 安全解析 symlink；
9. quota；
10. 复用现有 Upload Pipeline。

## Parent Directories

后端可以按相对路径自动确保缺失父目录存在，但创建目录本身也必须是受控文件操作。

并发文件拥有相同父目录时，目录创建必须幂等处理“已存在目录”。

## Conflict

任务级策略：

```text
ask
skip
overwrite
```

`overwrite` 仅适用于文件覆盖，不能用文件覆盖目录。

## Empty Directory

普通 `<input webkitdirectory>` 只返回 File，无法可靠枚举完全空目录。

1.1 第一版明确：

> 保证所有包含文件的目录结构；不保证保留完全空目录。

如果未来有真实需求，再单独设计 directory manifest；不为此阻塞 Folder Upload。

## Non-goals

- ZIP 解压上传；
- 双向同步；
- 增量镜像；
- 自动删除服务端额外文件。
