# Changelog

本项目的所有重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
