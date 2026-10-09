# NOW.md — 当前状态

> 接续任务时读本文件；**状态实质变化时直接修订本节**，不追加矛盾快照。
> 核验：2026-10-09，范围＝本仓库工作副本（`E:\DSHProjects\dsh-windows-shell-policy`，`main`）。

## 当前目标

仓库处于 `v0.1.1` 功能完成、**源码已完成模块化拆分（2026-10-09，本次会话）、尚未提交到远端**的状态：`src/index.ts`（1155 行）与 `src/client/index.ts`（1098 行）已按职责拆为 `src/host/`（9 个模块）与 `src/client/`（8 个模块），`lib/` 已重新生成，长期文档已同步。下一步是复核本次改动并提交，再决定发版。**该优先项请与仓库所有者确认。**
（依据：本次会话的拆分产物与验证结果（见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §13）；`git log -1` 仍为 `8e7c580`。）

## 进展（事实，含证据）

| 事实 | 证据 | 状态 |
| --- | --- | --- |
| 版本 `0.1.1`，包名 `dsh-windows-shell-policy` | [package.json](package.json) | 已确认 |
| 源码已拆分：host `src/index.ts` 38 行 facade + `src/host/*.ts` 9 个模块（最大 302 行）；client `src/client/*.ts` 8 个模块（最大 400 行） | 本次会话直接编辑 `src/**` 并重建 `lib/**`；结构与行数见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §2.1 | 已确认 |
| 最新提交 `8e7c580`（2026-10-08），分支 `main` 跟踪 `origin/main`，无 tag | `git log`/`git tag` | 已确认 |
| 工作副本含本次拆分改动（新增 `src/host/`、`src/client/*.ts`、`lib/host/`、`lib/types/host/`，修改 `src/index.ts`、`src/client/index.ts`、`lib/*` 与文档） | `git status --porcelain`（本次会话） | 已确认 |
| 测试已实际运行：`tests/host-harness.mjs` 61/61、`tests/executable-and-args.mjs` 33/33 | 本次会话在完全权限下运行，命令与结果见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §13.2 | 已通过 |
| 本仓库无入库的 `node_modules`；本次会话用 `bash scripts/build.sh`（`DSH_CHECKOUT=E:\DSHSource\current`，完全权限）临时建立 junction 以构建/测试 | `git status` 不含 `node_modules`（被 `.gitignore` 忽略） | 已确认（junction 未入库） |
| DSH checkout `E:\DSHSource\current` 已 bootstrap（有 `node_modules`），`dsh --version` = `0.2.0-rc.2` | 本次核对 | 已确认 |
| web profile 未安装本插件（`node_modules/dsh-windows-shell-policy` 不存在，bundles/deps 无该项），无 disabled/patch 残留 | 读 profile `package.json` + grep `cordis.patch.yml` | 已确认 |
| web profile 依赖里存在同类插件 `dsh-gitbash-shell@0.33.0` | profile `package.json` deps | 已确认（冲突影响未评估） |

## 阻塞

- 无硬阻塞。
- 受限文件沙箱下 `tests/host-harness.mjs` 无法运行（真实 spawn 走管道会 `EPERM`），需完全权限会话；本次会话已在完全权限下运行并通过（见上）。

## 下一步（建议，未执行）

1. 复核本次拆分并提交（`src/`、`lib/`、文档）；提交前按 [RUNBOOK.md](RUNBOOK.md)“发布”核对 `lib/` diff。
2. 决定是否补一条 **client 类型基线**：`src/client` 被 `tsconfig.json` 的 `exclude` 排除，现有类型基线不覆盖它（本次用临时 config 检查，发现 9 条**拆分前就存在**的诊断，详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §13.3）。
3. 若要装进本机 web profile 验证 UI：改 `src/**` 后**不要**在受限沙箱跑 `build.sh`（会 `EPERM` 且删掉已有 junction），改用手动 `tsc` + `tsdown`（[RUNBOOK.md](RUNBOOK.md)）。

## 待核实 / 待修正

- **`docs/ARCHITECTURE.md`**：结构更正（同日 §12）与模块拆分同步（同日 §13）已完成——目录树、§4/§5 模块表、§11 符号索引按新模块改写，全文 `#L行号` 锚点改为模块文件链接。**仍待核实**：§3–§10 的功能性描述未随拆分逐句复核（链接已指向正确模块）。
- npm 上是否已发布 `0.1.1`：**待核实**（本次 `npm view` 因沙箱 `EPERM` 失败，无结论）。
- DSH 桌面端 profile 是否装配本插件：**待核实**（本次只核查了 web profile）。
- `docs/ARCHITECTURE.md` §9.3 记录的 ACL 修复与回滚脚本位置属于设备私有路径，未写入本套文档，仅在该文件内保留。

## 证据入口

- 生效规则：[AGENTS.md](AGENTS.md)｜路由：[PROJECT_INDEX.md](PROJECT_INDEX.md)｜操作：[RUNBOOK.md](RUNBOOK.md)
- 变更史：[CHANGELOG.md](CHANGELOG.md)｜结构：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)｜规范与踩坑：[docs/conventions.md](docs/conventions.md)
