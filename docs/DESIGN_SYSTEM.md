# OmniStore 设计系统

## 1. 设计目标

关键词：

```text
清爽
可靠
克制
安静
高效
```

界面像“安静的文件柜”，而不是营销 SaaS 或企业监控大屏。

## 2. 基础原则

- 内容优先于装饰；
- 信息层级清晰；
- 文件列表允许较高密度；
- 常用动作短路径；
- 危险操作明确文本 + 二次确认；
- 不用颜色作为唯一状态表达；
- 不展示后端不存在的伪数据。

## 3. Token

颜色、间距、字体、圆角、阴影全部来自统一主题 Token。

业务组件禁止随意建立第二套视觉变量。

## 4. 基础组件

统一组件层：

```text
Button
Input
Select
Checkbox
Dialog
DropdownMenu
Table
Toast
Tabs
Tooltip
EmptyState
Skeleton
Progress
```

文件域组件：

```text
FileTable
Breadcrumb
FileActions
UploadDropzone
SourceSwitcher
QuotaUsage
```

## 5. 状态

交互控件完整覆盖：

- default；
- hover；
- focus-visible；
- active；
- disabled；
- loading；
- error。

页面覆盖：

- loading；
- empty；
- error；
- permission denied。

Empty State 说明原因并给出一个清晰下一步。

## 6. 文件列表

文件管理器优先保证：

- 文件名空间；
- 类型/大小/时间清晰；
- 行操作不过度占位；
- 多选状态明显；
- 目录和文件可辨别；
- 排序可发现；
- 不暴露 Source ID、真实 root path 等非用户必要内部信息。

## 7. 响应式

桌面是主要环境。

移动端仍必须支持：

- 登录；
- 文件浏览；
- 上传；
- 下载；
- 基础文件操作；
- 图床；
- 公开网盘/分享。

窄屏时侧栏可以变为顶部/抽屉导航；表格必要时横向滚动，但不能直接删除核心功能。

## 8. 无障碍

目标 WCAG 2.1 AA：

- 正文对比度 ≥ 4.5:1；
- 键盘可达；
- focus 可见；
- Label 与 Form Control 正确关联；
- Icon Button 有明确 accessible name；
- Dialog 有标题和关闭语义；
- 尊重 `prefers-reduced-motion`。

## 9. 1.1 体验扩展

文件夹上传、上传任务中心、批量操作、拖拽、最近/收藏等新能力继续复用现有 Token 和组件，不建立“新版 UI”第二套体系。
