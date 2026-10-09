# dsh-windows-shell-policy — Windows 多 Shell 策略插件

中文 | [English](README.en.md)

![Shell 工具配置面板](docs/screenshots/shell-policy-card.png)

[![npm version](https://img.shields.io/npm/v/dsh-windows-shell-policy)](https://www.npmjs.com/package/dsh-windows-shell-policy)
[![npm downloads](https://img.shields.io/npm/dw/dsh-windows-shell-policy)](https://www.npmjs.com/package/dsh-windows-shell-policy)
[![GitHub release](https://img.shields.io/github/v/release/LAN-TINA-WS/dsh-windows-shell-policy)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest)
[![GitHub downloads](https://img.shields.io/github/downloads/LAN-TINA-WS/dsh-windows-shell-policy/total)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases)
[![GitHub stars](https://img.shields.io/github/stars/LAN-TINA-WS/dsh-windows-shell-policy)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy)
[![license](https://img.shields.io/github/license/LAN-TINA-WS/dsh-windows-shell-policy)](LICENSE)

## dsh-windows-shell-policy

DeepSeek Harness 的 **Windows 多 Shell 策略插件**。DSH 在 Windows 上默认只提供 PowerShell（官方 `pwsh` 工具），而 LLM 训练语料中 bash 占绝对多数，agent 执行 POSIX 命令时错误率显著升高。本插件把「用哪个 shell」变成一组**可增删的 shell 条目**：每条目独立启用，填写或自动探测可执行文件路径，自定义模型可见的工具提示词，并可按需开启**沙箱完全权限**——git-bash 这类依赖兼容层、需要写临时目录或工作区外的 shell 因此不再每次触发沙箱审批。每个启用且可用的条目注册为一个独立 shell 工具，多个 shell 可以同时启用。

> [最新 Release](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest) · [dsh-plugin 生态](https://github.com/topics/dsh-plugin) · [反馈](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/issues/1)

## 成品展示

![shell 终端卡片](docs/screenshots/bash-terminal-card.png)

| 能力 | 说明 |
| --- | --- |
| 多 shell 条目 | 面板内任意增删条目（上限 16 条）；列表里每条目**折叠成一行**（名称 / 启用 / 默认），其余设置收进各自的「配置」界面。每个启用且可用的条目注册为一个独立 shell 工具，可同时启用多个 |
| 条目显示名 | 每个条目可设「显示名」，面板里用它区分**工具名相同**的 shell（例如两个 `bash` 条目可以叫 `Git Bash` 与 `Cygwin`）；留空回落到工具名。只影响面板显示与错误提示，不进入工具面 |
| 自动探测 | 路径留空时按家族探测：Git for Windows（系统级 / 用户级 / `usr\bin`）、MSYS2、Cygwin、PowerShell 7、Windows PowerShell 5.1、PATH；每条另有「探测」按钮 |
| 工具提示词 | 每条目自定义模型看到的工具说明，留空使用默认模板（fresh shell、`workdir`、exit code 约定） |
| 沙箱完全权限 | 条目级开关：跳过文件沙箱 `confine`（等同 `danger-full-access`），执行不再逐次审批，该工具也不再暴露 `sandbox_permissions`/`justification` |
| 可执行文件与启动参数 | 可执行文件可填绝对路径，也可只填文件名（填文件名时用 PATH 里的那个，无扩展名自动补 `.exe`）；启动参数是可执行文件之后**全部**参数的模板（`{command}` 占位实际命令），因此连 `-c` 这类取命令的开关也能改 |
| 默认项 | 多个 shell 同时启用时用「默认」单选标记优先使用的 shell，引导提示词据此推荐 |
| 提示词裁剪 | 只要有条目注册成功，就在 `system-prompt/assemble` 隐藏 DSH 内置 `bash`/`pwsh`；全部条目停用时保持 DSH 原始工具面 |
| 条目级错误 | 路径未找到、工具名被内置工具或其它插件占用、启用条目间重名、注册抛错都只影响该条目，面板显示原因，其余条目照常工作 |
| 终端卡片 | 与官方 shell 工具一致：对话页可点击查看命令、cwd、输出与 exit 状态标记 |
| 持久化 | 条目写入本插件 profile entry config 的 `shells` 数组，重启保留；旧版 `preferred`/`bashPath` 在首次加载时自动迁移为等价条目 |
| 卸载即净 | `dsh plugin --profile web remove` 或 `dev_uninject_plugin` 一键还原 |

## 快速安装

**GitHub 直装（推荐，国内网络最快，免等 npm）**：

```sh
dsh plugin --profile web add github:LAN-TINA-WS/dsh-windows-shell-policy
# 重启 dsh web，打开「插件」页 → 本插件详情页 → 「Shell 工具」面板开始配置
```

**npm 安装（一条命令）**：

```sh
dsh plugin --profile web add dsh-windows-shell-policy
```

**Release ZIP 安装**：

1. 从 [Releases](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest) 下载 `dsh-windows-shell-policy-v*.zip` 并解压
2. `dsh plugin --profile web add link:<解压目录>`
3. 重启 `dsh web`，打开「插件」页 → 本插件详情页 → 「Shell 工具」面板开始配置

**注入器安装（免重启，开发环境）**：

```sh
DSH_CHECKOUT=<checkout> bash scripts/build.sh   # 产出 lib/index.js + lib/client.js
dev_inject_plugin <本目录>                      # host+UI 即时生效
```

## 配置指南

在「插件」页打开本插件详情页，面板「Shell 工具」即为条目列表。列表里每条目**折叠成一行**，只显示名称、「启用」与「默认」；点行尾的「配置」进入该条目**单独的配置界面**，改完点「‹ 返回列表」回来：

| 控件 | 位置 | 行为 |
| --- | --- | --- |
| 条目名 | 列表 | **只读**显示该条目的**显示名**（留空回落到工具名；再留空则按可执行文件名推导，弱化色显示）；显示名与工具名不同时名字后面用弱化色补一个工具名 |
| 启用 | 列表 | 开关；只有启用的条目才会注册为 shell 工具 |
| 默认 | 列表 | 单选；多个 shell 启用时，引导提示词优先推荐它 |
| 配置 | 列表 | 打开该条目单独的配置界面（显示名、工具名、路径、PATH、提示词、启动参数、沙箱权限与删除都在里面） |
| 显示名 | 配置界面 | 面板里区分条目的名字（例如 `Git Bash` / `Cygwin`）。留空用工具名。只影响面板显示与错误提示，模型看到的仍是工具名 |
| 工具名 | 配置界面 | **模型看到的**工具名。留空按可执行文件名推导（`pwsh.exe` 因与 DSH 内置工具重名会推导为 `powershell`）；启用条目间必须唯一（重名会被保存拒绝，提示里用对方的显示名标识是哪一条），`run_code` 是 DSH 保留名 |
| 可执行文件 | 配置界面 | 填**绝对路径**，或只填**文件名**（如 `bash.exe`，此时在 PATH 里查找）；留空则按家族自动探测（Git / MSYS2 / Cygwin / PowerShell / PATH），也可点「探测」按当前名称填入第一个命中的候选 |
| 启动参数 | 配置界面 | 可执行文件之后**全部**参数的模板，`{command}` 会被替换成实际命令。留空用家族默认（bash `-c {command}`、PowerShell `-NoLogo -NoProfile -NonInteractive -Command {command}`）；要换掉 `-c` 这类开关就改这里，例如 `-l -c {command}`、`-Command {command}`，甚至只写 `{command}`。空白分隔，双引号分组（必须含 `{command}` 且引号闭合） |
| 工具提示词 | 配置界面 | 模型看到的工具说明；**新建条目会自动填入默认模板**，改乱了可点标签行右侧「重置为默认」按当前名称/路径/启动参数重新生成（模板只在 host 存在一份） |
| 沙箱完全权限 | 配置界面 | 跳过文件沙箱 `confine`（等同 `danger-full-access`），执行不再逐次审批 |
| 添加 shell / 删除 | 列表 / 配置界面 | 增删条目（最多 16 条，至少保留 1 条）；「添加 shell」新建后直接进入它的配置界面，「删除」在配置界面里 |
| 保存 / 放弃 | 两者 | staged 编辑；保存前做客户端校验（重名、`run_code`、可执行文件需绝对路径或纯文件名、启动参数需含 `{command}` 且引号闭合），整表写入配置；保存或放弃后回到列表 |

- 条目名旁出现红色 `!` 圆点表示该条目有问题（鼠标悬停看原因），点「配置」可见完整原因与运行时状态。
- 想同时启用两个同类 shell（例如 Git Bash 与 Cygwin）：**工具名必须唯一**（模型侧），但显示名可以随意取名——例如工具名 `bash` / `cygwin_bash`，显示名 `Git Bash` / `Cygwin`，列表里按显示名区分。
- 列表与配置界面来回切换会**保持滚动位置**：进入配置界面时顶部对齐，返回列表回到离开时的位置（不会因为页面高度变化丢进度）。
- 条目保存后下一次请求生效；引导文本按会话快照，新会话才看到新内容。
- 配置持久化在本插件的 profile entry config（`shells` 数组），重启保留；旧版 `preferred`（auto/bash/pwsh）与 `bashPath` 在 `shells` 为空时自动映射为等价条目，首次保存时落盘。
- 文件沙箱为 `danger-full-access` 时条目同样不 `confine`；本插件仅 Windows 生效，Linux/macOS 上不注册工具、不裁剪提示词。

## 反馈

问题、需求、使用体验：提交到 [issue #1（欢迎反馈）](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/issues/1)。

## 贡献者

| 贡献者 | 贡献 |
| --- | --- |
| [LAN-TINA-WS](https://github.com/LAN-TINA-WS) | 项目作者与维护者 |

## License

本项目采用 [MIT License](LICENSE)。

## 项目上下文文档（供 AI 与协作者接续）

接手任务时先读 [AGENTS.md](AGENTS.md)（长期规则与读写约定），再按 [PROJECT_INDEX.md](PROJECT_INDEX.md) 路由到具体文件：

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 长期规则：读取规则、写入规则、权威来源分工、验证要求 |
| [PROJECT_INDEX.md](PROJECT_INDEX.md) | 简短项目定位 +「任务 → 文件/章节」路由 |
| [NOW.md](NOW.md) | 当前目标、进展、阻塞、下一步与证据入口 |
| [MAP.md](MAP.md) | 目录、版本、构建工具链、profile/部署与配置持久化映射 |
| [RUNBOOK.md](RUNBOOK.md) | 有依据的操作步骤、前置条件与验证（含执行状态标注） |
| [DECISIONS.md](DECISIONS.md) | 已确认决策、理由、范围与来源 |
| [RISKS.md](RISKS.md) | 有证据的风险、验证缺口与保护措施 |
| [history/README.md](history/README.md) | 历史记录索引（按需检索，不默认读取） |

## 开发者文档

开发工艺（编写规范、DSH 能力清单、组合插件转正流程）见 [docs/](docs/)：

| 文档 | 内容 |
| --- | --- |
| [conventions.md](docs/conventions.md) | 插件编写规范与常见失败速查 |
| [capabilities-host.md](docs/capabilities-host.md) | DSH Host 服务/事件清单（本插件用到的） |
| [capabilities-client.md](docs/capabilities-client.md) | DSH Client 槽位/服务清单（本插件用到的） |
| [roadmap-composition.md](docs/roadmap-composition.md) | 组合插件转正施工记录 |

仓库结构：`src/`（host + client 源码）、`tests/`（假 ctx 集成测试）、`scripts/`（构建）、`docs/`（文档与截图）、`cordis.patch.yml`（bundle patch 装配）。
