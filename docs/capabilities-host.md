# DSH Host 能力清单（本插件用到的）

本插件 host 侧消费的 DSH Host 服务与事件（2026-08 实测，基于 deepseek-harness checkout）。

## 服务（inject）

| 服务 | 提供包 | 本插件用途 |
| --- | --- | --- |
| `tools` | `@deepseek-ai/dsh-tools` | `register(defineTool(...))` 动态注册 bash 工具，返回 disposer 切换时注销 |
| `subprocess` | `@deepseek-ai/dsh-subprocess-local` | `spawn({argv, cwd, stdio, graceMs, signal, env})` 执行 git-bash；collect 模式输出截断 + spill |
| `systemPrompt` | `@deepseek-ai/dsh-system-prompt` | `section({name, order, text})` 注册引导文本；`system-prompt/assemble` 事件裁剪工具面 |
| `webServer` | `@deepseek-ai/dsh-host-webserver` | `register({kind:'prefix', path, handler})` 提供卡片读写 API |
| `settings` | `@deepseek-ai/dsh-settings-file` | `installSettingsSection` 注册 `shell-policy` section；`mutate(ns, ops)` 持久化 preferred |

## 事件

| 事件 | 模式 | 本插件用途 |
| --- | --- | --- |
| `system-prompt/assemble` | waterfall | `await next()` 后按策略过滤 `pwsh`/`bash` 工具 |

## 关键机制

- **工具注册**：`ctx.tools.register` 返回 disposer；同 scope 重名报错；host 层与 preset 层不同 scope 可同名
- **工具 schema 按请求刷新**：注册/注销后下一次请求的工具面变化（当前请求不变）
- **系统提示按会话快照**：sections 在会话开始时注入，新会话才看到新 section
- **settings allowlist**：apiproxy 的 `WEB_SETTINGS_NAMESPACES` 决定哪些 namespace 可被 client 端 RPC 读写；插件自行注册的 namespace 不在其中（官方 deferred work）
- **scope 事件过滤**：`scopeTarget` 的 filter 对无 scope tag 的 listener 放行（host 层 listener 全局接收 agent scope 事件）
