# dsh-windows-shell-policy — 组合插件（发布轨）

Windows 默认 Shell 策略组合插件（hybrid 形态）：探测 git-bash/MSYS2/Cygwin，在「设置 → 插件 → 插件配置」提供「默认 Shell」折叠卡片切换 bash/pwsh，动态注册 bash 工具并裁剪提示词工具面。解决 Windows 上 DSH 默认走 PowerShell、agent 执行 POSIX 命令错误率高的问题（LLM 训练语料中 bash 占比远高于 PowerShell）。

## 功能

- **bash 探测**：显式 `bashPath` → Git 常见安装路径（Program Files / x86）→ MSYS2 / Cygwin → PATH，找到即用
- **配置面板**：设置 → 插件 → 插件配置「默认 Shell」折叠卡片（与官方「终端 / Agent 循环 / 网页搜索」卡片同构），显示探测状态与当前生效 shell，自动 / bash / pwsh 三选一（staged 编辑 + 保存/放弃，折叠时保留未保存标记）
- **策略生效**：`auto` 时探测到 bash 则用 bash 否则 pwsh；显式 `bash` / `pwsh` 强制对应 shell；切换下一次请求生效
- **bash 工具**：effective=bash 时动态注册（git-bash 执行，subprocess 通道，超时 / 输出截断 / exit code 标记），终端卡片展示（对话页可点击查看命令、cwd、输出与 exit 状态，与官方 shell 工具一致）
- **提示词裁剪**：`system-prompt/assemble` 中按策略隐藏 pwsh / bash，agent 工具面只保留一个 shell 工具
- **持久化**：`preferred` 写入 settings 文档 `shell-policy` section，重启保留
- **卸载即净**：`dev_uninject_plugin` 一键还原（工具注销 + 提示词恢复 + junction 清理）

## 构建与安装

```sh
# 构建（需 DSH_CHECKOUT 指向 dsh 源码 checkout）
DSH_CHECKOUT=<checkout> bash scripts/build.sh   # 产出 lib/index.js + lib/client.js + tgz
# 注入器环境内（免重启，host+UI 即时生效）
dev_inject_plugin <本目录>
# 或安装进 web profile（重启生效，双路径持久化）
node <harness>\apps\cli\lib\bin.js plugin --profile web add link:<repo>
```

## 架构说明

- **host 侧**（`src/index.ts`）：bash 探测 + settings section 注册（`installSettingsSection`）+ bash 工具动态注册（`ctx.tools.register` 返回 disposer，切换时注销）+ `system-prompt/assemble` 工具面裁剪 + webServer API（`/dsh-shell-policy/api/status`、`/preferred`）
- **client 侧**（`src/client/index.ts`）：`settings.plugin.item` slot 折叠卡片（React，tsdown 编译为 `lib/client.js`）
- **为什么卡片不走 settingsScope**：settings 的 client 端 RPC 有 apiproxy allowlist（`WEB_SETTINGS_NAMESPACES`），插件自行注册的 namespace 不会被 serve（官方注释明确这是 deferred work）。因此卡片读写走本插件自己的 host API，host 端仍经 settings 服务持久化

## 台账

- **v0.0.1（当前）**：组合插件首版。bash 探测 + 配置面板折叠卡片 + 动态工具注册 + 提示词裁剪 + 终端卡片展示。实测：注入即生效（host+UI）、配置切换下一次请求生效、git-bash 执行链路正常（echo / 管道 / ls）、折叠卡片与官方同构、卸载即净。

## 规划（待办）

- **P1 run_in_background 支持**：bash 工具后台执行（jobs 通道），与官方 tool-bash 对齐
- **P2 bashPath 面板配置**：卡片内显示 / 编辑显式 bash 路径（当前仅 settings.yaml 手动配置）
- **P3 非 Windows 平台适配**：Linux / macOS 上自动跳过（当前仅 Windows 语义）
