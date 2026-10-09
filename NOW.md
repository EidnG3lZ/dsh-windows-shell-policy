# NOW.md — 当前状态

> 接续任务时读本文件；**状态实质变化时直接修订本节**，不追加矛盾快照。
> 核验：2026-10-09，范围＝本仓库工作副本（`E:\DSHProjects\dsh-windows-shell-policy`，`main`）。

## 当前目标

仓库处于 `v0.1.1` 功能完成、**尚未提交到远端**的状态：本工作副本需要把 `v0.1.1` 的改动（折叠条目行 + 单条目配置界面、`label`、启动参数模板、PATH 文件名解析、`/defaults`、`reconcile()` 修复）整理提交并决定后续发版。**本目标是本次文档任务的推断，接续前请与仓库所有者确认优先项。**
（依据：`git log -1` = `8e7c580`（2026-10-08，描述与 v0.1.1 变更一致），[CHANGELOG.md](CHANGELOG.md) 顶部为 `[0.1.1] - 2026-10-05`。）

## 进展（事实，含证据）

| 事实 | 证据 | 状态 |
| --- | --- | --- |
| 版本 `0.1.1`，包名 `dsh-windows-shell-policy` | [package.json](package.json) | 已确认 |
| 源码规模 host ≈1086 行 / client ≈1014 行 | `Get-Content | Measure-Object -Line`（本次核对） | 已确认 |
| 最新提交 `8e7c580`（2026-10-08），分支 `main` 跟踪 `origin/main`，无 tag | `git log`/`git tag` | 已确认 |
| 工作副本仅有 1 个未跟踪文件 `docs/ARCHITECTURE.md`；其余已跟踪文件干净 | `git status --porcelain` | 已确认 |
| 测试文件断言：`tests/host-harness.mjs` 61 项、`tests/executable-and-args.mjs` 33 项 | 静态统计断言调用（本次核对）；**未实际运行** | 已确认（计数）／未执行（运行） |
| 本仓库无 `node_modules`，需先建依赖 link 才能类型检查/构建 | `Test-Path node_modules` = False | 已确认 |
| DSH checkout `E:\DSHSource\current` 已 bootstrap（有 `node_modules`），`dsh --version` = `0.2.0-rc.2` | 本次核对 | 已确认 |
| web profile 未安装本插件（`node_modules/dsh-windows-shell-policy` 不存在，bundles/deps 无该项），无 disabled/patch 残留 | 读 profile `package.json` + grep `cordis.patch.yml` | 已确认 |
| web profile 依赖里存在同类插件 `dsh-gitbash-shell@0.33.0` | profile `package.json` deps | 已确认（冲突影响未评估） |

## 阻塞

- 无硬阻塞。
- 受限文件沙箱下 `tests/host-harness.mjs` 无法运行（真实 spawn 走管道会 `EPERM`），需要完全权限会话；[RUNBOOK.md](RUNBOOK.md) 已标注。

## 下一步（建议，未执行）

1. 与所有者确认提交/发版意图，再按 [RUNBOOK.md](RUNBOOK.md)"发布"跑完整验证（两个测试 + 类型基线 + `lib/` diff）。
2. 决定是否把已同步但未跟踪的 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 纳入版本库（它目前含过期的目录描述与行号，见下"待核实/待修正"）。
3. 若要装进本机 web profile 验证 UI：改 `src/**` 后**不要**在受限沙箱跑 `build.sh`（会 `EPERM` 且删掉已有 junction），改用手动 `tsc` + `tsdown`。

## 待核实 / 待修正

- **`docs/ARCHITECTURE.md` 结构已更正（2026-10-09）**：§2.1 的两层嵌套描述与目录树已改写（仓库根＝工作区根），全文 199 处 `dsh-windows-shell-policy/` 链接前缀与 209 个相对链接已解析通过，4 处失配行号与 1 处语法损坏链接已修正，核验记录见该文档 §12。**仍待核实**：其余功能小节（§3–§7、§9.2、§10）只改了链接路径，未复核内容是否仍与 v0.1.1 代码一致；§4.7 API 表的行号区间与 §10.1 配方里的符号名需按需复核。
- npm 上是否已发布 `0.1.1`：**待核实**（本次 `npm view` 因沙箱 `EPERM` 失败，无结论）。
- DSH 桌面端 profile 是否装配本插件：**待核实**（本次只核查了 web profile）。
- `docs/ARCHITECTURE.md` §9.3 记录的 ACL 修复与回滚脚本位置属于设备私有路径，未写入本套文档，仅在该文件内保留。

## 证据入口

- 生效规则：[AGENTS.md](AGENTS.md)｜路由：[PROJECT_INDEX.md](PROJECT_INDEX.md)｜操作：[RUNBOOK.md](RUNBOOK.md)
- 变更史：[CHANGELOG.md](CHANGELOG.md)｜结构：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)｜规范与踩坑：[docs/conventions.md](docs/conventions.md)
