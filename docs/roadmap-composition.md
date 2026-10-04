# 组合插件转正施工记录

从需求到发布轨的完整施工记录（2026-08-21）。

## 需求来源

桌面计划文件《DSH-Windows-bash插件开发计划.txt》：Windows 上 DSH 默认 pwsh，LLM 训练语料 bash 占比高，agent 执行 POSIX 命令错误率高。目标：默认 bash、无 bash 回落 pwsh、配置可切换。

## 调研结论

- disabled 默认值来源：`@deepseek-ai/dsh-base` bundle 的 `cordis.patch.yml`（`!!js process.platform === 'win32'`），bundles 层而非 preset 层
- 官方 `tool-bash` 依赖 `ctx.shell`（bash-local/bash-sandbox 提供），Windows 上 bash-sandbox 也 disabled——光启用 tool-bash 不够，需自带执行器
- 官方 `bash-local` 直接 spawn `bash`（依赖 PATH），无 pwsh 那样的路径探测（`resolve.ts`）——本机 git-bash 不在 PATH，需显式路径
- 插件配置面板机制：`settings.plugin.item` slot + settings namespace；但 apiproxy 有 allowlist，插件自行注册的 namespace 不被 serve（官方 deferred work）

## 设计决策

1. **组合插件自带 bash 工具**（不依赖官方 tool-bash）：subprocess 通道执行 git-bash，动态注册/注销
2. **提示词裁剪替代工具注销**：官方 pwsh 工具在 preset 层无法运行时注销，用 `system-prompt/assemble` 过滤隐藏
3. **卡片读写走插件自己的 host API**：绕开 apiproxy settings allowlist，host 端仍经 settings 服务持久化
4. **折叠卡片 + 终端卡片**：与官方 PluginCard / TerminalBlock 同构，体验一致

## 迭代记录

1. **v0.0.1 首版**：bash 探测 + 配置面板卡片（初版非折叠）+ 动态工具注册 + 提示词裁剪 + status API。注入验证：bash 工具注册、git-bash 执行、配置切换链路全部通过
2. **卡片折叠化**：用户要求与官方卡片一致——重写为折叠式（头部 button + chevron + 展开 body + staged 保存）
3. **终端卡片**：用户发现 bash 工具行不能像 pwsh 点击查看命令——补 `presentCall`/`presentResult`（card:'terminal'），exit 标记对齐官方格式（末尾、exit 0 不报）
4. **发布轨**：README 徽章 + About 卡片 + LICENSE + GitHub 仓库 + Release v0.0.1
5. **发布补齐**：cordis.patch.yml（bundle patch 正式装配）+ package.json 元数据 + README.en + CHANGELOG + docs + 截图 + lib 提交 + Release ZIP

## 实测验证

- 注入即生效（host+UI），status API：`bashFound=true, effective=bash`（`C:\Program Files\Git\bin\bash.exe`）
- 配置面板：选 pwsh 保存 → effective 立即变 pwsh（bash 工具注销）；选 auto → 恢复 bash
- git-bash 执行：echo / 管道 / ls 正常（exit 0）
- 工具面：agent 视图 tools 里 pwsh 被过滤，只剩 bash（git-bash 描述）
- 终端卡片：对话页点击展开显示命令/cwd/输出/exit 状态
- 卸载即净：dev_uninject_plugin 一键还原

## 规划

- **P1 run_in_background 支持**：bash 工具后台执行（jobs 通道），与官方 tool-bash 对齐
- **P2 bashPath 面板配置**：卡片内显示/编辑显式 bash 路径（当前仅 settings.yaml 手动配置）
- **P3 非 Windows 平台适配**：Linux/macOS 上自动跳过（当前仅 Windows 语义）

> 说明（v0.1.0 回填）：上表 P1–P3 均已交付——P1（后台执行）与 P2（bashPath 面板，现为条目路径输入 + 探测）在 v0.0.3 落地，P3（非 Windows 跳过）同样在 v0.0.3 落地。v0.1.0 起 bashPath 面板被「shell 条目」面板取代。

## v0.1.0：多 shell 条目模型（2026-10-04 追加）

> 以上 v0.0.x 记录保留原样；本节记录从「单 shell 三选一」到「可增删 shell 条目列表」的模型改造。

### 需求

把「默认 shell：自动 / bash / pwsh 三选一 + 单个 bashPath」升级为**可添加 / 删除的自定义 shell 条目**：每条目一个启用开关和一组设置（可执行文件路径、工具提示词、是否开启沙箱完全权限）。开启完全权限的目的是让 git-bash / MSYS2 这类依赖兼容层运行的 shell 不再每次执行都触发沙箱审批。

### 设计决策

1. **一个条目 = 一个工具**：逐条目 `ctx.tools.register`，条目失败彼此隔离（原因写进该条目的 `EntryStatus.error`，面板可见），不再用单一的 effective=bash|pwsh 状态机。
2. **工具名默认由可执行文件名推导**（去扩展名 + 非法字符换 `_`）：`pwsh` 因与 DSH 内置工具重名默认改叫 `powershell`；启用条目间必须唯一，`run_code` 是保留名。内置工具无法运行时注销，重名条目只能注册失败并在面板提示改名。
3. **全 access 跳过 `sandbox.confine`**：等同 `danger-full-access`，因此不再出现沙箱拒绝→升级审批；该工具也不再向模型暴露 `sandbox_permissions`/`justification`（硬塞会报错）。
4. **提示词裁剪规则改为「有工具注册成功就隐藏内置 bash/pwsh」**：只隐藏名字未被本插件条目占用的内置工具；全部条目停用 / 不可用即回到 DSH 原始工具面（不注册、不裁剪）。
5. **引导提示词改为函数文本**（`shell-policy`，order 104）：列出已注册的 shell 工具并按 `primary` 推荐优先项，没有工具时文本为空。
6. **配置写入仍走自带 HTTP API**：新增 `POST /shells`（归一化 + 校验 + `settings.mutate(entryId, [{op:'set', path:['shells'], value}])`）与 `POST /detect`（探测候选），并保留 `/preferred`、`/bashpath` 兼容旧客户端。
7. **旧配置迁移**：条目数组为空时，由 `preferred`/`bashPath` 在内存里映射等价条目（`pwsh` → 未启用的 `powershell` 条目，其余 → 启用的 `bash` 条目），首次保存时落盘。

### 实测验证（假 ctx 集成测试）

`tests/host-harness.mjs`（45 项断言，`node tests/host-harness.mjs`）：Config schema 默认值与条目默认值、全新安装迁移为启用的 bash 条目、真实 spawn git-bash 执行并校验 exit code / stdout / stderr、渲染标记与终端卡片 exit pill 拆分、`system-prompt/assemble` 隐藏内置 pwsh 且保留自身 bash、引导文本、`/status` `/shells` `/detect` API（含重复工具名 400、合法条目写入 settings）、`fullAccess` 不调用 confine 且隐藏 / 拒绝升级参数、PowerShell 方言（`-Command`）、工具名冲突（内置占用 / 条目重复）、旧 pwsh 配置迁移、全部停用不注册不裁剪且引导文本为空，以及后台任务通道（JobOutcome / readOutput / 通用卡片）、registry 级 output schema 与参数校验、真实 settings 服务的 volatile 契约（`isVolatilePath(Config,['shells'])`）。

> 注意：脚本用管道捕获子进程输出，受限文件沙箱下 spawn 管道会 EPERM，需在完全权限下运行。

### 已知限制（v0.1.0）

- 条目上限 16 条；工具名 `run_code` 保留，`pwsh`（Windows 内置）不可用。
- 系统提示按会话快照：已开始的会话可能仍看到旧引导文本（新会话干净）。
- 仅 Windows 语义：非 Windows 只注册状态 API，不注册工具、不裁剪提示词。
- 路径探测未覆盖 WSL 与非 `bash.exe` 命名的 shell（需显式填写路径）。
