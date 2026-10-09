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
- **volatile-only 配置更新不会重挂插件**：`settings.mutate` 只改 volatile 字段时，loader 走 `vendor/loader/src/config/entry.ts` 的 `_commitVolatile()`——原地 `updateVolatile` 写进已有引用并发 `loader/volatile-update`，**`apply` 不会再次执行**。依赖配置的插件必须监听该事件（或在自己的读路径上按需重算），否则保存后面板/工具面停在旧快照（本插件 v0.1.0 的「保存后修改消失」即此因）
- **运行期依赖必须写发布名**：`@deepseek-ai/schemastery` / `@deepseek-ai/cordis`。`schemastery` / `cordis` 只是 `build.sh` 建的编译期本地别名（`vendor/*` 的真实包名是作用域名）；装进 profile 后 Node 从 `~/.dsh/profiles/node_modules` 解析真实包名，裸名会 `ERR_MODULE_NOT_FOUND` → 启动打印 `dsh-windows-shell-policy: failed to import`、配置页不出现（v0.1.0 的真实故障，v0.1.1 修复）。`peerDependencies` 同样用发布名

## Host 侧

- 动态注册/注销工具：`ctx.tools.register(defineTool(...))` 返回 disposer，切换时调用注销；插件卸载时也要注销（`ctx.effect` 清理）
- 工具重名报错：同 scope 内 `tool "x" is already registered`；host 层与 preset 层是不同 scope，可同名共存
- `defineTool` 的 output.schema 嵌套 object 必须带 `additionalProperties: false`，否则类型推断为 never
- `ctx.webServer` 等 host 服务类型需自行声明（`AppContext` 交叉类型），未 import 对应包时 cordis Context 类型合并不生效
- settings 注册（0.1.x 旧法，0.2.0 已移除）：`installSettingsSection(ctx, ns, schema, entry, hooks)`；0.2.0 见上文「DSH 0.2.0 架构变更」
- settings 的 client 端 RPC 有 apiproxy allowlist（`WEB_SETTINGS_NAMESPACES`），插件自行注册的 namespace 不会被 serve 给浏览器——client 卡片读写需走插件自己的 host API，host 端仍经 settings 服务持久化
- `system-prompt/assemble` 是 waterfall：必须 `await next()` 再裁剪；host 层无 scope tag 的 listener 全局接收所有 scope 的事件（`scopeTarget` 的 filter 对无 tag listener 放行）
- 系统提示文本（sections）按会话快照注入，工具列表（tools）按请求刷新——引导文本新会话生效，工具面裁剪当前会话即生效
- **argv 模板化**：命令是作为 argv 最后一个元素传的，所以条目级「启动参数」（`args`）做成**模板**而不是「追加参数」——`{command}` 占位实际命令，默认模板见 `argTemplate()`（bash `-c {command}`、PowerShell `-NoLogo -NoProfile -NonInteractive -Command {command}`）。这样连 `-c` / `-Command` 都能换，host 也不必去猜哪个开关是「取命令」的那个。**模板不写 `{command}` 会让命令根本传不进 shell**，保存校验因此强制它（`argTemplateProblem()`）。
- **host 与 client 不能共享解析代码**：`path` 值域与启动参数模板的解析在 host（`isBareExecutableName` / `executablePathProblem` / `argTemplateProblem` / `parseArgs`）与 client（保存前预校验）各有一份，改规则要同步；client 还要容忍旧 host 缺失新字段（`toDraft()` 里 `?? ''` 兜底，否则 React 渲染直接抛 `Cannot read properties of undefined`）
- **条目字段分两用**：`name` / `description` / `args` / `path` 决定模型看到的工具面与执行；`label`（显示名）只用于面板显示与错误文案（`entryLabel()`，留空回落工具名）。新增字段先归类，别把给人看的显示名混进工具名或工具提示词
- **受限沙箱下写测试**：需要真实 spawn 的用例走管道会 `EPERM`（`tests/host-harness.mjs`，只能跑在完全权限下）；不 spawn 的逻辑用「记录型 spawn 桩」测（`tests/executable-and-args.mjs`，沙箱内可跑）
- **受限沙箱下的 shell 与 junction（2026-10-09 实测）**：MSYS/git-bash 在沙箱里**连启动都失败**（`C:\Program Files\Git\bin\bash.exe` → `*** fatal error - couldn't create signal pipe, Win32 error 5`）；PATH 里的 `bash` 其实是原生 Windows applet shell（自报 `bash is a builtin applet`，不认 `/e/...`，要写 `E:/...`），`niu`（Niubash 1.3.3，`D:\Scoop\shims\niu.exe`）是功能足够的 bash 替代，能跑 `node`/`tsc`/`tsdown`。但 `fs.symlinkSync(..., 'junction')` 的 `EPERM` **与 shell 无关**：沙箱只拒绝 **target 在工作区外**的符号链接/目录联接，target 在工作区内则成功（三种驱动实测一致）。`scripts/build.sh` 的 junction 全部指向 checkout，所以必然第一步失败、并已把旧 junction `rmSync` 掉——**受限沙箱内改代码后手动跑 `tsc -p tsconfig.json` + `tsdown`（依赖已建好的 junction），别跑 build.sh**；要在受限沙箱内跑通 build.sh，只能给完全文件权限或把 checkout 镜像进工作区。

## Client 侧

- `apply` 用 `ctx.slots` 必须 `export const inject = ['slots']`（服务注入声明），否则报 `cannot get property 'slots' without inject`
- `ctx.slots.register` 必须带 `name` 字段（= slot 名），缺 name 报 `slot undefined is not declared`
- slot 组件是 React 组件（`SlotComponent<P> = (props: P) => ReactNode`）；用 `React.createElement` 手写可避免 tsx/jsx 构建配置
- **0.2.0 配置页注册**：`plugins.bundle.config`（keyed，key = bundle 包名，`view: 'page'` 渲染表单、`view: 'summary'` 一行摘要）；旧 `settings.plugin.item` 槽位已删除，但仍保留注册（`slots.inject` 对未声明槽位不执行回调，无副作用，兼容 0.1.x）
- 折叠卡片模式（官方 PluginCard 同构）：头部 button（aria-expanded）+ chevron 旋转 + 展开 body + footer 保存/放弃；dirty 时头部「未保存」标记；样式用官方 CSS 变量（`--dsw-alias-*`）
- **React inline style 不要用 `border` 简写**：CSS 变量在简写里会被拆解丢失（border-color 回落 `currentColor` 黑色），必须用 `borderWidth`/`borderStyle`/`borderColor` 长写
- 终端卡片展示：工具实现 `presentCall`（card:'terminal'，title=命令）+ `presentResult`（解析输出末尾 `[exit code: N]` 标记拆出 exit pill）；exit 标记必须在输出**末尾**（`parseExitStatus` 锚定末尾），exit 0 不报标记
- **面板内切换视图要保持滚动位置**：列表 ⇄ 单条目配置界面切换会改变面板高度，浏览器会把 `scrollTop` 夹到新上限（页面越长丢得越多）。做法：切走前记下「最近的可滚动祖先 + scrollTop」，再用离开时的高度给新视图 `minHeight`（`boxSizing:'border-box'`）兜底——页面高度不缩水就不会夹取——最后在 `useLayoutEffect`（DOM 更新后、绘制前）写回；进入子界面时把其顶部对齐滚动视口。滚动容器要用祖先查找得到，不要写死 `window`（宿主的滚动容器由 DSH 决定）

## 默认提示词只有一份

- 条目「工具提示词」的默认模板由 host 的 `defaultToolDescription()` 生成，经 `POST /defaults` 暴露给面板（新建条目预填 + 「重置为默认」）；**不要在 client 里再抄一份模板**，两边一定会漂移。新增影响模板的字段（如 `args`）时，改 host 一处即可

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
