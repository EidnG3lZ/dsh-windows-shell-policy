# DECISIONS.md — 已确认的决策、理由、范围与来源

> 涉及相关选择时读本文件。**只记录已确认的决定**；建议/计划不写在这里（放 [NOW.md](NOW.md) 或 [docs/roadmap-composition.md](docs/roadmap-composition.md)）。
> 决策被替代时，修订条目并注明替代关系，不追加矛盾快照。核验：2026-10-09，范围＝本仓库 `v0.1.1`。
> 来源缩写：`代码`＝当前源码（本次核对符号存在性）、`CH`＝[CHANGELOG.md](CHANGELOG.md)、`RM`＝[docs/roadmap-composition.md](docs/roadmap-composition.md)、`ARCH`＝[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、`CV`＝[docs/conventions.md](docs/conventions.md)。

| # | 决策 | 理由 | 范围 / 影响 | 来源 |
| --- | --- | --- | --- | --- |
| D1 | **一个 shell 条目 = 一个独立工具**（逐条目 `ctx.tools.register`），而不是单一 `effective=bash\|pwsh` 状态机 | 条目失败互相隔离；多 shell 可同时启用；错误只影响该条目 | `applyPolicy()` / `disposeAll()` / `buildTool()`；条目上限 16 | RM「设计决策 1」、ARCH §4.4 |
| D2 | **不依赖官方 `tool-bash`，自带执行器** | Windows 上官方 `tool-bash` 依赖的 `ctx.shell`（bash-local/bash-sandbox）本身 disabled，且 `bash-local` 直接 spawn `bash`（依赖 PATH，无路径探测） | 执行链全部自持（workdir、沙箱、argv、spawn、渲染） | ARCH §1 |
| D3 | **启动参数做成"可执行文件后全部参数的模板"**（`args` + `{command}` 占位），而非"追加参数" | 命令是 argv 最后一个元素；这样连 `-c`/`-Command` 这种"取命令开关"都能替换，host 不必猜哪个开关取命令 | `argTemplate()` / `parseArgs()` / `buildArgv()`；保存校验强制含 `{command}` 且引号闭合 | CV「argv 模板化」、ARCH §4.3 |
| D4 | **默认工具提示词只有 host 一份**（`defaultToolDescription()`，经 `POST /defaults` 给面板预填与"重置为默认"） | 两边各抄一份必然漂移 | client 不得复制模板文本 | CV「默认提示词只有一份」、ARCH §4.5 |
| D5 | **有工具注册成功就隐藏 DSH 内置 `bash`/`pwsh`**（`system-prompt/assemble` waterfall 内 `await next()` 后过滤）；全部条目停用则不裁剪 | 内置工具在 preset 层无法运行时注销，只能靠过滤；未占用内置名时不允许条目"带伤注册" | `BUILT_IN_SHELL_TOOLS` / `registeredNames` | CH 0.1.0、ARCH §4.9 |
| D6 | **面板读写走插件自带 HTTP API**（`/dsh-shell-policy/api/*`），host 端再经官方 `settings` 服务落盘 | settings 的 client 端 RPC 有 apiproxy allowlist（`WEB_SETTINGS_NAMESPACES`），本插件 entry 不在其中，浏览器侧拿不到 | 新增任何面板字段都要同时改 API 与 client fetch | ARCH §4.7、CH 0.1.0 |
| D7 | **运行期 `import` 一律使用发布名** `@deepseek-ai/schemastery` / `@deepseek-ai/cordis`；`peerDependencies` 同样用发布名 | `schemastery`/`cordis` 只是 `build.sh` 的编译期本地别名；装进 `profiles/<name>/node_modules` 后裸名会 `ERR_MODULE_NOT_FOUND`（v0.1.0 真实故障，v0.1.1 修复） | 任何新增非 `node:` 内建 import 前先确认 | CH 0.1.1「修复」、CV |
| D8 | **配置字段必须标 `.volatile()`，且插件必须自行处理 volatile-only 更新** | 0.2.0 只投影 `meta.volatile` 字段；且 volatile-only 更新不重挂插件（`_commitVolatile` 原地更新 + 发 `loader/volatile-update`，`apply` 不再执行） | `Config` schema + `reconcile()`（在 `loader/volatile-update`、`/status`、`system-prompt/assemble` 处幂等对齐） | CV「volatile-only 配置更新不会重挂插件」、CH 0.1.1「修复」 |
| D9 | **沙箱完全权限做成条目级开关 `fullAccess`**：跳过 `sandbox.confine`（等同 `danger-full-access`），且该工具不向模型暴露 `sandbox_permissions`/`justification` | git-bash / MSYS2 这类依赖兼容层的 shell 每次越界写入都会触发沙箱拒绝→审批，体验不可用 | 条目级、per-tool；与 session 策略并存时语义见 [RISKS.md](RISKS.md) | CH 0.1.0、RM「设计决策 3」 |
| D10 | **`path` 允许"纯文件名"，走 PATH 解析且不回落家族候选**；`label`（显示名）只用于面板显示与错误文案，不进工具名/提示词/执行链 | 填文件名便于配置；不回落避免"填了 A 却起了 B"；字段分两用避免把给人看的名字混进工具面 | `isBareExecutableName()` / `resolveExecutableInPath()` / `entryLabel()` | CH 0.1.1、ARCH §4.3 |
| D11 | **client 中文 UI 文案硬编码，无 i18n 层** | 当前取舍是优先交付与低复杂度过 | client 校验/状态文案、host API 错误均为中文字面量；接 locale 服务是后续项 | ARCH §9.2 第 10 条 |
| D12 | **`lib/` 构建产物刻意入库** | Release ZIP 与 `link:` 安装直接吃现成产物 | `.gitignore` 不忽略 `lib/`；发版前必须复核 `lib/` diff | ARCH §2.1、[MAP.md](MAP.md) §1 |
| D13 | **以 bundle patch 装配为正式安装路径**（包内 `cordis.patch.yml` + `dsh.bundle.patch` 声明） | `dsh plugin add github:...` 一条命令完成装配 | 装配入口 = `cordis.patch.yml` 的 insert 行 | CV「发布」、ARCH §6.3 |

## 变更记录

- 2026-10-09：首次建立本文件（覆盖 v0.0.1–v0.1.1 已确认决策，来源为现有代码与文档，未新增未经证实的决策）。
