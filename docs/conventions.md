# 插件编写规范与常见失败速查

本插件开发过程中踩过的坑与沉淀的规范（2026-08 实测）。

## 构建

- `scripts/build.sh` 探测 `DSH_CHECKOUT`（env → 常见路径），junction link 编译依赖（cordis/schemastery/dsh-tools/dsh-subprocess/dsh-settings 等）后 tsc 编译 host
- client 用 tsdown 编译为 `lib/client.js`（`window.__ModuleLoader__.load` 注册）；tsdown 从 checkout 的 `node_modules/tsdown/dist/run.mjs` 直接跑（`.bin/tsdown` shell shim 在 git-bash 下有 MSYS 路径转换问题）
- tsconfig 必须 `exclude: ["src/client"]`——host tsc 编译 client 会因 react 等浏览器依赖报 TS2307

## Host 侧

- 动态注册/注销工具：`ctx.tools.register(defineTool(...))` 返回 disposer，切换时调用注销；插件卸载时也要注销（`ctx.effect` 清理）
- 工具重名报错：同 scope 内 `tool "x" is already registered`；host 层与 preset 层是不同 scope，可同名共存
- `defineTool` 的 output.schema 嵌套 object 必须带 `additionalProperties: false`，否则类型推断为 never
- `ctx.webServer` 等 host 服务类型需自行声明（`AppContext` 交叉类型），未 import 对应包时 cordis Context 类型合并不生效
- settings 注册用 `installSettingsSection(ctx, ns, schema, entry, hooks)`：settings 服务存在时 onChange 立即触发一次；无 settings 服务时永不触发，需手动兜底调用
- settings 的 client 端 RPC 有 apiproxy allowlist（`WEB_SETTINGS_NAMESPACES`），插件自行注册的 namespace 不会被 serve 给浏览器（官方注释明确这是 deferred work）——client 卡片读写需走插件自己的 host API，host 端仍经 settings 服务持久化
- `system-prompt/assemble` 是 waterfall：必须 `await next()` 再裁剪；host 层无 scope tag 的 listener 全局接收所有 scope 的事件（`scopeTarget` 的 filter 对无 tag listener 放行）
- 系统提示文本（sections）按会话快照注入，工具列表（tools）按请求刷新——引导文本新会话生效，工具面裁剪当前会话即生效

## Client 侧

- `apply` 用 `ctx.slots` 必须 `export const inject = ['slots']`（服务注入声明），否则报 `cannot get property 'slots' without inject`
- `ctx.slots.register` 必须带 `name` 字段（= slot 名），缺 name 报 `slot undefined is not declared`
- `settings.plugin.item` slot 的组件是 React 组件（`SlotComponent<P> = (props: P) => ReactNode`）；用 `React.createElement` 手写可避免 tsx/jsx 构建配置
- 折叠卡片模式（与官方 PluginCard 同构）：头部 button（aria-expanded）+ chevron 旋转 + 展开 body + footer 保存/放弃；dirty 时头部显示「未保存」标记；样式用官方 CSS 变量（`--dsw-alias-*`）
- 终端卡片展示：工具实现 `presentCall`（card:'terminal'，title=命令）+ `presentResult`（解析输出末尾 `[exit code: N]` 标记拆出 exit pill）；exit 标记必须在输出**末尾**（`parseExitStatus` 锚定末尾），exit 0 不报标记

## 注入器

- `dev_inject_plugin`：junction + `loader.create`，host 层装配，免重启；client 模块经 client-modules 增量补扫注册，浏览器刷新后拉取新 bundle
- `dev_reload_package`：清缓存 + 重建 fiber，失败回滚保留旧代
- `dev_uninject_plugin`：卸 entry + 清 registry + 删 junction + patch disabled 条目，卸载即净
- 注入是运行时的：重启 web 后需重新注入；持久化用 `dev_install_package`（写 profile bundles）或正式安装（`dsh plugin add` + bundle patch）

## 发布

- bundle patch 装配：包内 `cordis.patch.yml`（insert 插件行）+ package.json `dsh.bundle.patch` 声明，`dsh plugin add github:...` 一条命令正式安装
- npm 发布：`files` 清单（lib + cordis.patch.yml + LICENSE）、`prepublishOnly` 自动构建、去 `private`
- Release 资产：ZIP（lib + cordis.patch.yml + package.json + LICENSE），用户解压后 `dsh plugin add link:<目录>`
