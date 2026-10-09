# PROJECT_INDEX.md — 任务路由索引

> 条件路由，不是必读清单：只在需要定位时读本文件，再进入目标章节。
> 项目定位与使用见 [README.md](README.md)；长期规则见 [AGENTS.md](AGENTS.md)。
> 核验：2026-10-09，范围＝本仓库（版本 0.1.1）。

## 一句话定位

`dsh-windows-shell-policy` 是 **DeepSeek Harness（DSH）的 Windows 多 shell 策略插件**（bundle 插件，含 host + client 两半）：把"用哪个 shell"变成一组可增删的 shell 条目，每个启用且可用的条目注册为一个独立 shell 工具，并隐藏 DSH 内置 `bash`/`pwsh`。

## 任务 → 位置

| 你要做的事 | 去这里（只读该文件的相关小节） |
| --- | --- |
| 了解项目用途、安装、配置面板怎么用 | [README.md](README.md)（/ [README.en.md](README.en.md)） |
| 接手任务、了解当前进展与阻塞 | [NOW.md](NOW.md) |
| 建立/恢复开发环境、构建、类型检查、跑测试 | [RUNBOOK.md](RUNBOOK.md) |
| 搞清目录、版本、profile/部署位置 | [MAP.md](MAP.md) |
| 理解代码结构与符号在哪里 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（§4 host、§5 client、§11 符号索引） |
| 改 host 条目模型 / 探测 / 启动参数 / HTTP API | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §4 与 §10.1，再读 [src/index.ts](src/index.ts) |
| 改设置面板 UI | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §5.2–5.3，再读 [src/client/index.ts](src/client/index.ts) |
| 新增条目字段（贯穿 host+client） | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §10.1"新增一个条目字段"配方 |
| 改提示词裁剪 / 引导文本 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §4.9、[docs/capabilities-host.md](docs/capabilities-host.md) |
| 查 DSH host 服务与事件 | [docs/capabilities-host.md](docs/capabilities-host.md) |
| 查 DSH client 槽位与服务 | [docs/capabilities-client.md](docs/capabilities-client.md) |
| 改编码规范相关行为 / 踩坑 | [docs/conventions.md](docs/conventions.md) |
| 发版、写 CHANGELOG | [RUNBOOK.md](RUNBOOK.md)"发布" + [CHANGELOG.md](CHANGELOG.md) |
| 为什么当初这么设计 | [DECISIONS.md](DECISIONS.md)；立项过程见 [docs/roadmap-composition.md](docs/roadmap-composition.md) |
| 已知风险与技术债 | [RISKS.md](RISKS.md)（代码级细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §9.2） |
| 追溯历史记录 | [history/README.md](history/README.md) → 先搜索再读 |
| 看测试覆盖什么 | [tests/host-harness.mjs](tests/host-harness.mjs)、[tests/executable-and-args.mjs](tests/executable-and-args.mjs)（先看文件头注释） |

## 快速事实（需要精确数值时去权威位置复核）

| 项 | 值 |
| --- | --- |
| 包名 / 版本 | `dsh-windows-shell-policy` / `0.1.1`（[package.json](package.json)） |
| 入口 | host `lib/index.js`、client `lib/client.js`、bundle patch `cordis.patch.yml` |
| 源码规模 | `src/index.ts` ≈1086 行、`src/client/index.ts` ≈1014 行 |
| 平台 | 仅 Windows 生效；bundle 的 client `platform: web` |
| 权威文档入口 | 本文件 + [AGENTS.md](AGENTS.md) |

## 维护约定

- 入口或职责变化时更新本表；**不在此复制专题正文**（正文只留一个权威位置）。
- 新增专题文档时，先确认是否已有等价文件/章节可承载，避免重复建档。
