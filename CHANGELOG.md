# Changelog

本项目的所有重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
