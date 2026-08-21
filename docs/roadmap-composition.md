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
