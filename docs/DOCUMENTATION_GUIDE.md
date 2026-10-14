# 文档维护规则

> 修订：2026-09-29 / R2。2.0 目标规范；未标为基线的内容不代表已实现。

2.0 删除无价值历史文档，不再保存旧 Roadmap 快照。

## 当前文档职责

```text
PRODUCT
    产品长期边界

STATUS
    现在做到哪里

ROADMAP
    2.0 做什么

IMPLEMENTATION_PLAN
    编码顺序

TASKS
    可执行清单

ARCHITECTURE / SECURITY / DATA_MODEL / API
    技术契约

features/
    用户可见业务行为

design/
    关键实现设计
```

## 删除规则

完成且已经被 current docs 吸收的：

- old roadmap；
- old acceptance；
- old migration explanation；
- archive；

可以删除。

Git 历史已经承担历史追溯职责。

## 更新触发

- schema -> DATA_MODEL
- endpoint -> API
- security -> SECURITY
- product semantics -> feature
- architecture -> ARCHITECTURE/design
- scope -> ROADMAP/TASKS

## 当前包的目标与事实

正文中未明确标为当前基线的 2.0 能力都是目标规范；STATUS 记录固定检查 SHA，TASKS 和 ACCEPTANCE 保持待执行。新决策不得只追加尾注却保留正文相反描述。

本次分工：PRODUCT 维护作用域与文件归属；static-assets 两篇分别管用户语义与实现；managed-namespace 管路径和 404；public-content-http 管 header/cache/CORS。代码完成时同步 API/schema/测试，不生成另一套含糊“私有图床”文档。
