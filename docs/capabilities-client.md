# DSH Client 能力清单（本插件用到的）

本插件 client 侧消费的 DSH Client 槽位与服务（2026-08 实测基线，已按 v0.1.0 多 shell 条目模型更新；基于 deepseek-harness 0.2.0 checkout）。

## 槽位（slots）

| 槽位 | 声明方 | 本插件用途 |
| --- | --- | --- |
| `plugins.bundle.config` | `@deepseek-ai/dsh-client-ui-plugin-manager` | 0.2.0 正式入口：注册本 bundle 的「Shell 工具」配置面板（keyed slot，`key` = 包名，渲染在插件管理页的本插件详情页内，`view: 'page'`） |
| `settings.plugin.item` | `@deepseek-ai/dsh-client-ui-settings-plugins` | 0.1.x 兼容：注册「Shell 工具」折叠卡片（0.2.0 已移除该槽位，`slots.inject` 对未声明槽位不执行回调，无副作用） |

## 服务（inject）

| 服务 | 提供包 | 本插件用途 |
| --- | --- | --- |
| `slots` | `@deepseek-ai/dsh-client-ui-slots` | `inject(name, factory)` + `register(options, component)` 注册面板 / 卡片 |
| `remote` | `@deepseek-ai/dsh-client-runtime/client` | `$on('settings/document-updated', cb)` 监听 settings 文档变化，外部写入后面板自动刷新 |

## 关键机制

- **Slot 组件协议**：`SlotComponent<P> = (props: P) => ReactNode`——React 组件；用 `React.createElement` 手写可避免 tsx 构建配置
- **注册必带 `name`**：`register` 的 options 必须含 `name`（= slot 名），缺 name 报 `slot undefined is not declared`
- **inject 声明**：`apply` 用 `ctx.slots` / `ctx.remote` 必须 `export const inject = ['slots', 'remote']`
- **keyed slot 必带 `key`**：`plugins.bundle.config` 以 bundle 包名为 key；旧的 `settings.plugin.item` 也带 `id`/`key`/`order`
- **条目式表单模式**：折叠条目行（显示名 / 启用开关 / 「默认」单选 / 「配置」入口）⇄ 单条目配置界面（显示名 / 工具名 / 路径 + 探测 / 工具提示词 textarea / 沙箱完全权限 checkbox / 启动参数 / 删除）+ footer（添加 shell / 放弃 / 保存）；staged 编辑（`draft === null` 表示未改动）；样式用官方 CSS 变量（`--dsw-alias-*`）与 border 长写
- **客户端预校验**：保存前检查 `run_code` 保留名、启用条目间工具名重复（文案用对方的显示名标识）、路径需绝对或纯文件名、启动参数需含 `{command}` 且引号闭合；任一不通过则禁用保存
- **终端卡片**：工具实现 `presentCall`/`presentResult` 返回 `card:'terminal'` 视图，对话页渲染 TerminalBlock（可点击查看命令 / cwd / 输出 / exit 状态）
- **settingsScope 不可用**：apiproxy allowlist 限制，本插件 entry 不被 serve——面板通过 `fetch` 读写本插件 host API（`/dsh-shell-policy/api/status|shells|detect|defaults`）
- **client bundle 加载**：tsdown 产物 `lib/client.js` 经 `window.__ModuleLoader__.load` 注册；注入后浏览器刷新拉取新 rev
