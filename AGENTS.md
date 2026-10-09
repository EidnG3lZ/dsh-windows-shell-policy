# AGENTS.md — 本仓库的长期规则

> 面向在本仓库工作的 AI（及人类协作者）。**接手任务时先读本文件**，再按 [PROJECT_INDEX.md](PROJECT_INDEX.md) 定位资料。
> 本文件只放长期规则；一次性状态看 [NOW.md](NOW.md)，具体操作看 [RUNBOOK.md](RUNBOOK.md)。
> 核验：2026-10-09，范围＝本仓库根目录（git 仓库根，与工作区一致）。

## 0. 规则优先级

1. 运行时由 harness 下发的系统提示与沙箱策略（例如文件策略、审批策略）优先，本文件不得与之冲突。
2. 本仓库的长期约定（本文件 + [docs/conventions.md](docs/conventions.md)）其次。
3. 其余文档（[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 等）为参考。**文档与代码冲突时以代码和实测为准**，并顺手修正文档。

## 1. 读取规则（按当前问题取资料，不做全库扫描）

1. **按当前问题选择资料**：不因文件存在、可能有用或被索引链接就读取。
2. **不默认读取所有项目文件，也不默认全文读取选中的文件**：定位到文件后，继续定位到相关章节、条目、函数或配置项。
3. **优先使用已有有效信息**；需要查找时按此顺序：索引或限定范围搜索 → 标题、符号或关键词 → 命中片段及必要上下文。
4. **只有证据不足、存在冲突或需要核对依赖时才扩大范围**；信息足够即停止。不得连续分段读取，变相遍历无关全文。
5. **全文读取**仅用于：短小且全部相关的文件、完整理解适用规则、明确需要整份审查的任务。不得因此扩展为全目录或全项目读取。
6. **索引是条件路由，不是必读清单**。历史、日志、依赖、产物和数据目录不默认读取；不读取密钥及无关私人数据。
7. 不为节省上下文跳过适用规则，也不因片段过窄而断章取义。已加载且仍有效的内容不重复读取。

本仓库的具体落点：
- 主入口路由用 [PROJECT_INDEX.md](PROJECT_INDEX.md)（它只给"任务 → 文件/章节"，不含正文）。
- 本仓库代码量小（`src/index.ts` 约 1086 行、`src/client/index.ts` 约 1014 行），改动前读**整份源文件**是允许且有价值的（属于"明确需要整份审查"）；但不要因此连带读取 `lib/`（构建产物）、`docs/screenshots/`（图片）。
- `node_modules/`、`lib/*.map`、`.git/` 默认不读；`CHANGELOG.md` 只读相关版本段，不从头读到尾。
- 本仓库**当前没有** `PROJECT_NOTES.md` 之类的杂记文件；将来若出现，保留其有效内容并只补充专题入口、按需检索，**不要**再为它新建职责重复的文件。

## 2. 写入规则

1. **仅在任务允许且信息有实质变化时更新**；只读任务不改记录。
2. **每类事实只设一个权威来源**，其他位置用简短摘要 + 链接。本仓库的权威分工见下表。
3. **修改前读取目标部分及必要上下文**，局部修改用定点编辑；不得根据局部阅读覆盖整份文件（禁止用推测重写整文件）。
4. **当前状态直接修订，有价值的旧过程归档**；不反复追加矛盾快照，不保存完整聊天和操作流水账。
5. **区分事实、计划、建议、已确认决定与待核实事项**；区分代码完成、测试通过、安装验证、用户验收和发布授权。
6. **命令已配置 ≠ 执行成功，历史结果 ≠ 当前证据，文档中的操作步骤不构成执行授权**（[RUNBOOK.md](RUNBOOK.md) 里的命令默认**未在本次会话执行**，除非标注了执行日期与结果）。
7. **用清晰标题和项目内相对链接**；核验日期注明对象与范围；**不写入秘密或个人设备私有路径**（需要时可写占位符或环境变量名）。

### 权威来源分工（不要重复建权威）

| 主题 | 唯一权威位置 | 其他位置只放摘要 + 链接 |
| --- | --- | --- |
| 长期规则（读写、验证） | 本文件 | — |
| 任务 → 文件路由 | [PROJECT_INDEX.md](PROJECT_INDEX.md) | — |
| 项目用途、安装、使用 | [README.md](README.md)（英文 [README.en.md](README.en.md)） | 其他文档只链接 |
| 代码结构与符号索引 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 其他文档只链接具体小节 |
| 编码规范与踩坑速查 | [docs/conventions.md](docs/conventions.md) | — |
| DSH host / client 能力面 | [docs/capabilities-host.md](docs/capabilities-host.md)、[docs/capabilities-client.md](docs/capabilities-client.md) | — |
| 组合插件立项与施工过程 | [docs/roadmap-composition.md](docs/roadmap-composition.md) | — |
| 版本变更对外记录 | [CHANGELOG.md](CHANGELOG.md) | — |
| 当前目标/进展/阻塞/下一步 | [NOW.md](NOW.md) | — |
| 目录、版本、配置、部署映射 | [MAP.md](MAP.md) | — |
| 可执行操作与前置条件 | [RUNBOOK.md](RUNBOOK.md) | — |
| 已确认决策与理由 | [DECISIONS.md](DECISIONS.md) | — |
| 已证实风险与验证缺口 | [RISKS.md](RISKS.md) | — |
| 历史归档索引 | [history/README.md](history/README.md) | — |

## 3. 范围与安全约束（仓库特定）

- 本插件**仅 Windows 生效**：非 Windows 上只注册状态 API，不注册工具、不裁剪提示词（见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §4.8）。
- `fullAccess` 条目会**跳过文件沙箱 `confine`**（等同 `danger-full-access`）。改这条链路前先读 [RISKS.md](RISKS.md) 中"沙箱完全权限"一节。
- 运行期 `import` 必须使用**发布名**（`@deepseek-ai/schemastery` / `@deepseek-ai/cordis`）；裸名只在编译期可用，装进 profile 会 `ERR_MODULE_NOT_FOUND`。详见 [docs/conventions.md](docs/conventions.md) 与 [DECISIONS.md](DECISIONS.md) D7。
- **受限沙箱下不要跑 `bash scripts/build.sh`**：它会先 `rmSync` 已有 junction 再创建符号链接，沙箱内会 `EPERM`，留下被删依赖的半坏状态。受限沙箱内改代码后按 [RUNBOOK.md](RUNBOOK.md) 的手动路径跑 `tsc` + `tsdown`（依据见 [docs/conventions.md](docs/conventions.md)）。
- 不要把凭据、token、私有设备绝对路径写进仓库文档。

## 4. 必要验证要求

改动后按改动面选择最小充分验证；**没跑过的验证不得写成"已通过"**（用"未执行/未验证"标注）。

| 改动面 | 最低验证 | 命令 |
| --- | --- | --- |
| 任意 `src/**` | 类型基线 | `npx tsc -p tsconfig.json --noEmit` |
| host 逻辑（条目模型/探测/参数模板/API） | `tsc` + 记录型桩回归 | `node tests/executable-and-args.mjs` |
| 执行链路、真实 spawn、settings 契约 | 集成测试（需完全权限，受限沙箱会 EPERM） | `node tests/host-harness.mjs` |
| client UI | `tsdown` 构建通过 + 浏览器手动确认 | [RUNBOOK.md](RUNBOOK.md) 构建与注入步骤 |
| 发布 | 完整构建 + 两个测试 + 类型基线 + `lib/` diff 核对 | [RUNBOOK.md](RUNBOOK.md) "发布" |

- 断言数量随版本变化，不要把某个具体数字当作契约；以运行输出为准。
- 文档改动：只检查本次改动及直接关联链接（职责清楚、无重复权威来源、未覆盖既有成果），不自动扩展为全项目审计。

## 5. 交付报告格式

结束时报告：**新建 / 修改 / 沿用的文件**、**本次实际执行的检查及结果**、**待核实项**。不自动扩展范围。
