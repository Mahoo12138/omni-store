# 文档维护规范

OmniStore 的文档是长期开发记忆，不是发布后无人维护的说明书。

## 1. 文档类型

### 当前事实

长期放在 `docs/` 根和 `features/`：

- `PRODUCT.md`
- `ARCHITECTURE.md`
- `SECURITY.md`
- `DATA_MODEL.md`
- `API.md`
- `DESIGN_SYSTEM.md`
- `DEVELOPMENT.md`
- `RELEASING.md`
- `AGENT_GUIDE.md`
- `features/*.md`

这些文档应描述“现在系统是什么”。

### 版本计划

放在：

```text
docs/roadmap/
```

只描述某版本准备交付什么，以及验收边界。

### 功能设计

放在：

```text
docs/design/
```

描述尚未实现或正在实现的具体设计。

设计完成上线后，可以继续保留其中仍有解释价值的架构部分；过期计划必须标记或归档。

### 历史

放在：

```text
docs/archive/
```

历史路线、RC checklist、已经结束的阶段状态不能继续占据当前路线入口。

## 2. 事实优先级

1. migration / code / tests；
2. 已发布行为；
3. current docs；
4. accepted product constraints；
5. roadmap / design；
6. archive。

## 3. 更新触发

| 改动 | 必须检查 |
| --- | --- |
| Database | migration + DATA_MODEL |
| REST API | API |
| Path/Auth/Policy | SECURITY |
| File semantics | features/private-drive |
| WebDAV | features/webdav |
| S3 | features/s3 |
| Image Bed | features/image-bed |
| Share | features/sharing |
| UI foundation | DESIGN_SYSTEM |
| Version scope | ROADMAP + roadmap/version |
| Build/release | DEVELOPMENT + RELEASING |

## 4. Roadmap 规则

Roadmap 不写具体实现代码。

每个版本至少包含：

- Goal；
- Scope；
- Out of Scope；
- Dependency；
- Acceptance；
- Status。

不要用“以后可能做”弱化永久 Non-goals；永久边界统一在 `PRODUCT.md`。

## 5. Design 规则

Design 文档回答：

- Problem；
- Goals；
- Non-goals；
- User flow；
- API/Model；
- State machine；
- Security / consistency；
- Failure handling；
- Acceptance。

尚未实现的 Design 顶部必须明确标注“Planned / Draft”，避免 Agent 当作现状。

## 6. 归档

版本稳定后：

- 当前行为继续留在 feature/current docs；
- 版本开发过程、阶段清单、旧 scope 进入 `archive/<version>/`；
- 根 `ROADMAP.md` 只保留未来路线和当前版本。
