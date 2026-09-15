# Docs 目录整理说明

本次整理以 `1.0.0` 稳定发布为边界，将“当前事实”“未来规划”和“历史开发过程”分开。

## 目录变化

### 保持在根目录

这些文档描述当前长期有效事实，继续保留原入口：

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `SECURITY.md`
- `DATA_MODEL.md`
- `API.md`
- `DESIGN_SYSTEM.md`
- `DEVELOPMENT.md`
- `RELEASING.md`
- `AGENT_GUIDE.md`
- `DOCUMENTATION_GUIDE.md`
- `ROADMAP.md`

### 保持原目录

现有功能规范继续放在：

```text
features/
```

现有设计验收继续放在：

```text
design-qa/
```

### 新增 `roadmap/`

用于 1.x 各 Minor Version 的独立 Scope：

```text
roadmap/
├── README.md
├── 1.1.0-file-experience.md
├── 1.2.0-preview-sharing.md
├── 1.3.0-operation-center.md
├── 1.4.0-backup-recovery.md
└── 1.5.0-compatibility.md
```

### 新增 `design/`

用于尚未实现或正在实现的功能设计：

```text
design/
├── upload-task-system.md
├── folder-upload.md
├── preview-resolver.md
├── share-preview-system.md
├── operation-dashboard.md
├── backup-format.md
├── restore-workflow.md
└── compatibility-testing.md
```

### 新增 `archive/1.0/`

原来的 `ROADMAP.md` 主要描述 1.0 V1/V2 阶段。该历史内容现在放入：

```text
archive/1.0/ROADMAP.md
archive/1.0/ACCEPTANCE.md
```

根 `ROADMAP.md` 改为当前 1.x 总路线。

根 `ACCEPTANCE.md` 仍保留一个兼容入口，避免仓库根 README 和旧链接失效。

## 为什么这样整理

整理后文档职责变成：

```text
PRODUCT       → 产品永远是什么 / 不是什么
ARCHITECTURE  → 系统现在怎么工作
features      → 已实现功能现在是什么语义

ROADMAP       → 接下来往哪里走
roadmap       → 某个版本交付什么
design        → 某个未来 Feature 准备怎么做

archive       → 当时怎么开发到这里
```

这样可以避免 Agent 在后续开发中把已经完成的 1.0 V1/V2 计划继续当成当前 Roadmap。
