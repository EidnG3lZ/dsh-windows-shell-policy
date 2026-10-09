# dsh-windows-shell-policy 架构与开发指南

> 本文档是对本仓库（插件源码）的完整梳理，用于后续开发准备。
> 基线：`v0.1.0` 梳理（多 shell 条目模型），部分内容已随 `v0.1.1` 更新；**未特殊说明时所有相对路径均以仓库根目录为基准**。
> **2026-10-09 结构更正**：原文把本仓库描述为工作区下的嵌套目录，且所有相对链接带 `dsh-windows-shell-policy/` 前缀，实际 git 仓库根**就是**工作区根，链接已全部改为相对仓库根（详见 §2.1）。
> **2026-10-09 开发经验复核**：§2.2 包元数据、§6 构建与发布、§7.3 客户端槽位必坑、§8 本机现状、§9.2/§9.3 注意点、§10 开发指引已按当前代码与本机实测逐条核对，据此修正了版本号 / `peerDependencies` 值域 / `scripts`、§7.3 第 3 条（该槽位已随 DSH 0.2.0 删除）、§8 备选 checkout 的 bootstrap 状态，并按**沙箱实测**重写了 §9.3 与 §6.2/§8 的构建警告（受限沙箱拒绝的是「工作区外 target 的 junction」，`niu` 可替代起不来的 git-bash，但不能绕过文件沙箱）。**§3–§5 及 §4 各功能小节的功能性描述仍未逐行复核**（未变化处保持原样）。
> `#L行号` 锚点是**较早修订**的行号，源码增删后会整体漂移（§11 尤甚）；引用前请按符号名或文本在 `src/` 中重新定位，不要直接跳行号。

## 目录

1. [一句话定位与问题背景](#1-一句话定位与问题背景)
2. [仓库总览](#2-仓库总览)
3. [运行原理总览](#3-运行原理总览)
4. [Host 侧详解（src/index.ts）](#4-host-侧详解srcindexts)
5. [Client 侧详解（src/client/index.ts）](#5-client-侧详解srcclientindexts)
6. [构建与发布](#6-构建与发布)
7. [DSH 能力面速查](#7-dsh-能力面速查)
8. [本机现状与开发前置条件](#8-本机现状与开发前置条件)
9. [风险、文档漂移与代码级注意点](#9-风险文档漂移与代码级注意点)
10. [后续开发指引](#10-后续开发指引)
11. [附录：符号索引](#11-附录符号索引)

---

## 1. 一句话定位与问题背景

`dsh-windows-shell-policy` 是一个 **DSH（DeepSeek Harness）组合插件（bundle plugin）**，同时含 host 与 client 两半：

- **问题**：DSH 在 Windows 上默认启用 PowerShell（官方 `tool-pwsh`），而 LLM 训练语料以 bash 为主，agent 写 POSIX 命令时错误率显著升高。
- **做法**：维护一组可增删的 **shell 条目**（启用开关 / 工具名 / 可执行文件路径 / 工具提示词 / 沙箱完全权限 / 默认项），在插件管理页的本插件详情页可视化编辑；每个启用且可用的条目**注册一个独立 shell 工具**（Bash 家族 `-c`、PowerShell 家族 `-Command`，走 subprocess 通道），并**用提示词裁剪隐藏 DSH 内置的 `bash`/`pwsh`**，使工具面完全由条目决定。
- **路径留空即自动探测**：Git for Windows（系统级 / 用户级）、MSYS2、Cygwin、PowerShell 7、Windows PowerShell 5.1、PATH 按序查找；面板另有「探测」按钮。
- **沙箱完全权限**：条目级 `fullAccess` 跳过文件沙箱 `confine`（等同 `danger-full-access`），依赖兼容层运行的 git-bash 等 shell 不再因越界写入被拒后弹审批；该工具也不再向模型暴露升级参数。
- **不依赖官方 `tool-bash`**：Windows 上官方 `tool-bash` 依赖的 `ctx.shell`（bash-local/bash-sandbox）本身是 disabled 的，且 `bash-local` 直接 spawn `bash`（依赖 PATH，无路径探测），因此本插件自带执行器（设计决策见 [docs/roadmap-composition.md](../docs/roadmap-composition.md)）。

## 2. 仓库总览

### 2.1 目录结构

工作区根目录即 git 仓库根（`origin/main`），**没有嵌套层级**：

```
E:\DSHProjects\dsh-windows-shell-policy\      ← 工作区根 = git 仓库根（origin/main）
├── package.json            包元数据 / exports / dsh 装配声明
├── cordis.patch.yml        bundle patch：把自己插入 web profile 插件名册
├── tsconfig.json           host 侧 tsc 配置（exclude src/client）
├── tsdown.config.ts        client 侧打包配置（→ lib/client.js）
├── scripts/build.sh        一键构建（host tsc + client tsdown）
├── src/
│   ├── index.ts            host：条目模型 + 探测 + 策略 + 多 shell 工具 + HTTP API（≈1086 行）
│   └── client/index.ts     client：设置面板（折叠条目列表 + 单条目配置界面，≈1014 行）
├── lib/                    构建产物（已提交入库）
│   ├── index.js  index.js.map         host 产物
│   ├── client.js client.js.map        client 产物（CJS + __ModuleLoader__ 包装）
│   └── types/index.d.ts               host 公开类型
├── tests/
│   ├── host-harness.mjs    假 ctx 集成测试（61 项断言；真实 spawn git-bash / pwsh，无需启动 DSH）
│   │                       —— 管道捕获输出，受限沙箱下 spawn 会 EPERM，需完全权限
│   └── executable-and-args.mjs  可执行文件（绝对路径 / 文件名走 PATH）/ 启动参数模板 / 默认提示词 / 显示名回归（33 项断言；spawn 用记录型桩，沙箱内可跑）
├── docs/
│   ├── ARCHITECTURE.md             本文档：架构与开发指南
│   ├── conventions.md              插件编写规范与踩坑速查（最有价值的开发笔记）
│   ├── capabilities-host.md        host 服务/事件清单
│   ├── capabilities-client.md      client 槽位/服务清单
│   ├── roadmap-composition.md      从需求到发布的施工记录
│   └── screenshots/                两张 README 截图
├── AGENTS.md / PROJECT_INDEX.md    长期规则 / 任务路由（2026-10-09 新增）
├── NOW.md / MAP.md / RUNBOOK.md    当前状态 / 目录版本映射 / 操作手册（2026-10-09 新增）
├── DECISIONS.md / RISKS.md         已确认决策 / 已证实风险（2026-10-09 新增）
├── history/README.md               历史归档索引（2026-10-09 新增）
├── README.md / README.en.md        中英文说明（含安装与配置指南）
├── CHANGELOG.md                    v0.0.1 → v0.1.1 变更史
└── LICENSE                         MIT
```

`.gitignore` 仅忽略 `node_modules/`、`*.tsbuildinfo`、`*.tgz`、`*.zip` —— **`lib/` 是刻意入库的**（Release ZIP 与 `link:` 安装直接吃现成产物）。

### 2.2 包元数据要点（[package.json](../package.json)）

| 字段 | 值 / 作用 |
| --- | --- |
| `name` / `version` | `dsh-windows-shell-policy` / `0.1.1`（`type: module`） |
| `main` / `types` | `./lib/index.js` / `./lib/types/index.d.ts` |
| `exports` | `.` → lib/index.js；`./client` → lib/client.js；`./package.json` |
| `files` | `lib`、`cordis.patch.yml`、`LICENSE`（决定 npm 包与 Release 内容） |
| `dsh.bundle.patch` | `./cordis.patch.yml` —— 声明本包是 bundle，安装时自动装配 |
| `dsh.client.inject` | `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots` |
| `dsh.client.platform` | `web` |
| `peerDependencies` | dsh-llm / dsh-tools / dsh-subprocess / dsh-settings / dsh-sandbox / dsh-sandbox-policy / dsh-jobs / `@deepseek-ai/cordis` / `@deepseek-ai/schemastery` / dsh-client-ui-slots（值域：`@deepseek-ai/cordis` `>=4.0.0-rc <5`、`@deepseek-ai/schemastery` `^3.18.4`，其余均 `>=0.0.1-rc <2`）。**必须用发布名，裸名 `cordis`/`schemastery` 只在编译期可用**（见 §9.2 第 11 条） |
| `devDependencies` | `@types/node`、`typescript`、`tsdown` |
| `scripts` | `build` = `bash scripts/build.sh`；`typecheck` = `tsc -p tsconfig.json --noEmit`；`test:host` = `node tests/host-harness.mjs`；`test:exec` = `node tests/executable-and-args.mjs` |

`cordis.patch.yml` 只有 3 行有效内容 —— 一条 `insert`，把自身行加进 profile 名册：

```yaml
- insert:
    - id: dsh-windows-shell-policy
      name: 'dsh-windows-shell-policy'
```

---

## 3. 运行原理总览

```
                    ┌─────────────────────────── client（浏览器） ───────────────────────────┐
                    │  ShellPolicyCard（React，slots 'plugins.bundle.config'）                │
                    │  fetch /dsh-shell-policy/api/{status,shells,detect,defaults}          │
                    └───────────────▲──────────────────────────────────────┬─────────────────┘
                                    │ 折叠条目列表 ⇄ 单条目配置界面          │ 整表写配置（POST /shells）
                                    │ （+ 每条目运行时状态、滚动锚点）        │ 默认提示词（POST /defaults）
┌───────────────────────────────────┴──────────────────────────────────────▼─────────────────┐
│ host（cordis 插件 apply）                                                                  │
│                                                                                            │
│  Config(schema, volatile) ──readConfig/normalizeEntries──► shells: ShellEntry[]             │
│          ▲                                        │                                        │
│          │ settings.mutate(entryId,[{op:'set'}])  │ shells 为空 → migrateLegacyEntries      │
│          │                                        ▼                                        │
│          └──────────────────┐         currentEntries()：entries + migrated                  │
│                 HTTP API     │                     │                                        │
│                              │         resolveShellPath()（显式路径 | 家族候选探测）        │
│                              │                     ▼                                        │
│                              │         applyPolicy()：逐条目注册 / 注销                     │
│                              │           ├─ enabled + 可用 + 名称唯一 → tools.register()   │
│                              │           └─ 其它 → EntryStatus.error（面板可见）            │
│                              ▼                     │                                        │
│  settings 服务（持久化到 profile entry config）    ├──► systemPrompt.section('shell-policy') │
│                                                    │      列出已注册工具 + primary 优先项    │
│                                                    └──► system-prompt/assemble：有工具注册   │
│                                                         时隐藏内置 bash / pwsh              │
│                                                                                            │
│  shell 工具执行链：workdir 解析 → sandboxPolicy.resolve → (fullAccess? 跳过 : confine)       │
│                 → (可选) approveEscalation → ctx.subprocess.spawn → collect 读取 → 渲染/卡片 │
│                 └ 前台：120s 超时 + AbortController；后台：jobs.start(kind 'bash')          │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

要点：

- **配置写入者是 client**（HTTP API），**持久化者是 host**（`settings.mutate`）。绕开 apiproxy 的 settings namespace allowlist。
- **一个条目 = 一个工具**：`ctx.tools.register` 逐条目注册 / 注销（当前请求之后的下一次请求生效）；DSH 内置 `bash`/`pwsh` 在 preset 层无法运行时注销，只能由 `system-prompt/assemble` 在其名字未被本插件条目占用时过滤隐藏。
- **条目失败是隔离的**：路径未找到、工具名被内置工具 / 其它插件占用、条目间重名、注册抛错都只写进该条目的 `EntryStatus.error`，其余条目照常注册。
- **切换粒度**：配置面板保存走的是 **volatile-only 热更新** —— loader 原地 `updateVolatile` 写进已有引用并发 `loader/volatile-update`，**不会重挂插件、不会重新 `apply`**（见 §9.2 第 2 条）。插件在该事件上、以及 `/status` 与 `system-prompt/assemble` 里调用幂等的 `reconcile()` 重新应用策略；引导文本（sections）按会话快照，工具面按请求刷新。

## 4. Host 侧详解（[src/index.ts](../src/index.ts)）

### 4.1 导出与注入面

| 导出 | 位置 | 说明 |
| --- | --- | --- |
| `name` | [src/index.ts](../src/index.ts#L37) | `'dsh-windows-shell-policy'` |
| `inject` | [src/index.ts](../src/index.ts#L38) | `['tools', 'subprocess', 'systemPrompt', 'webServer']` |
| `ShellEntry` / `Config` | [src/index.ts](../src/index.ts#L83-L143) | 条目类型 + schemastery schema（`shells` 数组 volatile），DSH 0.2.0 自动投影为设置表单 |
| `apply` | [src/index.ts](../src/index.ts#L554) | 插件主体 |

还做了两处类型扩展：

- `declare module '@deepseek-ai/dsh-jobs'` 注册 `JobKindMap.bash`（[src/index.ts](../src/index.ts)），让后台任务 kind 类型合法。
- 本地声明 `AppContext = Context & { webServer: {...} }`（[src/index.ts](../src/index.ts#L524)）—— **cordis 的 Context 类型合并只有在 import 对应包时才生效**，因此未 import `@deepseek-ai/dsh-host-webserver` 时必须自己声明服务面。

### 4.2 配置模型（条目数组 + volatile 约定）

```ts
export interface ShellEntry {
  id: string          // 面板标识条目的稳定 id
  name: string        // 工具名（模型看到的 shell 工具名）；同一组合内唯一
  label: string       // 显示名：面板里区分条目（如 Git Bash / Cygwin）；留空回落工具名，不进工具面
  enabled: boolean    // 是否注册为该 shell 工具
  path: string        // 绝对路径，或只填文件名（在 PATH 里查找）；留空自动探测
  args: string        // 启动参数模板（可执行文件之后的全部参数；{command} 占位实际命令）
  description: string // 工具提示词；留空使用默认模板（面板新建条目时会预填默认模板）
  fullAccess: boolean // 跳过文件沙箱 confine（等同 danger-full-access）
  primary: boolean    // 多条目启用时引导提示词优先推荐的 shell（至多一个）
}
export interface Config {
  shells: Volatile<ShellEntry[]>
  preferred: Volatile<'auto' | 'bash' | 'pwsh'>  // @deprecated 仅迁移来源
  bashPath: Volatile<string>                     // @deprecated 仅迁移来源
}
export const Config = z.object({
  shells: z.array(ShellEntrySchema).default([]).volatile(),
  preferred: z.union([z.const('auto'), z.const('bash'), z.const('pwsh')]).default('auto').volatile(),
  bashPath: z.string().default('').volatile(),
})
```

DSH 0.2.0 起：

1. **live 字段必须标 `.volatile()`**，否则设置页不显示、`settings.mutate` 报 `Config field "x" is not volatile`；数组字段整体标 volatile 即可（schemastery 不允许在 volatile 字段内部再嵌 volatile）。
2. **配置 namespace = profile entry id**（不再有插件自定义 namespace）：[`resolveOwnEntryId()`](../src/index.ts#L68) 通过 `ctx.loader.entries()` 反查 `options.name === PKG_NAME` 的 entry，取其 `options.id`。
3. 读到的字段值是 `Volatile<T>` 引用，必须解包。插件用**结构检测**（有 `get()` 就当引用）而不是 `instanceof`，见 [`unwrapVolatile()`](../src/index.ts#L149)——避免 cosmokit 包名不匹配问题。

`path` 必须是绝对路径或纯文件名（不含目录分隔符）、启动参数模板必须含 `{command}` 占位符且引号闭合
6. **旧配置迁移**：`shells` 为空时由 [`migrateLegacyEntries()`](../src/index.ts#L458) 在内存里把旧字段映射成条目（不落盘）：`preferred=pwsh` → 未启用的 `powershell` 条目（旧 pwsh 模式等于 DSH 内置工具生效，本插件要接管时由用户打开开关）；否则 → 启用的 `bash` 条目（path 取旧 `bashPath`）。`/status` 用 `migrated` 标记，首次保存把 `shells` 写入配置。

### 4.3 路径解析与探测（[`resolveShellPath()`](../src/index.ts#L391)）

`path` 显式给出时：绝对路径直接用（不存在则条目不可用，面板报「未找到可执行文件：…」）；**只填文件名**（不含目录分隔符）则在进程 PATH 里查找。`path` 留空 → 按家族探测第一个存在的候选：

- **Bash 家族**（[`bashCandidates()`](../src/index.ts#L357)）：`%ProgramFiles%\Git\bin\bash.exe` → `%ProgramFiles%\Git\usr\bin\bash.exe` → `%ProgramFiles(x86)%\Git\bin\bash.exe` → `%LOCALAPPDATA%\Programs\Git\bin\bash.exe` → `C:\msys64\usr\bin\bash.exe` → `C:\cygwin64\bin\bash.exe` → PATH 逐目录找 `<条目名>.exe` / `bash.exe`。
- **PowerShell 家族**（[`pwshCandidates()`](../src/index.ts#L373)）：`%ProgramFiles%\PowerShell\7\pwsh.exe` → PATH 里 `pwsh.exe` → `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`。
- 家族判定 [`isPwshFamily()`](../src/index.ts#L265)：条目名或路径里出现 `pwsh` / `powershell` 即归 PowerShell 家族（决定 `-Command` 方言与探测候选），否则按 Bash 家族。
- PATH 只认 `.exe`（[`pathCandidates()`](../src/index.ts#L343)）：`.cmd`/`.bat` 不能直接 spawn；无扩展名的名字补 `.exe`，已带扩展名的不再追加。
- **文件名走 PATH**（[`resolveExecutableInPath()`](../src/index.ts#L407)）：在 PATH 的每个目录里找该名字，命中即用它的绝对路径，**不回落**家族候选——填了 `myweirdsh` 就只找 `myweirdsh(.exe)`，避免「填了 A 却起了 B」。
- **启动参数模板**（[`parseArgs()`](../src/index.ts#L288) / [`argTemplate()`](../src/index.ts#L323)）：`args` 是可执行文件之后**全部**参数的模板，`{command}` 占位实际命令；留空用家族默认（bash `-c {command}`、PowerShell `-NoLogo -NoProfile -NonInteractive -Command {command}`），所以 `-c` 本身也能改。空白分隔、双引号分组、`\"` 转义；引号未闭合或缺 `{command}` 都在保存时 400。
- 局限：未覆盖 WSL，以及非 `bash.exe` 命名的 shell（写绝对路径，或放进 PATH 后只填文件名）。

### 4.4 策略状态机（[`applyPolicy()`](../src/index.ts#L863)）

状态变量（[src/index.ts](../src/index.ts#L566-L569)）：`status`（每条目运行时状态数组）、`registeredNames`（已注册工具名）、`appliedSignature`（幂等签名）、`disposers`（条目 id → 工具注销函数）。

```
entries   = currentEntries()                        // 配置条目，或旧配置迁移结果
signature = JSON.stringify([entries, isWindows])
if (signature === appliedSignature) return          // 幂等守门
disposeAll()                                        // 全量重建
for each shell of entries:
    !enabled                         → 记录状态，跳过
    executable = resolveShellPath(shell)
    entryProblem(...) !== undefined  → 记录 error（空名 / run_code / 重名 / 未找到 / 被占用），跳过
    ctx.tools.register(buildTool(shell, executable)) → registered = true，registeredNames.push(name)
```

- **幂等守门**（[src/index.ts](../src/index.ts#L866-L868)）：条目集合、顺序、内容或平台未变则直接返回，避免重复注册。
- **全量重建**（[src/index.ts](../src/index.ts#L870)）：任一变化都先 [`disposeAll()`](../src/index.ts#L572) 注销旧工具再重注册；disposer 按条目 `id` 存在 Map 里。
- **逐条目隔离**（[src/index.ts](../src/index.ts#L873-L898)）：失败只写 `item.error`；`claimed` 集合保证同名条目只有第一个注册成功；注册抛错同样捕获成 `工具注册失败：…`，不冒泡。
- **不可注册的原因**由 [`entryProblem()`](../src/index.ts#L841) 汇总：工具名为空、`run_code` 保留名、与前面条目重名、可执行文件未找到（区分「显式路径不存在」与「未探测到」）、`ctx.tools.get(name)` 已被 DSH 内置工具 / 其它插件占用。`claimed` 是 `Map<工具名, 条目>`，所以重名文案能指出「与前面的条目『<显示名>』重复」；凡是要说明「是哪一条」的文案都经 `entryLabel()`（显示名优先，留空回落工具名），`/status` 的 `registerError` 汇总同理。
- 卸载时 [`disposeAll()`](../src/index.ts#L572-L574) 清理全部动态工具。

### 4.5 shell 工具定义（[`buildTool()`](../src/index.ts#L580)）

工具由 `defineTool({...})` 按条目单独声明，刻意与官方 shell 工具对齐：`name` = 条目工具名，`description` = 条目「工具提示词」，留空回落到 [`defaultToolDescription()`](../src/index.ts#L425) 生成的默认模板（含工具名、可执行文件、去掉 `{command}` 的开关）。**该函数是模板的唯一来源**：面板新建条目预填与「重置为默认」都经 `POST /defaults` 调它，避免 client 再抄一份。

**参数**（[src/index.ts](../src/index.ts)）：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `command` | ✅ | shell 命令 |
| `description` | ✅ | 5–10 词主动语态描述（UI 展示） |
| `timeoutMs` | | 默认 120000，超时 kill |
| `workdir` | | 缺省用 session 工作区；相对路径按 session cwd 解析 |
| `run_in_background` | | 立即返回 job id，无超时 |
| `sandbox_permissions` / `justification` | | **仅非 fullAccess 条目**暴露（`enum` 为 `ESCALATION_TARGETS`）：只用于「刚被沙箱拒绝的同一条命令」一次性重试升级；fullAccess 条目不暴露它们，模型硬塞会直接报错（[src/index.ts](../src/index.ts#L681-L686)） |

**输出 schema / 渲染 / 卡片**（[src/index.ts](../src/index.ts#L618-L826)）：后台返回 `{kind:'background', jobId}`；前台返回 `{exitCode, timedOut, aborted, stdout{text,truncated}, stderr{text,truncated}, sandbox?}`（嵌套 object 一律 `additionalProperties:false`）。`presentCall` → `{card:'terminal', title: command, description, cwd?}`；`presentResult` 用 [`parseExitStatus()`](../src/index.ts#L504) 从末尾拆出 `[exit code: N]`/`[killed by signal: X]` 作为独立 pill，正文不含标记（后台 / 错误时退回 `generic` 围栏）。

**`execute()` 完整链路**（[src/index.ts](../src/index.ts#L674)）：

1. 校验 `command` / `description` 非空；fullAccess 条目拒绝 `sandbox_permissions`/`justification`（[src/index.ts](../src/index.ts#L681-L684)），其余走 [`validateEscalationArgs()`](../src/index.ts#L686)。
2. **workdir 解析**：exec.agent?.session.header.cwd 为基准；相对路径 `resolve(headerCwd, workdir)`；缺省 `headerCwd ?? process.cwd()`。
3. **沙箱策略**：`sandboxPolicy.resolve({session})` 得 standing policy；非 fullAccess 且带 `sandbox_permissions` 时先查 `escalationModes` 非空，再 `approveEscalation(...)`（`toolName` 传条目名），批准后把 mode 覆盖到 policy 副本。
4. **argv 构造**（[src/index.ts](../src/index.ts#L724)）：[`buildArgv()`](../src/index.ts#L419) 按条目的启动参数模板逐 token 把 `{command}` 替换成实际命令（PowerShell 家族的替换值前面再加 [`PWSH_PREAMBLE`](../src/index.ts#L61)）——默认模板 bash `['-c', command]`、PowerShell `['-NoLogo','-NoProfile','-NonInteractive','-Command', PREAMBLE+command]`；条目自定义模板则完全按它来（可以去掉 `-c`、换成别的开关，甚至只留 `{command}`）。
5. **confine**（[src/index.ts](../src/index.ts#L727-L730)）：`!fullAccess && policy.mode !== 'danger-full-access' && sandbox !== undefined` 时 `await sandbox.confine(argv, policy)`（0.2.0 起异步）替换 argv——**fullAccess 条目完全跳过**，因此不会出现沙箱拒绝，也就不会触发升级审批。
6. **spawn spec**：`{argv, cwd, stdio:{stdin:'ignore', stdout:collect, stderr:collect}, graceMs:3000, signal, env: collectDshEnv()}`，`collect = {maxBytes: 64_000, spill: {maxBytes: 64*1024*1024}}`。
7. **后台分支**（[src/index.ts](../src/index.ts#L742)）：`ctx.get('jobs')` 缺失直接报错；预检 `exec.signal.aborted`；`jobs.start({kind:'bash', label: command, owner, run})`，句柄实现 `cancel`（terminate）/ `done`（→ `JobOutcome`）/ `readOutput`（stdout/stderr 各自 offset，stderr 以 `[stderr]` 前缀拼接）。
8. **前台分支**（[src/index.ts](../src/index.ts#L783-L817)）：默认 120s；`AbortController` + `setTimeout` 生成超时信号，同时监听 `exec.signal`；`await handle.done`；从 `handle.collected.*.readFrom(0)` 取文本与 `lossy`。
9. **沙箱拒绝判定**（[src/index.ts](../src/index.ts#L797-L806)）：`confined !== undefined` 且 `exitCode !== 0` 且 stderr 命中任一 `denialSignatures` → 结果带 `sandbox:{mode, denied:true}`（fullAccess 条目永不进入此分支）。
10. **中止语义**：`exec.signal.aborted` → 抛 `HarnessError('tool call aborted', TOOL_ABORTED)`（`name='AbortError'`）；`timedOut` 与 `aborted` 区分开；`finally` 清理 timeout 与 abort 监听。

**环境变量语义（易误读，已核对 DSH 源码）**：[`collectDshEnv()`](../src/index.ts#L546) **只挑 `DSH_*`**，看起来像「只给子进程传 DSH 变量」。实际上 DSH 的 `spawn` 会把显式 `env` **合并**到一份 scrub 过的父环境之上（`subprocess-local/src/spawn.ts` 的 `childEnv()`：`scrubbedParentEnv()` 去掉 `KEY|PASSWORD|SECRET|TOKEN` 与全部 `DSH_*`，再把显式条目按平台语义覆盖上去）。所以 `PATH`/`HOME`/代理变量会正常继承，而 `DSH_*` 事实由本函数刻意重新注入。**修改此处前务必理解这层契约。**

### 4.6 结果渲染（[`renderShellResult()`](../src/index.ts#L480)）

- 正文 = stdout；stderr 非空时以 `[stderr]` 段落追加；全空则 `(no output)`。
- 标记顺序：沙箱拒绝（`sandboxDenialMarker(mode)` + 可能的升级提示行）→ `[timed out]` → `[aborted]` 或 `[exit code: N]`（**exit 0 不报**）。
- 标记一律追加在**末尾**，因为 [`parseExitStatus()`](../src/index.ts#L504) 锚定末尾做反向解析，`presentResult` 再把 exit 状态拆成终端卡片的独立 pill。

### 4.7 HTTP API（面板读写通道，[src/index.ts](../src/index.ts#L937-L1104)）

`ctx.effect(() => ctx.webServer.register({kind:'prefix', path:'/dsh-shell-policy/api', handler}))`，**所有平台都注册**：

| 方法 + 路径 | 行为 |
| --- | --- |
| `GET /dsh-shell-policy/api/status` | 返回 `{platform, supported, entries, migrated, registered: string[], registerError?, …}`；`entries` 是 [`EntryStatus[]`](../src/index.ts#L448-L455)（条目配置字段 + `resolvedPath` + `registered` + `error`），另附旧客户端兼容字段 `effective` / `bashFound` / `bashPath` / `preferred` / `configuredBashPath`（[src/index.ts](../src/index.ts#L959-L981)） |
| `POST /dsh-shell-policy/api/shells` | body `{shells}`；`normalizeEntries` 归一化 → `validateEntriesForSave` 校验（≤16、名称唯一、`run_code` 保留、路径与 PATH 目录必须绝对、启动参数引号闭合）→ `settings.mutate(entryId, [{op:'set', path:['shells'], value}])`；不合法 400、落盘失败 500，均带原因（[src/index.ts](../src/index.ts#L983-L1012)） |
| `POST /dsh-shell-policy/api/detect` | body `{name, path}` → 走 `resolveShellPath` 返回 `{ok, path}`（`path` 是文件名时在 PATH 里找；留空时按家族探测；未找到时 `path: ''`）（[src/index.ts](../src/index.ts#L1014-L1035)） |
| `POST /dsh-shell-policy/api/defaults` | body `{name, path, args}` → 归一化后调 [`defaultToolDescription()`](../src/index.ts#L425) 返回 `{ok, description}`；面板「新建条目预填」与「重置为默认」都打这个接口，模板只在 host 存在一份（[src/index.ts](../src/index.ts#L1037-L1063)） |
| `POST /dsh-shell-policy/api/preferred` | 旧客户端兼容：写 `preferred`（auto \| bash \| pwsh）（[src/index.ts](../src/index.ts#L1064-L1083)） |
| `POST /dsh-shell-policy/api/bashpath` | 旧客户端兼容：写 `bashPath`（[src/index.ts](../src/index.ts#L1085-L1101)） |
| 其它 | 404 JSON |

实现细节：请求体经 [`readJsonBody()`](../src/index.ts#L535) 手写 `req.on('data'/'end'/'error')` 拼接 + `JSON.parse`（空体按 `{}`）；`settings` / entry id 缺失由 [`writeSettings()`](../src/index.ts#L946) 返回原因（500）；响应统一 `content-type: application/json; charset=utf-8`。

> 之所以自建 API：**settings 的 client 端 RPC 有 apiproxy allowlist（`WEB_SETTINGS_NAMESPACES`）**，本插件的 namespace/entry 不在其中，浏览器侧 `settingsScope` 拿不到。host 端仍走官方 `settings` 服务，保证持久化语义。

### 4.8 非 Windows 行为（[src/index.ts](../src/index.ts#L1107)）

注册完状态 API 后**直接 return**：不注册工具、不裁剪提示词、不加引导 section（Linux/macOS 上 DSH 官方 bash 工具已可用）。此时 `/status` 返回 `supported:false`，`entries` 按配置给出静态视图（`resolvedPath:''`、`registered:false`，见 [`statusView()`](../src/index.ts#L904)），且 `migrated` 恒为 false（迁移只在 Windows 产生条目）。

### 4.9 提示词面

```ts
ctx.on('system-prompt/assemble', async (_a, _c, next) => {
  const assembled = await next()
  const ours = new Set(registeredNames)
  if (ours.size === 0) return assembled
  const hidden = BUILT_IN_SHELL_TOOLS.filter((toolName) => !ours.has(toolName))
  if (hidden.length === 0) return assembled
  return { ...assembled, tools: assembled.tools.filter((tool) => !hidden.includes(tool.name)) }
})
```

- waterfall 事件：**必须先 `await next()`** 再裁剪（[src/index.ts](../src/index.ts#L1133-L1142)）。
- **只要有本插件工具注册成功，就隐藏 DSH 内置 `bash`/`pwsh`**（[`BUILT_IN_SHELL_TOOLS`](../src/index.ts#L59)）——内置工具在 preset 层无法运行时注销，只能靠过滤隐藏；名字与内置冲突的条目本来就注册失败（见 4.4），`!ours.has(toolName)` 只是避免把同名条目一起裁掉。
- 全部条目停用 / 不可用时 `registeredNames` 为空 → 不裁剪，回到 DSH 原始工具面。
- 引导文本（[src/index.ts](../src/index.ts#L1145-L1149)）：`systemPrompt.section({name:'shell-policy', order:104, text: () => guidanceText()})`。[`guidanceText()`](../src/index.ts#L910) 列出已注册工具，并按 `primary`（缺省取第一个）指明优先使用；没有注册任何工具时返回空串。sections 按会话快照，新会话才看到新文本。

### 4.10 自动表单与卸载清理

- `settings.configure({auto:true})`（[src/index.ts](../src/index.ts#L1114-L1121)）：声明由 Config schema 自动生成配置页（当前客户端不消费该标记）；用 `try/catch` 吞掉旧版本无此方法的情况。
- 最后调用 `applyPolicy()`（[src/index.ts](../src/index.ts#L1124)）让策略立即生效。
- `ctx.effect(() => () => { disposeAll() }, '…: shell tool cleanup')`（[src/index.ts](../src/index.ts#L1153-L1155)）保证卸载时注销全部动态工具。

## 5. Client 侧详解（[src/client/index.ts](../src/client/index.ts)）

### 5.1 注册面（[`apply()`](../src/client/index.ts#L1073)）

| 槽位 | 位置 | 参数 | 状态 |
| --- | --- | --- | --- |
| `plugins.bundle.config` | [src/client/index.ts](../src/client/index.ts#L1077-L1084) | `name`（=槽位名）、`key:'dsh-windows-shell-policy'`、`label`（「Shell 工具」）、`inject:()=>({remote})` | **0.2.0 正式入口**，渲染在插件管理页的插件详情页内（`view:'page'`） |
| `settings.plugin.item` | [src/client/index.ts](../src/client/index.ts#L1088-L1097) | `name`、`id`、`key`、`order:5`、`label`、`inject` | 0.1.x 兼容；0.2.0 已删该槽位，`slots.inject` 对未声明槽位不执行回调，**无副作用** |

`export const inject = ['slots', 'remote']`（[src/client/index.ts](../src/client/index.ts#L30)）—— 用 `ctx.slots` / `ctx.remote` 而不声明注入会直接报错。

### 5.2 组件 `ShellPolicyCard`（[src/client/index.ts](../src/client/index.ts#L572-L1071)）

**三种视图**（由 `props.view` 决定）：

| `view` | 渲染 |
| --- | --- |
| `'summary'` | 一行状态摘要（`<span>`） |
| `'page'` | 0.2.0 bundle 配置页：`pageStyle` 容器 + 两级界面（条目列表 ⇄ 单条目配置界面） |
| 未指定 | 0.1.x 折叠卡片：头部 `button`（`aria-expanded` + chevron 旋转 + `dirty` 时「未保存」胶囊）+ 展开 body（内部同样是列表 ⇄ 配置界面两级） |

**两级界面（v0.1.1）**：列表里的条目一律**折叠成一行**——只有条目名（只读，[`displayName()`](../src/client/index.ts#L523)：**显示名 `label` 优先**，留空回落到工具名 / 可执行文件名推导并以弱化色显示；显示名与工具名不同时其后补一个弱化的工具名，说明模型看到的是哪个名字）、「启用」checkbox、「默认」radio，以及行尾的「配置」按钮；显示名、工具名、可执行文件路径（含「探测」）、工具提示词、沙箱完全权限与「删除」全部收进该条目**单独的配置界面**（点「配置」进入，点「‹ 返回列表」退出）。N 个条目因此只占 N 行，不再每条撑满屏幕。行上仅在有问题时多一个 `!` 圆点（[`entryWarning()`](../src/client/index.ts#L797)：客户端校验问题优先，其次是运行时 `error` / 未注册），原因放在 `title` 悬停文本里——避免折叠后「条目失效只能靠展开面板才知道」（§9.2 第 1 条）彻底不可见。`editingId` 为 `null` 即列表视图；被编辑条目从当前条目表消失（外部改写）时自动回落到列表（[src/client/index.ts](../src/client/index.ts#L993-L994)）。

**滚动位置保持（v0.1.1，需求「切界面后页面滚动进度丢失」）**：视图切换会改变面板高度，内容变短时浏览器会把 `scrollTop` 夹到新的上限，页面一长「滚动进度」就丢。做法是三条一起上：① [`openEntryConfig()`](../src/client/index.ts#L629) 在离开列表前把**滚动容器与 scrollTop/scrollLeft** 记进 `listScroll` ref，[`backToList()`](../src/client/index.ts#L638) 之后由 [`useLayoutEffect`](../src/client/index.ts#L643)（`[editingId]`，DOM 更新后、绘制前）原样写回；② 同一时刻把列表视图的 `offsetHeight` 记进 `listHeight`，配置界面容器用 `minHeight + boxSizing:'border-box'` 兜底，**页面高度不缩水 → 浏览器不会夹取**，返回时的高度也与离开时一致，恢复是精确的；③ 进入配置界面时把卡片顶部对齐滚动视口顶部（留 8px），避免用户落在单条目卡片的中段。滚动容器由 [`findScroller()`](../src/client/index.ts#L609) 从面板根节点往上找第一个 `overflow-y:auto/scroll` 且真正可滚的祖先，找不到就用 `document.scrollingElement`（面板在插件详情页里的滚动容器由宿主决定，不能写死 window）。`rootRef` 也挂在 page 视图的容器上。

**状态与数据流**：

- `load()` → `fetch('/dsh-shell-policy/api/status')`，失败置 `null`（[src/client/index.ts](../src/client/index.ts#L587)）。
- `useEffect` 里首次 `load()`，并订阅 `remote.$on('settings/document-updated', load)` 实现**外部写入后自动刷新**（[src/client/index.ts](../src/client/index.ts#L594-L599)）；返回退订函数。
- **staged 编辑**：`draft` 为 `null` 表示「未改动」，`saved = status.entries.map(toDraft)`、`entries = draft ?? saved`、`dirty = draft !== null`；`problems` 逐条目预校验，`blocked = !dirty || saving || hasProblem`（[src/client/index.ts](../src/client/index.ts#L601-L606)）。
- `update()` / `setPrimary()`（单选，其余条目清除 primary）/ `addEntry()`（id 用时间戳 + 随机串；新增后 `openEntryConfig` 直接进它的配置界面，然后 `probe` → [`fillDefaultDescription()`](../src/client/index.ts#L731) **把默认模板预填进「工具提示词」**）/ `removeEntry()`（至少保留 1 条；删除后 `editingId` 置空回到列表）（[src/client/index.ts](../src/client/index.ts#L671-L701)）。
- `probe(index, entry)` → `POST /detect`（body `{name, path}`）；命中则回填 `path`、名称为空时用 [`deriveName()`](../src/client/index.ts#L500) 推导，**并返回探测后的条目对象**供新建流程接着取默认提示词；未命中写 `notice`「未探测到可执行文件，请手动填写路径」。
- `fillDefaultDescription(index, entry)` → `POST /defaults`（body `{name, path, args}`）把返回的 `description` 写进草稿：新建条目预填与配置界面的「重置为默认」共用它，**模板不在 client 复制**（[src/client/index.ts](../src/client/index.ts#L731)）。
- `save()` → `POST /shells` 整表提交（条目字段逐个映射）；`ok !== true` 抛错 → 「保存失败：…」；成功后清空草稿、退出配置界面并 `load()`（[src/client/index.ts](../src/client/index.ts#L747)）。
- `discard()` 清空草稿与失败态，并退出配置界面（[src/client/index.ts](../src/client/index.ts#L779)）。

**控件**（`controls`，[src/client/index.ts](../src/client/index.ts#L996-L1034)）：

1. 状态行：`registerError` 存在时红字显示（按条目汇总的错误），否则显示状态摘要（未注册任何工具 / 已注册工具列表；`migrated === true` 时附加「当前条目由旧配置迁移，保存后写入配置」）。
2. 条目列表（[`entryRow()`](../src/client/index.ts#L809)）：每行 = 条目名（只读 `<span>`，留空且路径也空时显示「未命名」，`title` 带说明）+ 仅在有问题时的 `!` 圆点 +「启用」checkbox +「默认」radio（title 说明用途，未启用时禁用）+「配置」按钮。
3. 单条目配置界面（[`entryDetail()`](../src/client/index.ts#L863)）：头部 =「‹ 返回列表」+「配置：<显示名>」+ 弹性 spacer +「删除」（仅剩 1 条时禁用）；主体 = 「显示名」输入框（占位「留空用工具名；只在面板里区分条目（例如 Git Bash / Cygwin）」，提示行说明它只影响面板显示、模型看到的仍是工具名）+「工具名」输入框（占位「留空按可执行文件名推导（pwsh 会改名为 powershell）」+ 一行「模型看到的工具名：<effectiveName>」提示）+「可执行文件」输入框与「探测」按钮同排（占位「绝对路径，或只填文件名（如 bash.exe，在 PATH 里查找）；留空自动探测」）+「工具提示词」textarea（3 行；标签行右侧是「重置为默认」按钮，调 `/defaults` 重新生成）+「沙箱完全权限」checkbox（文案说明跳过文件沙箱、不再逐次审批）+「启动参数」输入框（模板，占位「留空用默认：-c {command}（bash）/ -NoLogo -NoProfile -NonInteractive -Command {command}（pwsh）」，提示行说明 `{command}` 会被替换成实际命令、想换掉 `-c` 就改这里）；底部按需显示客户端问题（红字）、运行时状态（未编辑时显示 `运行时已生效：<resolvedPath>` / 未生效 + `error`）与探测 `notice`。
4. 条目为空时显示空态提示。
5. footer（列表与配置界面共用）：失败提示 + 弹性 spacer +「添加 shell」（≥16 条禁用）/「放弃」（未改动或保存中禁用）/「保存」（未改动、保存中或存在客户端问题时禁用）。

**客户端预校验**（[`entryProblem()`](../src/client/index.ts#L533)）：启用条目间工具名重复（文案里用对方的显示名标识是哪一条）、`run_code` 保留名、`path` 要么绝对要么纯文件名、启动参数模板必须含 `{command}` 且引号闭合。后两项由 client 自己的 [`isBareExecutableName()`](../src/client/index.ts#L448) / [`argTemplateProblem()`](../src/client/index.ts#L453) / [`parseArgs()`](../src/client/index.ts#L464) 复刻 host 规则（client bundle 与 host 各自独立，无法共享代码）——**改 host 规则时这几处要同步**。[`effectiveName()`](../src/client/index.ts#L512) 与 host 的 sanitize 规则一致。

### 5.3 样式约定

- 全部走**内联样式对象**，颜色/背景用官方 CSS 变量 `--dsw-alias-*`（`border-l2`、`bg-layer-2/3`、`label-primary/secondary/tertiary/dimmed/error`、`bg-module-platform`），与官方 PluginCard / TerminalBlock 视觉同构（样式对象见 [src/client/index.ts](../src/client/index.ts#L80-L442)；v0.1.1 新增折叠行 `row*`、问题圆点 `warnBadgeStyle`、配置界面 `detail*` / `inlineRowStyle` / `pathInputStyle` / `wrapLabelStyle`）。
- **必坑**：React 内联样式下 `border` 简写会让 CSS 变量在拆解时丢失（`border-color` 回落 `currentColor` → 黑边），因此一律用 `borderWidth`/`borderStyle`/`borderColor`（以及 `borderTop*`）长写（[src/client/index.ts](../src/client/index.ts#L80-L90)、[conventions.md](../docs/conventions.md)）。
- chevron 用官方 `IconChevronDownOutline14` 的等价 SVG（`fill='currentColor'`，14×14），`ChevronIcon` 见 [src/client/index.ts](../src/client/index.ts#L146)；展开时 `rotate(180deg)`。
- 组件用 `createElement` 手写而非 JSX —— 免去 tsx/jsx 构建配置。

## 6. 构建与发布

### 6.1 双产物构建链

| 产物 | 工具 | 配置 | 输入 → 输出 |
| --- | --- | --- | --- |
| host | `tsc`（来自 DSH checkout） | [tsconfig.json](../tsconfig.json) | `src/` → `lib/`（`NodeNext`、`strict`、`ES2023`、`declaration → lib/types`、`rootDir: src`） |
| client | `tsdown`（来自 DSH checkout） | [tsdown.config.ts](../tsdown.config.ts) | `src/client/index.ts` → `lib/client.js`（CJS + sourcemap） |

- [tsconfig.json](../tsconfig.json) 必须 **`"exclude": ["src/client"]`**：host tsc 编译 client 会因 react 等浏览器依赖报 TS2307。
- tsdown 关键点：`format:'cjs'`、`platform:'browser'`、`dts:false`、`codeSplitting:false`；`react`/`react-dom`/`@deepseek-ai/cordis`/`@deepseek-ai/dsh-client-ui-slots`/`@deepseek-ai/dsh-client-runtime/client` 列为 external，其余 `alwaysBundle`；用 `banner`/`footer`/`intro` 把产物包成 `window.__ModuleLoader__.load({ id: 'dsh-windows-shell-policy', factory: (require) => { ... return module.exports } })`。

### 6.2 [`scripts/build.sh`](../scripts/build.sh) 逐步

1. `ROOT` 定位到仓库根并 `cd`。
2. **探测 checkout**：`$DSH_CHECKOUT` → `$HOME/dsh-harness` → `$HOME/dsh` → `$HOME/.dsh/dsh-harness`，必须存在 `<checkout>/packages`，否则退出 1。
3. `TSC=<checkout>/node_modules/.bin/tsc`（不存在则退出）；把 `<checkout>/node_modules/.bin` 前置进 `PATH`。
4. **junction link 编译依赖**（`link_pkg`，Windows 用 `fs.symlinkSync(..., 'junction')`）：`cordis→vendor/cordis`、`@deepseek-ai/cordis→vendor/cordis`（发布名，类型解析用）、`cosmokit→vendor/cosmokit`、`schemastery→vendor/schemastery`、`@deepseek-ai/schemastery→vendor/schemastery`（发布名，类型解析用）、`@deepseek-ai/dsh-tools→packages/core/tools`、`dsh-llm→packages/llm/llm`、`dsh-system-prompt→packages/core/system-prompt`、`dsh-subprocess→packages/subprocess/subprocess`、`dsh-settings→packages/settings/settings`、`dsh-sandbox→packages/sandbox/sandbox`、`dsh-sandbox-policy→packages/sandbox/sandbox-policy`、`dsh-jobs→packages/jobs/jobs`、`@types/node→<checkout>/node_modules/@types/node`。
5. 删除 `node_modules/@standard-schema`，并从 pnpm store（`<checkout>/node_modules/.pnpm/@standard-schema+spec@*/node_modules/@standard-schema/spec`）junction 回来。
6. `"$TSC" -p tsconfig.json` → host 产物。
7. `node "<checkout>/node_modules/tsdown/dist/run.mjs"` → client 产物。
   - **不要用 `.bin/tsdown`**：git-bash 下 shell shim 有 MSYS 路径转换问题（见 conventions.md）。

> ⚠️ **受限文件沙箱（`workspace-write`）下不要跑 `build.sh`**：它先 `rmSync` 已有 junction，而 `link_pkg` 的 target 全在工作区外（`E:\DSHSource\current\...`），沙箱只拒绝**工作区外 target** 的符号链接/目录联接 → 第一步就 `EPERM`，已被 `rmSync` 删掉的 junction 回不来（AGENTS.md §3、[docs/conventions.md](../docs/conventions.md)「Host 侧」；完整实测见 §9.3）。
> **换 shell 并不能绕过**：git-bash 在沙箱里连启动都失败（`couldn't create signal pipe, Win32 error 5`），原生 applet `bash` 与 `niu`（Niubash 1.3.3）能跑，但同样被文件沙箱拒绝（实测三种驱动结论一致）。要跑通要么给完全文件权限，要么把 checkout 镜像进工作区；受限沙箱内改代码后改走 [RUNBOOK.md](../RUNBOOK.md) §3 的手动路径（`"<checkout>/node_modules/.bin/tsc" -p tsconfig.json` + `node "<checkout>/node_modules/tsdown/dist/run.mjs"`），前置是 junction 已由**一次完全权限下的 `build.sh`** 建好——手动路径自身不建 junction，所以仓库无 `node_modules` 时它也跑不了。

### 6.3 发布与安装

- `package.json` 里 **`prepublishOnly` 已被移除**：其 `bash scripts/build.sh` 在 cmd.exe 环境下因 bash 不在 PATH 而失败。发布前**手动构建**，然后 `npm publish --ignore-scripts`。
- npm **staged publishing** 坑：`npm publish` 报成功但 registry 未立即出现，重复发布会 `E409 Cannot publish over a previously staged version`；等待/网页批准，或直接换补丁版本号绕过（v0.0.6 即因此改版为 v0.0.7）。
- 安装路径：`dsh plugin --profile web add github:<owner>/<repo>`（bundle patch 自动装配）｜`... add dsh-windows-shell-policy`（npm）｜`... add link:<解压目录>`（Release ZIP：lib + cordis.patch.yml + package.json + LICENSE）。
- 开发态免重启：`bash scripts/build.sh` + `dev_inject_plugin <目录>`（junction + `loader.create`，host 即时生效，client 刷新浏览器后拉新 bundle）；`dev_reload_package` 重建 fiber；`dev_uninject_plugin` 卸 entry + 清 registry + 删 junction + 写 disabled patch。
- 注入是运行时的，重启 web 后需重新注入；要持久化用 `dev_install_package` 或正式安装。

---

## 7. DSH 能力面速查

### 7.1 Host 服务 / 事件（本插件实际消费）

| 名称 | 提供方 | 用途 | 0.2.0 变化 |
| --- | --- | --- | --- |
| `tools` | `@deepseek-ai/dsh-tools` | 逐条目 `register(defineTool)` → disposer（按条目 id 保存）；`get(name)` 查名称占用；`defineTool`、`TOOL_ABORTED` | — |
| `subprocess` | `@deepseek-ai/dsh-subprocess(-local)` | `spawn(spec)`；collect 读取 + spill；`terminate` | — |
| `systemPrompt` | `@deepseek-ai/dsh-system-prompt` | `section({name, order, text})` | — |
| `webServer` | `@deepseek-ai/dsh-host-webserver` | `register({kind:'prefix', path, handler})` | — |
| `settings` | `@deepseek-ai/dsh-settings(-file)` | `mutate(entryId, ops)` 写 `shells` 条目数组（并兼容 `preferred`/`bashPath`）、`configure({auto})` | namespace = entry id；volatile 表单 |
| `sandbox` | `@deepseek-ai/dsh-sandbox` | `confine(argv, policy)`；`ESCALATION_TARGETS`、`approveEscalation`、`sandboxDenialMarker`、`validateEscalationArgs` | `confine` 变异步 |
| `sandboxPolicy` | `@deepseek-ai/dsh-sandbox-policy` | `resolve({session})` → standing policy | — |
| `jobs` | `@deepseek-ai/dsh-jobs` | `start({kind,label,owner,run})` | `owner` 由 Agent 实例改为 `SessionId` |
| `approval` | DSH 审批服务 | `approveEscalation` 的 approver | — |
| `loader` | cordis loader | `entries()` 反查自身 entry id | — |
| `system-prompt/assemble` | 事件（waterfall） | 有本插件工具注册成功时隐藏 DSH 内置 `bash`/`pwsh` | — |

### 7.2 Client 槽位 / 服务

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `plugins.bundle.config` | keyed slot（0.2.0） | 第三方 bundle 自己的配置页，`key` = bundle 包名，渲染在插件详情页 |
| `settings.plugin.item` | 旧槽位（0.1.x） | 兼容保留，0.2.0 下无副作用 |
| `slots` | client 服务 | `inject(name, factory)` + `register(options, component)` |
| `remote` | client 服务 | `$on('settings/document-updated', cb)` 实时刷新 |
| 终端卡片 | 渲染协议 | 工具 `presentCall`/`presentResult` 返回 `card:'terminal'` → 对话页 TerminalBlock |

### 7.3 客户端槽位「必坑」（源自源码注释与 [conventions.md](../docs/conventions.md)）

1. `apply` 里用 `ctx.slots` 必须 `export const inject = ['slots']`。
2. `slots.register` 必须带 `name`（= 槽位名），否则报 `slot undefined is not declared`。
3. **（仅 0.1.x 兼容，历史坑，现版本已无法触发）** DSH 0.1.0-rc.7 起 `settings.plugin.item` 是 `kind:'keyed'`，注册必须带 `key`（本插件曾因此导致设置面板加载失败）。**0.2.0 已删除该槽位**——2026-10-09 核对 `E:\DSHSource\current`（0.2.0-rc.2）的 client 侧只声明 `plugins.item` / `plugins.bundle.config` / `plugins.row.config`，`settings.plugin.item` 仅剩注释提及；本插件保留的那次注册因槽位未声明而不会执行回调（§5.1），故该坑不再适用。

---

## 8. 本机现状与开发前置条件

> 以下为环境事实。**2026-10-09 第二次核验**更新了版本、仓库、DSH checkout、备选 checkout 四行；其余各行仍是 v0.1.0 梳理时的记录（本次对工具链 / git-bash / web profile 三行抽查，未见偏差）。当前状态以 [NOW.md](../NOW.md) / [MAP.md](../MAP.md) 为准。

| 项 | 现状 |
| --- | --- |
| 工作区根 | `E:\DSHProjects\dsh-windows-shell-policy`（**即 git 仓库根**；无 `node_modules`） |
| 仓库 | `main` 跟踪 `origin/main`，无 tag（2026-10-09 核验：最新提交 `8e7c580`，2026-10-08）；origin 同时有 `git.64832619.xyz`（fetch）与 `github.com/EidnG3lZ/...`（push） |
| 版本 | `0.1.1`（2026-10-09 核验） |
| DSH checkout | `E:\DSHSource\current` = **0.2.0-rc.2**（`639ed01539`），**已 bootstrap（有 `node_modules`）** → 提供 `scripts/build.sh` / `npm run typecheck` 所需的 tsc / tsdown（本仓库自身仍需先建 junction，见下方前置动作） |
| 备选 checkout | `E:\DSHSource\0.2.0-rc2`（0.2.0-rc.2，**已 bootstrap**：有 `node_modules` 与 `.bin/tsc`，2026-10-09 核对）；`E:\DSHSource\0.1.5-rc2\deepseek-harness`（0.1.5-rc.2，**已 bootstrap**，有 tsc/tsdown，但 API 版本偏旧） |
| 工具链 | node `v26.10.0`、git `2.55.0.windows.2`、`bash`→`D:\Scoop\shims\bash.exe`（**native applet shell，不是 git-bash**）、`niu`→`D:\Scoop\shims\niu.exe`（Niubash 1.3.3，原生 bash 兼容实现，沙箱内可用）、`pwsh` 7.6.6、`pnpm`、`tsc` 均在 PATH；git-bash 真身 `C:\Program Files\Git\bin\bash.exe` **在受限沙箱内无法启动**（见 §9.3） |
| git-bash | `C:\Program Files\Git\bin\bash.exe` 存在（本插件 `bashCandidates()` 命中第 1 候选） |
| web profile | `~/.dsh/profiles/web`（2026-10-09：本机路径已按隐私约定改为占位符）；`package.json` 的 bundles 里**没有**本插件，`cordis.patch.yml` 也没有相关 entry（v0.1.0 梳理时已无 disabled 残留） |
| profile 残留 | v0.1.0 梳理时 `node_modules\dsh-windows-shell-policy` 已不存在（旧悬空 junction 已清理） |
| 同类插件 | profile 依赖里有 `dsh-gitbash-shell@0.33.0`（另一套 Windows→Git Bash 方案：物化预设的 Git Bash 变体、MSYS 路径方言统一、侧栏终端接管；带自己的 `cordis.patch.yml`）。**同时启用前需评估与本插件的工具/提示词冲突** |

### 建议的前置动作（首次开工）
> v0.1.0 梳理时 `E:\DSHSource\current` 已 bootstrap，第 1 步可直接跳过。
> ⚠️ 第 2 步的 `build.sh` **需要完全文件权限**：受限沙箱（`workspace-write`）只拒绝 **target 在工作区外**的符号链接/目录联接，而 `build.sh` 的 junction 全部指向 checkout，故必然 `EPERM` 且会先删掉已有 junction（实测与对照见 §9.3；git-bash 在沙箱内无法启动，`niu`/原生 applet `bash` 可运行但同样被拒——换 shell 不解决问题）。仓库当前没有 `node_modules`，所以「手动 `tsc` + `tsdown`」这条替代路径**在没跑过一次完全权限 `build.sh` 之前也不能用**（手动路径不建 junction）。

```bash
# 1) bootstrap 0.2.0 checkout（build.sh 依赖它的 tsc / tsdown）
cd /e/DSHSource/current && pnpm install

# 2) 构建本插件
cd /e/DSHProjects/dsh-windows-shell-policy
DSH_CHECKOUT=E:/DSHSource/current bash scripts/build.sh

# 3) 先做一次类型基线（需要 build.sh 建好的 node_modules junction）
DSH_CHECKOUT=E:/DSHSource/current npm run typecheck
```

> `typecheck` 用的是本机 `tsc`，但解析的是 `build.sh` 建立的 junction 依赖；因此必须先跑过一次 `build.sh`（或手工建立同样的 link）。

---

## 9. 风险、文档漂移与代码级注意点

### 9.1 文档与代码的同步状态

> 下表结论为 **v0.1.0 梳理**时点；2026-10-09 的实际变化见本表最后三行。条目标注「已同步」仅表示当时已按 v0.1.0 改过，不构成对当前代码的复核结论。

| 位置 | 状态 |
| --- | --- |
| [docs/capabilities-host.md](../docs/capabilities-host.md) | **已同步**：服务表更新为 `tools` / `subprocess` / `systemPrompt` / `webServer` / `settings` / `sandbox` / `sandboxPolicy` / `jobs` / `approval` / `loader`，移除 0.2.0 已删除的 `installSettingsSection` |
| [docs/capabilities-client.md](../docs/capabilities-client.md) | **已同步**：补 `plugins.bundle.config` 与 `remote`，并把 `settings.plugin.item` 标注为 0.1.x 兼容 |
| [README.md](../README.md) / [README.en.md](../README.en.md) | **已同步**：改述为多 shell 条目模型；配置持久化改述为 profile entry config（`shells` 数组，经 `settings.mutate(entryId)`）；删除过时的「bashPath 通过 settings.yaml 配置（面板编辑在规划中）」 |
| [docs/roadmap-composition.md](../docs/roadmap-composition.md) | **已同步**：追加「v0.1.0：多 shell 条目模型」一节，并回填 P1–P3 均已在 v0.0.3 交付 |
| [AGENTS.md](../AGENTS.md) / [PROJECT_INDEX.md](../PROJECT_INDEX.md) / [NOW.md](../NOW.md) / [MAP.md](../MAP.md) / [RUNBOOK.md](../RUNBOOK.md) / [DECISIONS.md](../DECISIONS.md) / [RISKS.md](../RISKS.md) / [history/README.md](../history/README.md) | **新增（2026-10-09）**：仓库根的项目上下文文档（长期规则、任务路由、当前状态、目录与部署映射、操作手册、决策、风险、历史索引）。本架构文档在其中的角色＝"代码结构与符号索引"的权威来源 |
| 本文档 | **结构更正（2026-10-09）**：仓库根描述与目录树、全部相对链接（原文 199 处嵌套前缀）、失效的 `#L` 锚点与 `[#Lxx]` 标签；详见 §12。**同日「开发经验复核」**：§2.2 元数据、§6 构建与发布、§7.3 槽位必坑、§8 环境现状、§9.2/§9.3 注意点、§10 开发指引按当前代码与本机实测复核（见文档头注） |
| [README.md](../README.md) / [README.en.md](../README.en.md) | **已更新（2026-10-09）**：新增「项目上下文文档」入口表 |
| [src/index.ts](../src/index.ts) 顶部注释 | **已同步**：改述为条目模型；[lib/types/index.d.ts](../lib/types/index.d.ts) 是构建产物，重新构建后才会带上新注释 |

### 9.2 代码级注意点 / 潜在缺陷

1. **条目错误只对面板可见**：条目注册失败（未找到可执行文件 / 工具名被占用 / 重名 / 注册抛错）只写进 `EntryStatus.error` 并经 `/status` 暴露；模型侧只看到「注册成功的工具 + 被隐藏的内置 shell」，没有任何错误提示——**用户要打开面板才知道某条目没生效**。
2. **条目运行时状态改为按需重算（v0.1.1 修复）**：`status` / `registeredNames` 存在闭包快照里（[src/index.ts](../src/index.ts#L566-L569)），原先只在 `applyPolicy()` 里刷新。而 DSH 对**只有 volatile 字段变化**的 entry 更新不重挂插件：`vendor/loader/src/config/entry.ts` 的 `_commitVolatile()` 原地 `updateVolatile` 已有引用并发 `loader/volatile-update`，`apply` 不再被调用。因此面板保存后必须自己重算，否则工具注册与 `/status` 停在旧快照（表现：保存后修改「消失」）。现在由 `reconcile()`（幂等，按条目签名比对）在 `loader/volatile-update`、`/status`、`system-prompt/assemble` 三处触发。**升级 DSH 时需回归验证。**
3. **`fullAccess` 与运行上下文不一致**：session 沙箱策略仍是 `workspace-write` 时，运行时上下文照旧告诉模型「写入受限于工作区」，而 fullAccess 条目的命令实际不受限制；这是刻意的 per-tool 选择，但两者并存时模型可能误判。
4. **探测候选仍不完整**：已覆盖 `%LOCALAPPDATA%\Programs\Git\bin\bash.exe`、`Git\usr\bin\bash.exe`、PATH 按名查找；仍缺 scoop shim 特判与 WSL。本机 `PATH` 里的 `bash` 是 scoop shim，只有在 Git 安装路径都没命中时才会被用到。
5. **不加载登录 / 交互 profile**：Bash 家族固定 `-c`（无 `-l`/`-i`），PowerShell 家族固定 `-NoProfile -NonInteractive`，因此 `.bashrc` / `$PROFILE` 里的环境不会生效。这是有意的（与官方 shell 工具一致），但值得在文档里说清。
6. **HTTP API 无鉴权**：`POST /shells`、`/detect`、`/preferred`、`/bashpath` 只做形状与值域校验（条目数 ≤16、名称唯一、路径绝对、字段长度上限），请求体经 `readJsonBody()` 手写拼接（无体积上限）；依赖 `webServer` 自身的访问控制（web 端有认证，桌面端需 token）。跨源 / 本地其它进程若能访问该端口即可改配置。
7. **条目 error 直接透出原始错误文本**：注册抛错时写成 `工具注册失败：${String(error)}`（[src/index.ts](../src/index.ts#L894)），面板会显示内部路径 / 堆栈首行，信息量大但对外观感一般。
8. **升级提示依赖注册时快照**：`escalationModes` 在 `buildTool()` 里按条目的 `fullAccess` 与组合能力算一次并闭包捕获（[src/index.ts](../src/index.ts#L584-L587)）；组合变化后需重新 apply 才更新（与第 2 条同源风险）。
9. **有本地集成测试，但仍无 CI / lint / format 配置**：`tests/host-harness.mjs`（61 项断言，真实 spawn，需完全权限）覆盖 host 侧的条目模型与执行链路，`tests/executable-and-args.mjs`（33 项断言，spawn 用桩，沙箱内可跑）覆盖可执行文件解析（绝对路径 / 文件名走 PATH）、启动参数模板与默认提示词；仓库内仍没有 workflow / oxlint 配置（DSH 主仓库的 `lefthook.yml` / `.oxlintrc.json` 不在本仓库）。
10. **硬编码中文 UI 文案**：客户端校验与状态文案均为中文字面量（如 [src/client/index.ts](../src/client/index.ts#L533)、[src/client/index.ts](../src/client/index.ts#L785-L794)），host 侧 API 错误同样是中文（[src/index.ts](../src/index.ts#L235-L235)），无 i18n 层；而 DSH client 是有 locale 服务的。
11. **运行期依赖曾用错包名（v0.1.0 的真实故障，v0.1.1 修复）**：`schemastery` / `cordis` 只是 `build.sh` 建立的编译期本地别名，`vendor/*` 的真实包名是 `@deepseek-ai/schemastery` / `@deepseek-ai/cordis`。插件从 GitHub 装进 `profiles/<name>/node_modules` 后，Node 的向上查找只在共享的 `~/.dsh/profiles/node_modules` 命中作用域名那一份 → 裸名 `ERR_MODULE_NOT_FOUND`，DSH 启动打印 `dsh-windows-shell-policy (dsh-windows-shell-policy): failed to import`，配置面板不出现。**新增任何非 `node:` 内建的 import 前，先确认用的是发布名。**

### 9.3 沙箱相关（2026-10-09 实测）

- 本工作区曾出现 `SetNamedSecurityInfoW failed (Win32 5): grantWrite(...)` —— DSH 无法为工作区根目录授予沙箱写权限（该目录缺少 `WRITE_OWNER`）。已按 `diagnose-windows-sandbox-acl` 技能一次性修复：为当前用户在该目录补 FullControl allow ACE（备份与回滚脚本在 `E:\DSHProjects\dsh-acl-recovery\`），随后**受限 shell 可正常读写**，工作区 ACL 现已带 DSH 沙箱能力 SID（`S-1-4-*`，`Write/Delete`）。
- 由此产生一条经验：**在修复之前由 harness FS 写入的文件不会继承该能力 SID**，受限 shell 无法删除它们（新增文件正常）。若再遇到「shell 无法删除某文件」，先核对它的 ACL 是否含 `S-1-4-*` 条目。
- **MSYS / git-bash 在受限沙箱里无法启动（实测）**：`C:\Program Files\Git\bin\bash.exe -c 'echo x'` 直接 `*** fatal error - couldn't create signal pipe, Win32 error 5`（MSYS 启动需要命名管道，受限沙箱禁止）。所以 **git-bash 不能用来驱动构建 / 测试**——这不是权限位问题，换参数或提权命令都无效。
- **PATH 里的 `bash` 不是 git-bash**：`D:\Scoop\shims\bash.exe` 自报 `bash is a builtin applet`（原生 Windows applet shell），可在沙箱内启动、读写、建 junction；但它不认 MSYS 的 `/e/...` 盘符映射，脚本里必须写 `E:/...`（写 `/e/...` 会 `can't cd`）。
- **`niu`（Niubash 1.3.3，`D:\Scoop\shims\niu.exe`）是原生 Windows 的 bash 兼容实现**，受限沙箱内可正常启动，并能驱动 `node` / `tsc` / `tsdown`（`uname` 仍报 `MSYS_NT-...`，但实现不依赖 MSYS 信号管道）。**它解决的是「shell 兼容层」问题，不是下面的文件沙箱问题**：受限沙箱内 `niu scripts/build.sh` 同样倒在「链接依赖」一步；只有**完全文件权限**下它才能走完三个阶段（见末条）。
- **`build.sh` 在受限沙箱下仍然失败，卡点是文件沙箱而非 shell**：`fs.symlinkSync(..., 'junction')` 只要 **target 在工作区之外**就 `EPERM`。实测对照（2026-10-09，`workspace-write`）：
  - target = `E:\DSHSource\current\vendor\cordis`（工作区外）→ **`EPERM`**，在 `pwsh`/node、applet `bash`、`niu` 三种驱动下结论一致；
  - target = 工作区内路径 → 成功；失败点也确实发生在**新目录内**（新建的 `node_modules` 已带 `S-1-4-*` 能力 SID，可排除 ACL 原因）。
  - `build.sh` 的 `link_pkg` 目标全部在工作区外（`vendor/*`、`packages/*`、checkout 的 `node_modules`），因此它在受限沙箱里**必然第一步就失败**（此时已有 junction 已被 `rmSync` 删掉，留下半坏状态）。要跑通只有两条路：**给完全文件权限**，或把 checkout 镜像/复制进工作区。
- **完全权限下 `niu scripts/build.sh` 实测通过**：输出 `=== Linking build dependencies ===` → `=== Compiling src → lib ===` → `tsdown ... Build complete`，无报错。重建产物与已提交的 `lib/` 对比：`lib/index.js`、`lib/client.js`、`lib/types/index.d.ts` 仅差行尾，`lib/client.js.map` 有 1 行差异（`sourcesContent` 里嵌的源码为 CRLF）——即**入库 `lib/` 与当前 `src/` 是同步的**，只是本机重建会带出 EOL 噪声。

---

## 10. 后续开发指引

### 10.1 常见改动配方

| 目标 | 需要改的点 |
| --- | --- |
| **新增一个条目字段** | ① `ShellEntry` 接口 + `ShellEntrySchema`（[src/index.ts](../src/index.ts#L83-L137)）② `normalizeEntry()` 的读取与值域收敛（[src/index.ts](../src/index.ts#L178)）③ `validateEntriesForSave()` 的保存校验（[src/index.ts](../src/index.ts#L232)）④ client `EntryStatus` / `DraftEntry` + `toDraft()` + `save()` payload（`args` 就是这个流程的样板；旧 host 的 `/status` 没有新字段，所以 `EntryStatus` 里标可选并在 `toDraft()` 兜底成空串）⑤ `buildTool()` 消费新字段（`path` → `resolveShellPath()`，`args` → `argTemplate()` + `buildArgv()`）⑥ 面板控件加在 `entryDetail()` 里（`entryRow()` 只放名称/启用/默认）。`label`（显示名）是「只给人看」的字段样板：host 侧只进 `normalizeEntry` 与 `entryLabel()` 文案，client 侧只进面板显示与 `save()` payload，**不进工具名 / 工具提示词 / 执行链** |
| **改策略生效逻辑** | 只动 [`applyPolicy()`](../src/index.ts#L863) 的逐条目循环（启用判定 / `entryProblem` / 注册）与 [`entryProblem()`](../src/index.ts#L841) 的原因集合；保持幂等守门、`disposeAll` 与按 id 的 disposer 语义 |
| **改 shell 工具行为** | [`buildTool()`](../src/index.ts#L580) 里的 `description` / `parameters` / `output.schema` / `execute`；注意 `output.schema` 嵌套 object 必须 `additionalProperties:false`，且改动后要同步 `presentResult` 的解析预期与 `renderShellResult` 的标记顺序 |
| **改提示词面** | `system-prompt/assemble` 的 `BUILT_IN_SHELL_TOOLS` 过滤集合（[src/index.ts](../src/index.ts#L59)）与 [`guidanceText()`](../src/index.ts#L910) 的文本 |
| **改设置面板 UI** | [src/client/index.ts](../src/client/index.ts)：样式长写、CSS 变量、`page` / `summary` / 折叠三视图任一分支；条目列表行 = `entryRow()`，单条目配置界面 = `entryDetail()`（新增字段就加在这两处 + `save()` payload + host 侧模型） |
| **发版** | `DSH_CHECKOUT=... bash scripts/build.sh` → 核对 `lib/` diff → 跑 `node tests/host-harness.mjs`（需完全权限）与 `node tests/executable-and-args.mjs`（沙箱内可跑）→ `npx tsc -p tsconfig.json --noEmit` 类型基线 → 提交 → `npm publish --ignore-scripts` → GitHub Release（ZIP：lib + cordis.patch.yml + package.json + LICENSE）→ 更新 README 徽章与 CHANGELOG |

### 10.2 建议的路线（按优先级）

1. **打通开发闭环**：**已完成** —— `E:\DSHSource\current` 已 bootstrap（提供 tsc / tsdown）；本仓库自身仍需先建好 junction（完全权限跑一次 `build.sh`，或手工建同样的 link），之后 `build.sh` / `npm run typecheck` 才可用。
2. **修文档漂移**：**已完成** —— capabilities-host / capabilities-client / README（中英）/ roadmap 已按 v0.1.0 同步（见 §9.1）。
3. **修引导文本**：**已完成** —— `shell-policy` section 改为函数文本，按已注册条目生成，无工具时为空。
4. **补探测候选**：**部分完成** —— 已补用户级 Git、`Git\usr\bin`、PATH 按名；仍可继续补 scoop shim 特判与 WSL。「显式路径不存在」现在会作为该条目的 `error` 显示在面板上。
5. **建立最小回归**：**已完成（host 侧）** —— `tests/host-harness.mjs`（61 项断言）+ `tests/executable-and-args.mjs`（33 项断言）；仍缺 CI 与 client 侧测试。
6. **i18n**：把 client 中文文案接到 DSH locale 服务（`@deepseek-ai/dsh-client-locale`）。
7. **与 `dsh-gitbash-shell` 的定位澄清**：两者目标重叠，选其一为主或明确互斥检测——例如对方已注册同名工具时，本插件会把该条目报为「工具名已被占用」，可据此提示用户。
8. **非 Windows 语义**（可选）：目前 Linux/macOS 直接跳过；若要做「统一 shell 策略」可扩展到 WSL / zsh。

## 11. 附录：符号索引

> 行号锚点取自 v0.1.1 源码修订（`src/index.ts` 1155 行、`src/client/index.ts` 1098 行）；其余小节中的 `#L行号` 来自更早的 v0.1.0 梳理，插入少量代码（如 v0.1.1 的 `reconcile()`）后会整体漂移若干行。**跨版本引用请按符号名在源码中重新定位**；2026-10-09 结构更正时已逐条核对，其中有 4 处失配已就地修正（`bashCandidates`、`pwshCandidates`、`disposeAll` 的清理处、`entryRow`）。

### Host（[src/index.ts](../src/index.ts)）

| 符号 | 行 | 职责 |
| --- | --- | --- |
| `name` / `inject` | [src/index.ts](../src/index.ts#L37-L38) | 插件名与注入声明 |
| `PKG_NAME` | [src/index.ts](../src/index.ts#L41) | 包名常量（反查 entry id 用） |
| `MAX_SHELL_ENTRIES` / `MAX_ARGS` / `BUILT_IN_SHELL_TOOLS` / `PWSH_PREAMBLE` | [src/index.ts](../src/index.ts#L44-L61) | 条目上限（16）、启动参数模板上限（1024）、内置 shell 工具名、PowerShell UTF-8 输出前缀 |
| `resolveOwnEntryId` | [src/index.ts](../src/index.ts#L68) | 经 loader 反查 profile entry id |
| `ShellEntry`（接口） | [src/index.ts](../src/index.ts#L83-L113) | 条目类型（`id/name/label/enabled/path/args/description/fullAccess/primary`；`path` 支持绝对路径或纯文件名） |
| `Config`（接口 + schema） | [src/index.ts](../src/index.ts#L115-L143) | 配置类型与 schemastery schema（`shells` 数组 volatile） |
| `unwrapVolatile` / `stringField` | [src/index.ts](../src/index.ts#L149-L157) | 解包 volatile 引用与字符串取值 |
| `sanitizeToolName` / `deriveToolName` | [src/index.ts](../src/index.ts#L162-L171) | 工具名清洗与默认推导（`pwsh` → `powershell`） |
| `normalizeEntry` / `normalizeEntries` | [src/index.ts](../src/index.ts#L178-L208) | 条目归一化（id 去重、字段截断、primary 唯一、上限 16） |
| `entryLabel` | [src/index.ts](../src/index.ts#L226) | 面板/错误文案里的条目名（显示名优先，留空回落工具名） |
| `validateEntriesForSave` | [src/index.ts](../src/index.ts#L232) | 保存前整表校验 |
| `readConfig` | [src/index.ts](../src/index.ts#L254) | 取最新配置快照 |
| `isPwshFamily` | [src/index.ts](../src/index.ts#L265) | 家族判定（`-Command` vs `-c`） |
| `COMMAND_PLACEHOLDER` / `isBareExecutableName` / `executablePathProblem` | [src/index.ts](../src/index.ts#L271) | 启动参数占位符、`path` 是否为纯文件名、`path` 值域校验 |
| `parseArgs` / `argTemplate` / `argTemplateProblem` | [src/index.ts](../src/index.ts#L288) | 参数文本解析、家族默认 / 自定义启动参数模板与校验（引号闭合 + 必须含 `{command}`） |
| `resolveExecutableInPath` | [src/index.ts](../src/index.ts#L407) | 在进程 PATH 里按文件名查找可执行文件 |
| `buildArgv` | [src/index.ts](../src/index.ts#L419) | 按启动参数模板构造 argv（`{command}` → 实际命令） |
| `pathCandidates` / `bashCandidates` / `pwshCandidates` | [src/index.ts](../src/index.ts#L321-L372) | PATH 与家族探测候选（无扩展名的名字补 `.exe`） |
| `defaultToolDescription` | [src/index.ts](../src/index.ts#L425) | 默认工具提示词（host 唯一来源：buildTool 回落 + `POST /defaults`） |
| `resolveShellPath` | [src/index.ts](../src/index.ts#L391) | 解析条目的可执行文件（绝对路径 / 文件名走 PATH / 留空按家族探测） |
| `EntryStatus` / `migrateLegacyEntries` | [src/index.ts](../src/index.ts#L448-L458) | 运行时状态形状与旧配置迁移 |
| `renderShellResult` | [src/index.ts](../src/index.ts#L480) | 结果文本渲染（含标记） |
| `parseExitStatus` | [src/index.ts](../src/index.ts#L504) | 从末尾拆 exit/signal 状态 |
| `ShellToolArgs` / `AppContext` | [src/index.ts](../src/index.ts#L513-L532) | 工具参数与本地 webServer 服务面声明 |
| `readJsonBody` / `collectDshEnv` | [src/index.ts](../src/index.ts#L535-L546) | 请求体读取与 `DSH_*` 环境收集 |
| `currentEntries` | [src/index.ts](../src/index.ts#L560) | 配置条目，或旧配置迁移结果 |
| `disposeAll` | [src/index.ts](../src/index.ts#L572) | 注销全部动态注册的工具 |
| `buildTool` | [src/index.ts](../src/index.ts#L580) | 单个条目的工具定义 |
| `execute` | [src/index.ts](../src/index.ts#L674) | shell 工具执行全链路（workdir → 沙箱 → argv → spawn） |
| `presentCall` / `presentResult` | [src/index.ts](../src/index.ts#L820-L826) | 终端卡片展示与 exit pill 拆分 |
| `entryProblem` | [src/index.ts](../src/index.ts#L841) | 条目不可注册的原因 |
| `applyPolicy` | [src/index.ts](../src/index.ts#L863) | 策略状态机（逐条目注册 / 注销，幂等） |
| `statusView` | [src/index.ts](../src/index.ts#L904) | `/status` 的条目运行时视图 |
| `guidanceText` | [src/index.ts](../src/index.ts#L910) | 引导提示词文本（列出工具 + primary） |
| API handler | [src/index.ts](../src/index.ts#L937-L1104) | status / shells / detect / **defaults** / preferred / bashpath |
| 提示词裁剪 | [src/index.ts](../src/index.ts#L1133-L1142) | waterfall：有工具注册时隐藏内置 bash/pwsh |
| 引导 section | [src/index.ts](../src/index.ts#L1145-L1149) | order 104 的 shell 策略文本（函数文本） |

### Client（[src/client/index.ts](../src/client/index.ts)）

| 符号 | 行 | 职责 |
| --- | --- | --- |
| `inject` | [src/client/index.ts](../src/client/index.ts#L16) | `['slots','remote']` |
| `MAX_ENTRIES` | [src/client/index.ts](../src/client/index.ts#L33) | 条目上限（与 host 一致，16） |
| `EntryStatus` / `Status` / `DraftEntry` | [src/client/index.ts](../src/client/index.ts#L36-L76) | `/status` 响应、条目运行时视图与草稿形状 |
| 样式对象 | [src/client/index.ts](../src/client/index.ts#L80-L442) | 条目行 / 表单 / 配置界面 / 按钮内联样式 |
| `ChevronIcon` | [src/client/index.ts](../src/client/index.ts#L146) | 官方同款折叠箭头 |
| `isBareExecutableName` / `argTemplateProblem` / `parseArgs`（client 侧副本） | [src/client/index.ts](../src/client/index.ts#L448) | 与 host 同规则的 `path` 值域与启动参数模板校验，仅用于保存前预校验（改 host 规则时要同步） |
| `deriveName` / `effectiveName` / `entryProblem` / `toDraft` | [src/client/index.ts](../src/client/index.ts#L500-L552) | 名称推导、客户端预校验、状态转草稿（`toDraft` 对旧 host 缺字段兜底空串） |
| `ShellPolicyCard` | [src/client/index.ts](../src/client/index.ts#L572-L1071) | 三视图配置组件（列表 ⇄ 单条目配置界面两级） |
| `editingId`（state） | [src/client/index.ts](../src/client/index.ts#L580) | 正在配置的条目 id；`null` 表示列表视图 |
| `rootRef` / `listScroll` / `listHeight`（state/ref） | [src/client/index.ts](../src/client/index.ts#L583-L585) | 面板根节点、离开列表时的滚动位置、列表视图高度（配置界面的 min-height 兜底） |
| `findScroller` / `openEntryConfig` / `backToList` / `useLayoutEffect` | [src/client/index.ts](../src/client/index.ts#L609-L669) | 视图切换的滚动保持：定位滚动容器、记/还原 scrollTop、进入配置界面时对齐卡片顶部 |
| `load` / `useEffect` | [src/client/index.ts](../src/client/index.ts#L587-L599) | 拉状态 + 文档变更订阅 |
| `update` / `setPrimary` / `addEntry` / `removeEntry` | [src/client/index.ts](../src/client/index.ts#L671-L701) | 草稿编辑（新增/删除会切换配置界面） |
| `probe` | [src/client/index.ts](../src/client/index.ts#L707) | `POST /detect`（`{name, path}`）填充路径，返回探测后的条目 |
| `fillDefaultDescription` | [src/client/index.ts](../src/client/index.ts#L731) | `POST /defaults` 取 host 默认模板：新建预填 + 「重置为默认」 |
| `save` / `discard` | [src/client/index.ts](../src/client/index.ts#L747-L779) | staged 提交与放弃（均退出配置界面） |
| `displayName` / `entryWarning` | [src/client/index.ts](../src/client/index.ts#L523) / [src/client/index.ts](../src/client/index.ts#L797) | 折叠行显示名（显示名优先，留空回落工具名）、行内问题提示 |
| `entryRow` | [src/client/index.ts](../src/client/index.ts#L808) | 折叠态条目行（显示名 + 弱化工具名 / 启用 / 默认 / 配置） |
| `entryDetail` | [src/client/index.ts](../src/client/index.ts#L863) | 单条目配置界面（显示名 / 工具名 / 可执行文件 / 提示词+重置 / 沙箱权限 / 启动参数 / 删除） |
| `editingEntry` / `controls` | [src/client/index.ts](../src/client/index.ts#L993-L1034) | 当前配置条目解析、状态行 +（列表│配置界面）+ footer |
| `apply` | [src/client/index.ts](../src/client/index.ts#L1073) | 两个槽位注册 |

### 其它

| 文件 | 作用 |
| --- | --- |
| [package.json](../package.json) | 元数据、exports、`dsh.bundle.patch`、`dsh.client` |
| [cordis.patch.yml](../cordis.patch.yml) | bundle patch（插入自身行） |
| [tsconfig.json](../tsconfig.json) / [tsdown.config.ts](../tsdown.config.ts) | host / client 构建配置 |
| [scripts/build.sh](../scripts/build.sh) | 一键构建（探测 checkout + link 依赖 + tsc + tsdown） |
| [tests/host-harness.mjs](../tests/host-harness.mjs) | 假 ctx 集成测试（61 项断言；真实 spawn git-bash / pwsh，不启动 DSH；受限沙箱下会 EPERM） |
| [tests/executable-and-args.mjs](../tests/executable-and-args.mjs) | 可执行文件（绝对路径 / 文件名走 PATH）/ 启动参数模板 / 默认提示词 / 显示名回归（33 项断言；spawn 记录型桩，沙箱内可跑） |
| [docs/conventions.md](../docs/conventions.md) | 编写规范与踩坑速查（**改动前必读**） |

---

## 12. 本次结构更正的核验记录（2026-10-09）

> 触发原因：本工作区由旧工作区手工整理而来，原文描述的"工作区根下嵌套一层仓库目录"已不成立，导致目录描述与全部相对链接失效。本次只更正**文件结构相关**部分，未扫描全项目，也未重写各功能小节的正文。

### 12.1 核验方式

1. **以文件系统与源码为准**：所有路径与符号位置均对照实际文件核实，不依赖原文自述。
2. **逐条解析链接**：把文档内 209 个 Markdown 链接逐条相对目标文件解析（相对 `docs/` 还是仓库根），而不是目测。
3. **符号定位行号**：用 PowerShell 读取源码真实行号（注意：`Get-Content | Measure-Object -Line` 会跳过空行，不能用于行号；`read` 工具的行号在空行处会滞后，两者都不可作为唯一依据）。

### 12.2 更正清单（对应"核验对象 → 检查 → 结果"）

| 核验对象 | 检查内容 | 结果 |
| --- | --- | --- |
| §2.1 目录结构 | 是否存在"工作区根 / 仓库根"两层嵌套 | **不成立**。工作区根即 git 仓库根（`E:\DSHProjects\dsh-windows-shell-policy`，`origin/main`）；已改写叙述与目录树，并补入仓库根的项目上下文文档、`docs/ARCHITECTURE.md` 自身 |
| 全文相对链接（209 个） | 链接目标能否从文档所在目录解析 | 原文 199 处带 `dsh-windows-shell-policy/` 前缀，全部失效；已改为 `../` 相对仓库根，**114 个相对链接现全部可解析** |
| `[#Lxx]` 形式的链接标签（49 处） | 标签是否有意义 | 原文标签只有 `#L37` 这类行号，已全部改为文件名标签（如 `[src/index.ts](../src/index.ts#L37)`） |
| `src/index.ts` / `src/client/index.ts` 的 `#L` 锚点 | 行号是否仍指向同一符号 | 抽查与逐条核对后**修正 4 处失配**：`bashCandidates` 356→357、`pwshCandidates` 372→373、`disposeAll` 清理处 1153-1155→572-574、`entryRow` 808→809；其余锚点与符号一致，保持不动 |
| §4.1 类型扩展两条 | 引用的行区间是否仍存在 | `JobKindMap.bash` 的 `#L31-L35` 仍准确；`AppContext` 原写 `#L524-L532` 已失效，改为文件链接（该类型现为 `src/index.ts#L524` 起） |
| L230 的 `defineTool` 链接 | 链接语法是否闭合 | 原文用全角 `）` 收尾，导致该链接整体失效；已改为普通代码引用 |
| §8 现状表 | 版本与仓库两行是否过期 | 原写 `0.1.0`、`工作区干净`、`无 node_modules`；**版本行更新为 0.1.1、仓库行补最新提交**，并注明其余各行仍是 v0.1.0 时的记录 |
| §8 web profile 行 | 是否含个人设备绝对路径 | 原写具体用户目录，已按隐私约定改为 `~/.dsh/profiles/web` 占位符（其余 `E:\DSHSource\...` 为该机共同约定的 checkout 位置，保留） |
| §9.1 同步状态表 | 是否随时间失真 | 标题去掉固化版本号，表下加注"为 v0.1.0 时的结论"，并补 4 行 2026-10-09 的实际变化（新增上下文文档、README 入口、本文档更正） |
| §11 符号索引 | 行号可信度是否说明 | 顶部加注：锚点取自 v0.1.1 修订，其余小节的 `#L` 来自更早梳理、插入代码后会漂移，跨版本引用应按符号名重新定位 |

### 12.3 本次**未**改动（需要时另行安排）

- `src/` 源码、构建配置、`lib/` 产物：本次为纯文档任务，未改动。
- §3–§7、§9.2、§10 的功能性描述：只做了链接路径修正，**未复核其内容是否仍与 v0.1.1 代码一致**（例如 §4.7 API 表的行号区间、§10.1 配方里的符号名）。—— 其中 §6、§7.3、§9.2、§10 已在同日的「开发经验复核」中补做（见文档头注）。
- 未执行构建、类型检查或测试：本轮为文档更正，按 [RUNBOOK.md](../RUNBOOK.md) 的状态标注，这些验证**尚未执行**。
