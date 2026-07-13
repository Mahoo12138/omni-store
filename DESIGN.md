# Design

视觉语言来源：`docs/index.png`（公开网盘）与 `docs/home.png`（登录后仪表盘）。现代管理后台风格：白色卡片浮在冷调浅灰底上，饱和蓝作为唯一动作色，彩色圆角图标砖承担识别度。

## Theme

- 明亮主题，单主题（自部署工具，桌面日间使用为主）。
- 色彩策略：**Restrained** —— 冷调中性底 + 蓝色单强调（动作、选中、链接），图标砖的多彩仅用于识别实体（存储源/文件类型），不用于装饰。

## Color Palette（OKLCH）

| Token | 值 | 用途 |
|---|---|---|
| `primary` | `oklch(0.55 0.2 262)` ≈ #2563EB | 主按钮、链接、激活态、logo |
| `primaryHover` | `oklch(0.49 0.2 262)` | 主按钮 hover |
| `primarySubtle` | `oklch(0.95 0.03 262)` | 激活导航底、蓝色徽章底 |
| `bg` | `oklch(0.975 0.004 262)` ≈ #F6F7FA | 页面底色（冷调，向品牌色偏 0.004 chroma） |
| `surface` | `oklch(1 0 0)` | 卡片、表格、侧栏 |
| `border` | `oklch(0.925 0.006 262)` | 1px 边框 |
| `ink` | `oklch(0.28 0.02 262)` ≈ #212836 | 标题、正文 |
| `inkSecondary` | `oklch(0.5 0.02 262)` ≈ #62708A | 次要文本（白底上 ≥5:1） |
| `success / warning / danger` | 绿 / 琥珀 / 红 | 语义状态 |

图标砖成对色（bg L≈0.94 C≈0.05 / fg L≈0.55 C≈0.16）：blue、green、amber、purple、teal、red。存储源按 source_id 稳定散列取色；文件类型图标固定映射（PDF 红、文档蓝、表格绿、演示橙、压缩包紫、媒体青）。

## Typography

- 单字族：`Inter, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`；等宽 `ui-monospace` 用于 Token 展示。
- 固定 rem 阶梯（产品 register，比例 ~1.2）：12 / 13 / 14（正文）/ 16 / 20 / 24 / 30。
- 层级靠字重（400/500/600）+ 尺寸，不用花哨字体。

## Components

- **按钮**：primary（蓝底白字）、secondary（白底 1px 边框）、danger、ghost（无边框图标钮）；radius 8px；全状态（hover/focus-visible/disabled）。
- **卡片**：白底、1px border、radius 12px、阴影 ≤ `0 1px 2px`（不与大模糊阴影叠加）。
- **文件表格**（公开/私有共用）：表头 13px 次要色，行高 ~52px，hover 行底 `bg`，名称列 = 类型图标 + 名称，操作列行内按钮。
- **图标**：单一风格内联 SVG（24 视窗、1.8 描边、圆角端点）；实体识别用彩色圆角砖（radius 10px）+ 白色玻夫。
- **徽章**：小圆角（6px）、tint 底 + 深色字：读写=蓝、只读=灰、WebDAV=灰、公开=绿、图床=紫。
- **布局**：公开侧 = 顶栏（logo / 中央导航 / 登录钮）+ 面包屑 + 内容 1200px；登录侧 = 240px 白色侧栏（导航 + 底部账号）+ 内容区顶栏（页标题 + 用户菜单）；<820px 侧栏折叠为顶部横向导航。
- **z-index 阶**：dropdown 10 < sticky 20 < backdrop 30 < modal 40 < toast 50。

## Motion

- 150–200ms，`cubic-bezier(0.22, 1, 0.36, 1)`（ease-out-quint 近似）；只用于状态反馈（hover、菜单开合、行高亮）。
- 无页面加载编排；`prefers-reduced-motion: reduce` 时全部退化为即时切换。

## 不做

- 侧条纹强调、渐变文字、玻璃拟态、大数字指标卡。
- 假数据面板：存储配额、全局搜索、非管理员活动流（后端无此能力时不渲染）。
