---
name: OmniStore
description: 像安静文件柜一样清爽、可靠、克制的自托管存储界面
colors:
  cabinet-blue: "oklch(0.52 0.18 257)"
  cabinet-blue-hover: "oklch(0.46 0.18 257)"
  cabinet-blue-active: "oklch(0.41 0.17 257)"
  cabinet-blue-mist: "oklch(0.955 0.025 257)"
  cabinet-blue-ink: "oklch(0.43 0.17 257)"
  cool-room: "oklch(0.982 0.006 248)"
  white-shelf: "oklch(1 0 0)"
  quiet-hover: "oklch(0.965 0.01 248)"
  hairline: "oklch(0.91 0.012 248)"
  strong-hairline: "oklch(0.82 0.018 248)"
  graphite: "oklch(0.25 0.035 258)"
  slate-note: "oklch(0.49 0.03 255)"
  confirmation-green: "oklch(0.56 0.15 150)"
  caution-amber: "oklch(0.62 0.14 75)"
  destructive-red: "oklch(0.55 0.19 27)"
typography:
  display:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "5px"
  md: "9px"
  lg: "14px"
  tile: "10px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.cabinet-blue}"
    textColor: "{colors.white-shelf}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.cabinet-blue-hover}"
    textColor: "{colors.white-shelf}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.white-shelf}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  field-default:
    backgroundColor: "{colors.white-shelf}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  nav-active:
    backgroundColor: "{colors.cabinet-blue-mist}"
    textColor: "{colors.cabinet-blue}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "11px 13px"
---

# Design System: OmniStore

## Overview

**Creative North Star: "安静的文件柜"**

OmniStore 的界面像一只整理良好的文件柜：空间冷静、分类明确、把手的位置可以凭习惯找到。浅冷灰背景承载白色工作面，石墨色文字提供稳定阅读，柜体蓝只在主要动作、链接和选中状态出现。页面允许文件表格保持有效率的密度，但在模块之间保留足够呼吸感，让用户长时间管理文件也不疲劳。

它是一套平面分层、克制交互的工具型系统。结构主要由背景色、白色表面和 1px 发丝边框表达；阴影只属于真正离开文档流的弹窗与菜单。系统明确拒绝企业级控制台的复杂度、营销化的 SaaS 首页语言，以及伪造数据的装饰性面板。

**Key Characteristics:**

- 冷调中性底与白色工作面组成稳定层级。
- 柜体蓝是唯一动作色，单屏占比应保持在约 10% 以内。
- 224px 侧栏、68px 顶栏和紧凑文件表格服务高频操作。
- 圆角克制，组件以 9px 为主、容器以 14px 为主。
- 动效只反馈状态，不进行页面级编排。

## Colors

这是一组“冷静房间 + 白色柜体 + 单一蓝色把手”的配色：中性色负责空间，蓝色负责意图，语义色只说明状态。

### Primary

- **柜体蓝** (`oklch(0.52 0.18 257)`): 主按钮、链接、激活导航、品牌图标和可操作名称；它代表“可以继续”的明确意图。
- **深柜体蓝** (`oklch(0.46 0.18 257)`): 柜体蓝按钮的 hover 状态，不能作为新的装饰色。
- **按下蓝** (`oklch(0.41 0.17 257)`): 主按钮 active 状态，仅在按压反馈中短暂出现。
- **蓝雾** (`oklch(0.955 0.025 257)`): 激活导航、头像和蓝色徽章的低对比底色。
- **蓝墨** (`oklch(0.43 0.17 257)`): 蓝雾上的文字和图标，保持可读对比。

### Neutral

- **冷静房间** (`oklch(0.982 0.006 248)`): 页面背景，极轻的冷蓝倾向让白色表面可被感知。
- **白色搁板** (`oklch(1 0 0)`): 侧栏、顶栏、表格、卡片、输入框和弹窗表面。
- **安静悬停** (`oklch(0.965 0.01 248)`): 行、ghost 按钮、菜单项的 hover 底色。
- **发丝线** (`oklch(0.91 0.012 248)`): 默认 1px 边框与分隔线。
- **强调发丝线** (`oklch(0.82 0.018 248)`): 输入框或次按钮 hover 边界。
- **石墨** (`oklch(0.25 0.035 258)`): 标题、正文、文件名和高优先级信息。
- **便签灰** (`oklch(0.49 0.03 255)`): 辅助说明、标签、时间与非激活导航。

### Semantic

- **确认绿** (`oklch(0.56 0.15 150)`): 成功、公开和已连接状态。
- **提醒琥珀** (`oklch(0.62 0.14 75)`): 需要注意但尚未失败的状态。
- **销毁红** (`oklch(0.55 0.19 27)`): 删除与不可逆操作；必须同时使用明确文案。

### Named Rules

**The One Handle Rule.** 柜体蓝是唯一动作色，单屏占比保持在约 10% 以内；多彩图标砖只用于识别实体或文件类型，不能成为页面装饰。

**The Meaning Before Color Rule.** 成功、警告和危险状态必须同时有文字或图标语义，不能只靠绿、黄、红区分。

## Typography

**Display Font:** Aptos（回退至 Segoe UI Variable、Segoe UI 与中文系统无衬线字体）

**Body Font:** Aptos（同一字体栈）

**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace`

**Character:** 单一人文无衬线字体让界面熟悉、清晰、不带品牌表演感。层级主要依靠 400 / 500 / 600 的字重和小幅尺寸变化，适合中文文件名与高密度表格。

### Hierarchy

- **Display** (600, 32px, 1.2): 仅用于空状态或引导页的最大标题，不用于普通后台页头。
- **Headline** (600, 24px, 1.25): 页面主标题和重要设置分组；字距 `-0.02em`。
- **Title** (600, 16px, 1.4): 顶栏标题、卡片标题、弹窗标题与表格空状态标题。
- **Body** (400, 14px, 1.55): 正文、表格内容、按钮和输入；长说明限制在约 70ch。
- **Label** (500, 13px, 1.4): 表头、字段标签、元数据和紧凑辅助动作；保持正常大小写，不强制全大写。
- **Micro** (400, 12px, 1.4): 侧栏元信息和极低优先级说明，不承载关键操作信息。

### Named Rules

**The Quiet Hierarchy Rule.** 普通工作页最多同时出现三个文字层级；优先调整字重和间距，不用夸张字号或彩色标题制造层级。

## Elevation

系统采用平面分层为主、悬浮阴影为辅的策略。页面背景、白色表面和发丝边框承担静态结构；卡片、表格与侧栏在静止时没有宽阴影。只有下拉菜单、对话框等真正覆盖其他内容的浮层使用环境阴影，焦点则使用清晰的蓝色轮廓而非发光效果。

### Shadow Vocabulary

- **贴面阴影** (`0 1px 2px oklch(0.22 0.03 258 / 0.05)`): 仅在需要从同色背景中轻微分离的小表面使用；大多数有边框容器不需要它。
- **浮层阴影** (`0 14px 36px oklch(0.22 0.03 258 / 0.10)`): 下拉菜单与模态框，必须与脱离文档流的行为绑定。
- **焦点轮廓** (`2px solid oklch(0.52 0.18 257)`, offset `2px`): 所有键盘可操作元素的 `focus-visible` 状态。

### Named Rules

**The Flat Cabinet Rule.** 静止表面默认平坦；同一个容器不要同时依赖 1px 边框和宽模糊阴影表达层级。

## Components

组件应当“稳、准、短”：形状不过分圆润，反馈清楚但不弹跳，常用动作在一到两次操作内完成。

### Buttons

- **Shape:** 36px 高、9px 圆角，水平内边距 16px，图文间距 6px。
- **Primary:** 柜体蓝底、白字、500 字重；仅用于当前区域最主要的提交或创建动作。
- **Hover / Focus:** hover 切换为深柜体蓝；active 使用按下蓝或向下移动 1px；`focus-visible` 使用 2px 柜体蓝轮廓。
- **Secondary:** 白色搁板底、发丝线边框、石墨字；hover 同时使用安静悬停底与强调发丝线。
- **Ghost:** 透明底、便签灰图标；hover 使用安静悬停底并切换为石墨。
- **Danger:** 销毁红底、白字；仅在确认上下文中使用，不与主按钮并列争夺注意力。

### Chips

- **Style:** 5–6px 小圆角、13px 标签字；背景使用对应语义色的浅 tint，文字使用更深的同色值。
- **State:** 徽章用于表达公开、只读、WebDAV、成功或警告状态，不作为可点击装饰；可点击筛选必须有 hover 和选中标识。

### Cards / Containers

- **Corner Style:** 内容容器使用 14px 圆角；图标砖使用 10px；按钮和字段使用 9px。
- **Background:** 白色搁板置于冷静房间之上。
- **Shadow Strategy:** 静态容器无宽阴影，遵循 Flat Cabinet Rule。
- **Border:** 默认 1px 发丝线；分隔线同色。
- **Internal Padding:** 16px 用于紧凑表格与工具栏，24px 用于表单和空状态，40px 只用于大块引导空间。

### Inputs / Fields

- **Style:** 36px 高、白底、1px 发丝线、9px 圆角、14px 正文，水平内边距 16px。
- **Focus:** 边框切换为柜体蓝，并补充 `focus-visible` 轮廓；不使用模糊光晕。
- **Error / Disabled:** 错误使用销毁红边框并提供文字说明；disabled 降低不透明度并移除指针暗示，但保持文字可辨。

### Navigation

- 登录侧桌面布局使用 224px 白色侧栏和 68px 半透明白色顶栏；导航项为 9px 圆角、`11px 13px` 内边距。
- 默认导航为便签灰，hover 使用安静悬停底与石墨字，激活项使用蓝雾底和柜体蓝字。
- 820px 以下侧栏变为顶部横向导航；480px 以下可隐藏品牌文字，但不能隐藏核心导航动作。
- 公开侧顶栏必须根据真实认证状态显示“登录”或用户入口；已登录时不能继续呈现误导性的“登录”按钮。

### File Table

- 文件表格是公开与私有侧共享的签名组件：白底、14px 圆角、1px 发丝线、可横向滚动。
- 表头使用 13px / 500 便签灰；数据行使用 14px；单元格上下内边距 10–12px。
- 文件名列使用类型图标砖、文件名和必要元数据；行 hover 只切换为安静悬停底。
- 行内动作保持 30px 方形点击目标并使用 ghost 样式；危险动作 hover 使用浅红底和销毁红。

### Motion and Feedback

- 状态切换使用 150–200ms 与 `cubic-bezier(0.22, 1, 0.36, 1)`；只动画颜色、边框、透明度与最多 1px 的按压位移。
- 不做页面加载编排；加载使用结构匹配的 skeleton，空状态必须解释原因并给出下一步。
- `prefers-reduced-motion: reduce` 时取消非必要动画与平滑滚动。

## Do's and Don'ts

### Do:

- **Do** 让柜体蓝只出现在主动作、链接、选中项与品牌识别上，并控制在单屏约 10% 以内。
- **Do** 使用冷静房间、白色搁板和 1px 发丝线建立层级，让阴影只属于菜单与弹窗。
- **Do** 为 hover、focus-visible、disabled、loading、empty 和 error 编写完整状态。
- **Do** 让空状态说明“为什么为空”和“下一步做什么”，且只突出一个主动作。
- **Do** 保持公开侧与登录侧的文件表格、按钮、图标和操作文案一致。
- **Do** 在 820px 与 480px 断点验证导航、表格横滚和核心操作是否仍完整可用。
- **Do** 根据真实认证状态显示“登录”或用户菜单，并让退出登录是明确的用户动作。

### Don't:

- **Don't** 引入企业级控制台的复杂度：多层抽屉、无尽配置页、为了显得专业而增加的层级。
- **Don't** 使用营销化的 SaaS 首页语言：大数字指标卡、渐变文字、口号式模块。
- **Don't** 创建伪造数据的装饰性面板：没有后端支撑的配额、趋势、活动流或全局统计。
- **Don't** 使用侧条纹强调、玻璃拟态、霓虹光晕、巨大模糊阴影或胶囊化所有组件。
- **Don't** 在同一个静态容器上同时叠加 1px 边框和宽模糊阴影。
- **Don't** 用彩色图标砖装饰页面；它们只用于稳定识别存储源、文件类型或语义实体。
- **Don't** 仅靠颜色表达成功、警告、危险或权限差异。
