# Changelog

本项目的所有重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-10-05

### 变更

- **配置面板改为「折叠条目行 + 单条目配置界面」**：条目在列表里不再整卡平铺，而是**一行一条**，只显示条目名（只读；显示名优先，工具名为空时按可执行文件名推导并以弱化色显示）、「启用」checkbox 与「默认」radio；显示名、工具名、可执行文件路径（含「探测」）、工具提示词、沙箱完全权限与「删除」全部收进该条目**单独的配置界面**（点行尾「配置」进入，点「‹ 返回列表」退出）。条目多时不再一条撑满一屏。
- **条目显示名（`label`）**：每个条目新增「显示名」，用来区分**工具名相同**（或都留空、由同一个可执行文件名推导）的 shell——例如两个 `bash` 条目可以分别叫 `Git Bash` 与 `Cygwin`，列表里不再都显示成 `bash`；显示名同时用于配置界面标题与错误提示（重名、未探测到可执行文件、`/status` 的 `registerError` 都会指出是哪一条）。显示名只影响面板显示，不参与工具名、工具提示词与执行（留空回落到工具名）；列表行在显示名与工具名不同时用弱化色补一个工具名，工具名仍是模型看到的名称。host 侧旧配置缺 `label` 时按空串处理，无需迁移。
- **折叠行上的问题圆点**：条目有问题时行内多一个红色 `!` 圆点，原因放在 `title` 悬停文本（客户端校验问题优先，其次是运行时 `error` / 未找到可执行文件）——避免折叠后「条目失效只能靠展开面板才知道」被彻底隐藏。
- **新增/删除的视图切换**：「添加 shell」新建条目后直接进入它的配置界面；「保存」「放弃」「删除」都回到条目列表。
- **工具提示词预填默认模板 + 「重置为默认」**：新建条目时面板调 host 的 `POST /defaults`（`defaultToolDescription()` 是模板唯一来源）把默认说明预填进输入框；配置界面标签行右侧新增「重置为默认」，按当前工具名 / 路径 / PATH / 启动参数重新生成。client 不再复制一份模板文本。
- **可执行文件支持文件名（用 PATH 解析）**：`path` 现在既可以填绝对路径，也可以只填文件名（如 `bash.exe`；无扩展名时自动补 `.exe`）——填文件名时在进程 PATH 里查找，命中即用它的绝对路径，**不回落**家族候选（避免「填了 A 却起了 B」）；留空仍是家族自动探测。含目录分隔符又不是绝对路径的值（如 `sub/bash.exe`）在保存时 400。
- **条目级启动参数模板（`args`）**：`args` 是可执行文件之后**全部**参数的模板，用 `{command}` 占位实际命令。留空用家族默认（bash `-c {command}`、PowerShell `-NoLogo -NoProfile -NonInteractive -Command {command}`），因此连取命令的 `-c` 开关本身也能替换（`-l -c {command}`、`-Command {command}`，甚至只写 `{command}`），用来适配不按常规定义「取命令开关」的 shell。空白分隔、双引号分组；引号未闭合或缺 `{command}` 时保存 400，默认工具说明也按模板生成。
- **界面切换不再丢失滚动进度**：列表 ⇄ 单条目配置界面切换前记录滚动容器与 `scrollTop`，用列表视图高度给配置界面 `minHeight` 兜底（页面高度不缩水，浏览器就不会夹取），返回列表时在 `useLayoutEffect` 里原样恢复；进入配置界面时把卡片顶部对齐滚动视口。
- **host 侧回归测试（受限沙箱内可跑）**：新增 `tests/executable-and-args.mjs`（33 项断言），把 `ctx.subprocess.spawn` 换成记录型桩，覆盖可执行文件解析（绝对路径 / 文件名走 PATH / 无扩展名补 `.exe` / 非法值被拒）、启动参数模板（默认、加开关、换掉 `-c`、只留 `{command}`、缺占位符与引号未闭合被拒）、`/defaults` 与工具回落文本一致、保存校验与字段归一化上限、显示名（`label`）的空白折叠 / 截断 / 旧配置兜底 / 重名提示带显示名。

### 修复

- **面板保存后修改「消失」（新增/修改条目都不生效）**：DSH 对「只有 volatile 字段变化」的 entry 更新不重挂插件——`vendor/loader` 的 `_commitVolatile()` 原地 `updateVolatile` 已有引用并发 `loader/volatile-update`，`apply` 不再执行，因此 `applyPolicy()` 只在启动时跑过一次，`/status` 与工具注册一直停在启动快照（配置其实已正确写入 profile patch）。现在插件监听 `loader/volatile-update`，并在 `/status`、`system-prompt/assemble` 两处做幂等兜底对齐（`reconcile()`），保存后条目、工具注册与引导文本都会立即跟上。

- **装进 profile 后启动报 `failed to import`、插件配置页不出现**：运行期依赖改用发布名 `@deepseek-ai/schemastery` 与 `@deepseek-ai/cordis`。`schemastery` / `cordis` 只是 `scripts/build.sh` 为编译建立的本地别名（`vendor/*` 的真实包名就是作用域名），从 GitHub 安装到 `profiles/<name>/node_modules` 后 Node 只在共享的 `~/.dsh/profiles/node_modules` 里命中作用域名那一份，裸名会 `ERR_MODULE_NOT_FOUND`，导致该 entry 无法 import（实测复现：`Cannot find package 'schemastery'`）。同步更新 `peerDependencies`（`@deepseek-ai/schemastery` 收紧到 `^3.18.4`，`.volatile()` 语义所需）与 `build.sh` 的作用域 junction。

## [0.1.0] - 2026-10-04

### 破坏性变更

- **配置模型从「单 shell 三选一」改为「shell 条目数组」**：`preferred`（auto / bash / pwsh）与 `bashPath` 被 `shells: ShellEntry[]` 取代，条目字段为 `{ id, name, enabled, path, description, fullAccess, primary }`。
  - 旧配置自动迁移：`shells` 为空时按旧字段生成等价条目（`preferred=pwsh` → 未启用的 `powershell` 条目；其它情况 → 启用的 `bash` 条目，路径取旧 `bashPath`），首次保存时落盘；旧字段保留但不再生效。
  - 配置面板从「默认 Shell」三选一改为条目列表：可增删、每条目独立启用 / 路径 / 工具提示词 / 沙箱完全权限，并新增「默认」单选。

### 新增

- **多 shell 条目**：每个启用且可用的条目注册为一个独立 shell 工具（工具名默认由可执行文件名推导，非法字符换成 `_`；`pwsh` 因与 DSH 内置工具重名默认改叫 `powershell`；启用条目间必须唯一，`run_code` 为保留名），支持同时启用多个 shell。
- **家族方言**：PowerShell 家族用 `-NoLogo -NoProfile -NonInteractive -Command`（命令前附 UTF-8 输出编码前缀，修正 Windows PowerShell 5.1 代码页），其余 shell 用 `-c`。
- **路径探测扩展**：Git for Windows（`bin` / `usr\bin` / 用户级 `%LOCALAPPDATA%\Programs\Git`）、MSYS2、Cygwin、PowerShell 7、Windows PowerShell 5.1、PATH（按条目名与 `bash.exe` 查 `.exe`）。新增 `POST /shells`、`POST /detect` API 与面板「探测」按钮。
- **沙箱完全权限（条目级 `fullAccess`）**：跳过 `sandbox.confine`（等同 `danger-full-access`，因此不再触发沙箱拒绝后的升级审批），且该工具不向模型暴露 `sandbox_permissions`/`justification`（硬塞这两个参数会报错）。
- **条目级运行时状态与错误隔离**：未找到可执行文件、工具名被 DSH 内置工具或其它插件占用、启用条目间重名、注册抛错都只影响该条目并在面板显示原因；`/status` 新增 `entries`、`migrated`、`registered`，原 `registerError` 汇总全部条目问题（旧客户端字段 `effective`/`bashFound`/`bashPath`/`preferred`/`configuredBashPath` 继续返回）。
- **动态引导提示词**：`systemPrompt.section('shell-policy', order 104)` 改为函数文本，列出已注册的 shell 工具并推荐 `primary` 条目；没有注册任何工具时文本为空。
- **提示词裁剪规则更新**：只要有条目注册成功，就隐藏 DSH 内置的 `bash`/`pwsh`（内置工具在运行时无法注销，只能靠 `system-prompt/assemble` 过滤）；全部条目停用 / 不可用时不再裁剪，回到 DSH 原始工具面。
- **本地集成测试**：`tests/host-harness.mjs`（假 ctx，45 项断言，覆盖 schema 默认值、旧配置迁移、多工具注册、真实 spawn git-bash/pwsh 执行、渲染与终端卡片拆分、assemble 裁剪、引导文本、`/status` `/shells` `/detect` API、fullAccess 不 confine 且隐藏升级参数、PowerShell 方言、名称冲突、全部停用、后台任务通道（JobOutcome / readOutput / generic 卡片）、registry 级 output schema 与参数校验、真实 settings 服务的 volatile 契约），运行 `node tests/host-harness.mjs`。

## [0.0.7] - 2026-10-01

### 变更

- **适配 DSH 0.2.0 配置架构**：
  - Config 字段标记 `.volatile()`（0.2.0 的 live 配置要求；未标记则设置页不显示、写入报错）
  - 读取经 volatile 解包（结构检测，零依赖）
  - client 配置页注册迁移到 `plugins.bundle.config`（0.2.0 的 bundle 配置槽位，渲染在插件管理页的插件详情页内）
  - 保留 0.1.x 的 `settings.plugin.item` 注册（旧版兼容，0.2.0 下无副作用）

## [0.0.5] - 2026-08-21

### 修复

- **卡片边框黑色问题**：React inline style 下 `border` 简写 + CSS 变量拆解会丢失（border-color 回落 currentColor 黑色），全部改为长写属性（borderWidth/borderStyle/borderColor、borderTop*），折叠/展开边框颜色与官方卡片一致（品牌蓝 / label-dimmed）

## [0.0.4] - 2026-08-21

### 修复

- **展开键图标对齐官方**：卡片头部 chevron 由 `▾` 字符替换为官方 `IconChevronDownOutline14` 等价 SVG（14x14，fill=currentColor），与「终端 / Agent 循环 / 网页搜索」卡片视觉一致；展开旋转 180deg 动画保留

## [0.0.3] - 2026-08-21

### 新增

- **run_in_background 后台执行**：bash 工具支持 `run_in_background: true`（jobs 通道，`job_output`/`job_kill` 收集与停止），与官方 shell 工具对齐
- **文件沙箱集成**：standing policy 解析（sandboxPolicy）+ `sandbox.confine` 包装 + `sandbox_permissions`/`justification` 升级（approveEscalation）+ denial 检测与标记，与官方 shell 工具对齐
- **bashPath 面板配置**：卡片新增「bash 可执行文件路径」输入框（留空自动探测），host API `/bashpath` 持久化
- **卡片实时刷新**：监听 `settings/document-updated` 事件，外部写入（settings.yaml 等）后卡片状态自动刷新
- **注册失败状态显示**：bash 工具注册失败时卡片显示具体错误（status API `registerError` 字段）

### 修复

- **非 Windows 平台跳过**：Linux/macOS 上不再注册工具、不再裁剪提示词（此前会误过滤官方 bash 工具导致 agent 无 shell 工具）；卡片显示「仅 Windows 支持」
- **workdir 语义**：相对 workdir 按 session cwd 解析，缺省用 session cwd（此前按 process.cwd()）
- **types 声明**：exports `"./client"` 移除指向不存在文件的 types 行

## [0.0.2] - 2026-08-21

### 修复

- **[rc.7 兼容]** `settings.plugin.item` slot 注册补 `key` 字段：DSH 0.1.0-rc.7 起该 slot 由 `kind:'list'` 改为 `kind:'keyed'`，注册缺 key 会抛 `keyed slot "settings.plugin.item" requires options.key` 导致设置面板加载失败（与 dsh-gui-customization issue #3 同类问题）。list 下多余 key 字段被忽略，向后兼容旧版本。

## [0.0.1] - 2026-08-21

### 新增

- bash 探测：显式 `bashPath` → Git 常见安装路径（Program Files / x86）→ MSYS2 / Cygwin → PATH
- 「默认 Shell」折叠配置卡片（`settings.plugin.item` slot，与官方卡片同构）：自动 / bash / pwsh 三选一，staged 编辑 + 保存/放弃，折叠时保留未保存标记
- 策略生效：`auto` 时探测到 bash 则用 bash 否则 pwsh；显式 bash/pwsh 强制对应 shell；切换下一次请求生效
- bash 工具动态注册（`ctx.tools.register` disposer 切换）：git-bash 执行（subprocess 通道），超时 / 输出截断 / exit code 标记
- 终端卡片展示（`presentCall`/`presentResult`）：对话页可点击查看命令、cwd、输出与 exit 状态，与官方 shell 工具一致
- 提示词裁剪（`system-prompt/assemble`）：按策略隐藏 pwsh / bash，agent 工具面只保留一个 shell 工具
- 引导文本（`systemPrompt.section`）：声明 bash 为默认 shell
- 持久化：`preferred` 写入 settings 文档 `shell-policy` section，重启保留
- webServer API：`/dsh-shell-policy/api/status` 与 `/preferred`（卡片读写通道，绕开 apiproxy settings allowlist）
- bundle patch 装配（`cordis.patch.yml` + `dsh.bundle.patch`）：支持 `dsh plugin add` 正式安装

### 修复

- 无（首版）

### 已知限制

- 工具 schema 按请求刷新：切换后下一次请求生效，当前请求的工具面不变
- 系统提示文本按会话快照：已开始会话的提示词里可能残留旧 shell 工具定义（新会话干净）
- 仅 Windows 语义：Linux/macOS 上不生效（规划 P3）
