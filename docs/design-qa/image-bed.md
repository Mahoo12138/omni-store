# 图床页设计 QA

- Source visual truth: `C:/Users/mahoo/AppData/Local/Temp/codex-clipboard-bef67b9b-7b51-427c-ac64-a2cc70eeccb2.png`
- Preserved source copy: `D:/Code/Go/omni-store/output/playwright/imagebed-reference-1672x941.png`
- Implementation screenshot: `D:/Code/Go/omni-store/output/playwright/imagebed-final-1672x941.png`
- Side-by-side comparison: `D:/Code/Go/omni-store/output/playwright/imagebed-design-comparison.png`
- Viewport: 1672 × 941
- State: 已登录超级管理员；一个可用但未设置默认值的图床目标；两张真实上传图片；网格视图；全部时间

## Full-view comparison evidence

参考图与实现以相同 1672 × 941 视口并排检查。最终实现保持了参考图的核心三栏构图：左侧上传区、中部目标与接口区、右侧信息与教程区；历史图片区位于主列下方。主体顶边、卡片高度、列间距和右侧栏宽度已在第二轮调整后对齐。

全局应用侧栏和顶栏沿用仓库现有 AppShell，没有恢复参考图中的搜索框、用户卡片或虚构容量数据。这是既有产品约束，不是本页设计漂移。

## Focused region comparison evidence

- 上传与目标区域：上传热区、目标选择器、状态徽章和三行接口信息的层级与参考图一致；目标选择器实际值与上传参数已联动。
- 历史图片区：卡片使用真实图片、文件名、时间、体积和操作按钮；网格密度与参考图一致，卡片数量由真实数据决定。
- 右侧信息区：目标摘要、上传统计、设置入口和 PicGo 教程结构与参考图一致；明文 Token 不被伪造或回显。
- 移动端：390 × 844 检查无横向溢出，`scrollWidth` 与 `clientWidth` 均为 390。

## Required fidelity surfaces

- Fonts and typography: 继续使用项目既有 Aptos / Segoe UI / PingFang 字体栈；中文层级、字重、行高和截断在目标区域与卡片区域均可读。
- Spacing and layout rhythm: 主体顶边、双面板比例、306px 右栏、24px 主栏间距和历史区垂直节奏均已对齐；响应式断点可正常折叠。
- Colors and visual tokens: 使用项目既有冷白背景、品牌蓝、浅边框、成功绿和危险红 token；没有引入与产品冲突的装饰色。
- Image quality and asset fidelity: 历史卡片呈现后端真实图片并保持裁切清晰；Logo 与图标沿用项目现有图标系统，没有占位图片。
- Copy and content: 上传限制、目标、接口、Token 状态、统计与 PicGo 指引均来自真实产品能力；没有展示虚构容量或明文密钥。

## Comparison history

1. 第一轮发现 P2：额外英文眉题使主体比参考图下移，且不属于参考内容。已移除页面和卡片英文眉题，并简化目标标题。
2. 第二轮发现 P2：标题容器仍保留 14px 空高，右侧信息栏略窄。已移除预留高度，并将右栏调整为 306px、主栏间距调整为 24px。
3. 最终并排检查没有剩余 P0、P1 或 P2。真实图片数量、全局 AppShell 顶栏/侧栏属于数据与既有产品差异，可接受。

## Primary interactions and console

- 在“存在目标但默认目标为空”的状态下点击上传，网络请求为 `POST /api/v1/image-bed/uploads?source_id=repro`，返回 200。
- 上传完成后历史数量与右侧统计同步刷新。
- 目标选择、设为默认、时间筛选、网格/列表切换、复制与删除控件均可操作。
- 最终干净浏览器会话控制台：0 errors，0 warnings。

## Findings

没有剩余可执行的 P0、P1 或 P2 设计问题。

## Follow-up polish

- P3：若未来 AppShell 恢复全局搜索、用户卡片和真实容量接口，可进一步贴近参考图的全局框架；本次不覆盖仓库已有设计决策。

final result: passed
