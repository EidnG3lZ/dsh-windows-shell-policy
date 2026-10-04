# DSH Host 能力清单（本插件用到的）

本插件 host 侧消费的 DSH Host 服务与事件（2026-08 实测基线，已按 v0.1.0 多 shell 条目模型更新；基于 deepseek-harness 0.2.0 checkout）。

## 服务（inject）

| 服务 | 提供包 | 本插件用途 |
| --- | --- | --- |
| `tools` | `@deepseek-ai/dsh-tools` | 逐条目 `register(defineTool(...))` 注册 shell 工具并保存 disposer；`get(name)` 查名称是否已被内置工具 / 其它插件占用；`defineTool`、`TOOL_ABORTED` |
| `subprocess` | `@deepseek-ai/dsh-subprocess(-local)` | `spawn({argv, cwd, stdio, graceMs, signal, env})` 执行 shell；collect 模式输出截断 + spill；`terminate` |
| `systemPrompt` | `@deepseek-ai/dsh-system-prompt` | `section({name, order, text})` 注册引导文本（函数文本，按已注册条目动态生成）；`system-prompt/assemble` 事件裁剪工具面 |
| `webServer` | `@deepseek-ai/dsh-host-webserver` | `register({kind:'prefix', path, handler})` 提供面板读写 API（`/dsh-shell-policy/api`） |
| `settings` | `@deepseek-ai/dsh-settings(-file)` | `mutate(entryId, [{op:'set', path, value}])` 持久化 `shells` 条目数组（并兼容写 `preferred`/`bashPath`）；`configure({auto})` 声明自动表单 |
| `sandbox` | `@deepseek-ai/dsh-sandbox` | 非 `fullAccess` 条目：`confine(argv, policy)`（0.2.0 起异步）；`ESCALATION_TARGETS`、`approveEscalation`、`sandboxDenialMarker`、`validateEscalationArgs` |
| `sandboxPolicy` | `@deepseek-ai/dsh-sandbox-policy` | `resolve({session})` → 每次调用的 standing policy（mode + workspaceRoot） |
| `jobs` | `@deepseek-ai/dsh-jobs` | `run_in_background` 时 `start({kind:'bash', label, owner, run})`（0.2.0 起 `owner` 为 SessionId） |
| `approval` | DSH 审批服务 | `approveEscalation` 的 approver（仅非 `fullAccess` 条目的升级路径使用） |
| `loader` | cordis loader | `entries()` 反查自身 profile entry id（settings namespace = entry id） |

## 事件

| 事件 | 模式 | 本插件用途 |
| --- | --- | --- |
| `system-prompt/assemble` | waterfall | `await next()` 后：只要有条目注册成功，就隐藏 DSH 内置 `bash`/`pwsh`（名字未被本插件条目占用的那些）；全部条目停用时不动 |

## 关键机制

- **一个条目 = 一个工具**：`ctx.tools.register` 返回 disposer，按条目 id 存在 Map 里；条目集合 / 顺序 / 内容变化时全量重建（先 `disposeAll` 再逐条目重注册）
- **同名约束**：同 scope 重名报错；DSH 内置 `pwsh`（Windows）与保留名 `run_code` 不能被本插件占用——冲突条目注册失败并写进该条目的 `EntryStatus.error`，不影响其它条目
- **工具 schema 按请求刷新**：注册 / 注销后下一次请求的工具面变化（当前请求不变）
- **系统提示按会话快照**：sections 在会话开始时注入，新会话才看到新 section（`shell-policy` 已改为函数文本，但可见性仍按会话）
- **settings allowlist**：apiproxy 的 `WEB_SETTINGS_NAMESPACES` 决定哪些 namespace 可被 client 端 RPC 读写；本插件 entry 不在其中，面板读写全部走自带 HTTP API，host 端再经 `settings` 服务落盘
- **scope 事件过滤**：`scopeTarget` 的 filter 对无 scope tag 的 listener 放行（host 层 listener 全局接收 agent scope 事件）
- **fullAccess 与沙箱审批**：`policy.mode !== 'danger-full-access'` 才调用 `confine`；审批只发生在 `sandbox_permissions` 升级路径，因此 fullAccess 条目既不会被沙箱拒绝也不会弹审批
