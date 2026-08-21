# DSH Client 能力清单（本插件用到的）

本插件 client 侧消费的 DSH Client 槽位与服务（2026-08 实测，基于 deepseek-harness checkout）。

## 槽位（slots）

| 槽位 | 声明方 | 本插件用途 |
| --- | --- | --- |
| `settings.plugin.item` | `@deepseek-ai/dsh-client-ui-settings-plugins` | 注册「默认 Shell」折叠卡片（list slot，需 `id`/`order`） |

## 服务（inject）

| 服务 | 提供包 | 本插件用途 |
| --- | --- | --- |
| `slots` | `@deepseek-ai/dsh-client-ui-slots` | `inject(name, factory)` + `register(options, component)` 注册卡片 |

## 关键机制

- **Slot 组件协议**：`SlotComponent<P> = (props: P) => ReactNode`——React 组件；用 `React.createElement` 手写可避免 tsx 构建配置
- **注册必带 `name`**：`register` 的 options 必须含 `name`（= slot 名），缺 name 报 `slot undefined is not declared`
- **inject 声明**：`apply` 用 `ctx.slots` 必须 `export const inject = ['slots']`
- **折叠卡片模式**（官方 PluginCard 同构）：头部 button（aria-expanded）+ chevron 旋转 + 展开 body + footer 保存/放弃；dirty 时头部「未保存」标记；样式用官方 CSS 变量（`--dsw-alias-*`）
- **终端卡片**：工具实现 `presentCall`/`presentResult` 返回 `card:'terminal'` 视图，对话页渲染 TerminalBlock（可点击查看命令/cwd/输出/exit 状态）
- **settingsScope 不可用**：apiproxy allowlist 限制，插件自行注册的 settings namespace 不被 serve——卡片读写走插件自己的 host API（fetch）
- **client bundle 加载**：tsdown 产物 `lib/client.js` 经 `window.__ModuleLoader__.load` 注册；注入后浏览器刷新拉取新 rev
