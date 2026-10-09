# RISKS.md — 有证据的问题、风险与验证缺口

> 任务涉及对应风险时读本文件。**只写有依据的条目**，每条给出来源；状态变化时更新，不堆积过期条目。
> 核验：2026-10-09，范围＝本仓库 `v0.1.1`。代码级细节的完整清单在 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §9.2（不在此重复正文，只列要点与影响面）。

## 风险登记

| # | 风险 / 问题 | 影响 | 现有保护 | 来源 |
| --- | --- | --- | --- | --- |
| R1 | **沙箱完全权限（`fullAccess`）条目绕过文件沙箱**，而 session 策略仍可能是 `workspace-write`，运行上下文仍告诉模型"写入受限于工作区" | 模型可能误判写入边界；被启用该开关的 shell 实际不受限 | 条目级显式开关、工具描述里说明、不暴露升级参数；改该链路前读本条 | ARCH §9.2 第 3 条、RM 设计决策 3 |
| R2 | **HTTP API 无鉴权**（`/shells`、`/detect`、`/defaults`、旧的 `/preferred`、`/bashpath`），请求体手写拼接且**无体积上限** | 能访问该端口的本地进程 / 跨源请求即可改配置 | 依赖 `webServer` 自身访问控制（web 端有认证、桌面端需 token）；仅做形状与值域校验 | ARCH §9.2 第 6 条 |
| R3 | **条目错误只对面板可见**：注册失败（未找到可执行文件 / 工具名被占用 / 重名 / 注册抛错）只写进该条目状态并经 `/status` 暴露，模型侧看不到 | 用户不打开面板就不知道某条目没生效；模型可能以为自己有某个 shell | 面板折叠行的问题圆点 + `title` 原因 + 配置界面运行时状态 | ARCH §9.2 第 1 条、CH 0.1.1 |
| R4 | **host 与 client 各有一份解析规则**（`isBareExecutableName`/`executablePathProblem`/`argTemplateProblem`/`parseArgs`，client 见 `toDraft()` 兜底） | 只改一边会造成保存校验与实际执行不一致 | 规范中明确"改 host 规则要同步 client"；client 对旧 host 缺字段用 `?? ''` 兜底 | CV、ARCH §10.1 |
| R5 | **升级提示依赖注册时快照**：`escalationModes` 在 `buildTool()` 里按条目 `fullAccess` 与组合能力算一次并闭包捕获 | 组合变化后需重新 apply 才更新；与 D8 同源（volatile 不重挂） | `reconcile()` 兜底对齐 | ARCH §9.2 第 8 条 |
| R6 | **探测候选不完整**：未覆盖 WSL 与 scoop shim 特判；非 `bash.exe` 命名的 shell 需显式路径或放进 PATH | 部分环境需要手工填路径，否则条目报"未探测到可执行文件" | 显式路径 / 纯文件名 + 面板「探测」按钮；未命中时按条目报错 | ARCH §9.2 第 4 条、§10.2 第 4 项 |
| R7 | **不加载登录/交互 profile**：bash 固定 `-c`、PowerShell 固定 `-NoProfile -NonInteractive` | `.bashrc` / `$PROFILE` 里的环境不生效，用户可能误以为已加载 | 与官方 shell 工具语义一致；可用 `args` 模板自行调整 | ARCH §9.2 第 5 条 |
| R8 | **无 CI / lint / format 配置**；client 侧无自动化测试 | 回归依赖人工执行；client UI 改动只能靠手动验证 | 两个本地测试脚本（61 / 33 项断言，计数为 2026-10-09 静态统计） | ARCH §9.2 第 9 条 |
| R9 | **系统提示与工具面刷新时机不同**：sections 按会话快照，tools 按请求刷新 | 已开始的会话可能仍看到旧引导文本，用户以为配置没生效 | 文档/README 已说明"新会话生效" | CV「Host 侧」、CH 0.1.0 |
| R10 | **与同类插件 `dsh-gitbash-shell` 目标重叠** | 同时启用可能争抢同名工具 / 提示词面（本机会把冲突条目报"工具名已被占用"） | 冲突时条目级报错、互不影响其它条目；选型需人工决定 | ARCH §8、§10.2 第 7 项 |

## 验证缺口（未验证 ≠ 通过）

| 缺口 | 说明 |
| --- | --- |
| 本次会话**未运行**任何测试或类型检查 | 仓库无 `node_modules`；受限沙箱下 `host-harness` 会 `EPERM`。见 [NOW.md](NOW.md) |
| 本机 web profile **未安装**本插件 | 因此 `v0.1.1` 的面板交互（折叠行、滚动保持、`/defaults` 预填）在本机**未做安装验证** |
| `docs/ARCHITECTURE.md` 的行号仍会漂移 | **目录描述与全部链接已于 2026-10-09 更正**（核验记录见该文档 §12）；但各处 `#L行号` 来自更早修订，插入代码后会整体漂移（§11 为 v0.1.1 行号），引用前按符号名在源码中复核 |
| `docs/ARCHITECTURE.md` 的 §3–§7、§9.2、§10 内容未复核 | 这些小节本次只改了链接路径，未核对是否仍与 v0.1.1 代码一致（如 §4.7 API 行号区间、§10.1 配方符号名） |
| npm / GitHub Release 的实际发布状态 | 本次 `npm view` 因沙箱 `EPERM` 失败，**待核实** |
| 桌面端 profile 装配状态 | 本次未检查，**待核实** |

## 已缓解的历史问题（保留以免重犯）

- **装进 profile 后 `failed to import`**（裸包名）→ 已由 D7 修复。见 [DECISIONS.md](DECISIONS.md) D7。
- **面板保存后修改"消失"**（volatile-only 不重挂插件）→ 已由 `reconcile()` 修复。见 [DECISIONS.md](DECISIONS.md) D8。
- 工作区 ACL 导致沙箱写入失败的历史事件：记录在 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §9.3（含设备私有路径，不入本文件）。
