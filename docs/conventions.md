# 插件编写规范与常见失败速查

本插件开发过程中踩过的坑与沉淀的规范（2026-08 至 2026-10 实测）。

## DSH 0.2.0 架构变更（2026-10 适配）

配置系统整体重构，旧 API 全部失效：

- **`installSettingsSection` / `settings.installSection` 均已移除**：插件不再注册 settings namespace。配置由 **Plugin Config schema 自动投影**成表单（`SettingsForms`，`settings.describe()` 逐个 entry 生成 descriptor）
- **live 配置字段必须标 `.volatile()`**：`volatileForm(schema)` 只投影带 `meta.volatile` 的字段。未标记 → 设置页不显示该插件、`settings.mutate` 写入报 `Config field "x" is not volatile`
- **配置 namespace = profile entry id**（不再是插件自定义名字）：`settings.mutate(entryId, ops)` / `settings.update(entryId, patch)`
- **volatile 读取**：字段值是 `Volatile<T>` 引用，读时解包（`value.get()`；结构检测即可，避免 cosmokit 包名不匹配）
- **settings.yaml 废弃**：启动时自动迁移到 profile 的 entry config，随后重命名为 `.imported`
- **`settings.configure({ auto })`** 控制是否自动生成配置页（默认 true；`auto: false` 表示插件自己提供 UI）
- **插件管理页（ui-plugin-manager，新包）**：官方插件配置入口走 `plugins.item`；**第三方 bundle 自己的配置页要注册 `plugins.bundle.config`（keyed，key = bundle 包名）**，渲染在插件详情页内（`view: 'page'`）；行级配置走 `plugins.row.config`（key = `<包名>#<rowId>`）
- **`sandbox.confine` 变异步**（返回 `Promise<ConfinedArgv>`，需 await）
- **`jobs.start` 的 `owner` 从 `Agent` 实例改为 `SessionId`**（传 `exec.agent.id`）
- 官方参考实现：`packages/experimental/client-ui-voice-input`（bundle 配置页注册的最佳示例）

## 构建

- `scripts/build.sh` 探测 `DSH_CHECKOUT`（env → 常见路径），junction link 编译依赖（cordis/schemastery/dsh-tools/dsh-subprocess/dsh-settings 等）后 tsc 编译 host
- client 用 tsdown 编译为 `lib/client.js`（`window.__ModuleLoader__.load` 注册）；tsdown 从 checkout 的 `node_modules/tsdown/dist/run.mjs` 直接跑（`.bin/tsdown` shell shim 在 git-bash 下有 MSYS 路径转换问题）
- tsconfig 必须 `exclude: ["src/client"]`——host tsc 编译 client 会因 react 等浏览器依赖报 TS2307
- **发布前手动构建 + `npm publish --ignore-scripts`**：`prepublishOnly` 里的 `bash scripts/build.sh` 在 cmd.exe 环境下因 bash 不在 PATH 而失败（已在 package.json 移除该钩子）

## Host 侧

- 动态注册/注销工具：`ctx.tools.register(defineTool(...))` 返回 disposer，切换时调用注销；插件卸载时也要注销（`ctx.effect` 清理）
- 工具重名报错：同 scope 内 `tool "x" is already registered`；host 层与 preset 层是不同 scope，可同名共存
- `defineTool` 的 output.schema 嵌套 object 必须带 `additionalProperties: false`，否则类型推断为 never
- `ctx.webServer` 等 host 服务类型需自行声明（`AppContext` 交叉类型），未 import 对应包时 cordis Context 类型合并不生效
- settings 注册（0.1.x 旧法，0.2.0 已移除）：`installSettingsSection(ctx, ns, schema, entry, hooks)`；0.2.0 见上文「DSH 0.2.0 架构变更」
- settings 的 client 端 RPC 有 apiproxy allowlist（`WEB_SETTINGS_NAMESPACES`），插件自行注册的 namespace 不会被 serve 给浏览器——client 卡片读写需走插件自己的 host API，host 端仍经 settings 服务持久化
- `system-prompt/assemble` 是 waterfall：必须 `await next()` 再裁剪；host 层无 scope tag 的 listener 全局接收所有 scope 的事件（`scopeTarget` 的 filter 对无 tag listener 放行）
- 系统提示文本（sections）按会话快照注入，工具列表（tools）按请求刷新——引导文本新会话生效，工具面裁剪当前会话即生效

## Client 侧

- `apply` 用 `ctx.slots` 必须 `export const inject = ['slots']`（服务注入声明），否则报 `cannot get property 'slots' without inject`
- `ctx.slots.register` 必须带 `name` 字段（= slot 名），缺 name 报 `slot undefined is not declared`
- slot 组件是 React 组件（`SlotComponent<P> = (props: P) => ReactNode`）；用 `React.createElement` 手写可避免 tsx/jsx 构建配置
- **0.2.0 配置页注册**：`plugins.bundle.config`（keyed，key = bundle 包名，`view: 'page'` 渲染表单、`view: 'summary'` 一行摘要）；旧 `settings.plugin.item` 槽位已删除，但仍保留注册（`slots.inject` 对未声明槽位不执行回调，无副作用，兼容 0.1.x）
- 折叠卡片模式（官方 PluginCard 同构）：头部 button（aria-expanded）+ chevron 旋转 + 展开 body + footer 保存/放弃；dirty 时头部「未保存」标记；样式用官方 CSS 变量（`--dsw-alias-*`）
- **React inline style 不要用 `border` 简写**：CSS 变量在简写里会被拆解丢失（border-color 回落 `currentColor` 黑色），必须用 `borderWidth`/`borderStyle`/`borderColor` 长写
- 终端卡片展示：工具实现 `presentCall`（card:'terminal'，title=命令）+ `presentResult`（解析输出末尾 `[exit code: N]` 标记拆出 exit pill）；exit 标记必须在输出**末尾**（`parseExitStatus` 锚定末尾），exit 0 不报标记

## 注入器

- `dev_inject_plugin`：junction + `loader.create`，host 层装配，免重启；client 模块经 client-modules 增量补扫注册，浏览器刷新后拉取新 bundle
- `dev_reload_package`：清缓存 + 重建 fiber，失败回滚保留旧代
- `dev_uninject_plugin`：卸 entry + 清 registry + 删 junction + patch disabled 条目，卸载即净
- 注入是运行时的：重启 web 后需重新注入；持久化用 `dev_install_package`（写 profile bundles）或正式安装（`dsh plugin add` + bundle patch）

## 发布

- bundle patch 装配：包内 `cordis.patch.yml`（insert 插件行）+ package.json `dsh.bundle.patch` 声明，`dsh plugin add github:...` 一条命令正式安装
- npm 发布：`files` 清单（lib + cordis.patch.yml + LICENSE）、去 `private`；**发布前手动构建**（`prepublishOnly` 里的 bash 在 cmd 下失败，已移除）
- **npm staged publishing**：新版 npm 的发布可能需要暂存/批准，`npm publish` 返回成功但 registry 未立即出现；此时重复发布会报 `E409 Cannot publish over previously staged version`。等几分钟版本会落地，或在 npm 网站批准；**换一个补丁版本号也是最快的绕过方式**
- Release 资产：ZIP（lib + cordis.patch.yml + package.json + LICENSE），用户解压后 `dsh plugin add link:<目录>`

## 桌面端与 web 端

- **两套独立实例**：桌面应用（Electron，`AppData\Local\Programs\DeepSeek Harness`）用 `~/.dsh/profiles/desktop`；`dsh web` 服务用 `~/.dsh/profiles/web`——各自的 bundles/插件/会话，互不相通
- 插件要两端都生效，**两边的 profile 都要装配**（package.json 的 dependencies + bundles + node_modules junction）
- 桌面 GUI 的静态资源与首页需要认证（`dsh web authentication required`），未带 token 的 curl 探测会得到 404/认证提示，**不能据此判断 client bundle 缺失**
- 桌面端验证 client 的正确方式：在应用内打开「插件管理 → 已安装 → 点击插件 → 详情页」查看
