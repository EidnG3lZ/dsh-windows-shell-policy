# RUNBOOK.md — 操作、前置条件与验证

> 执行对应操作前读本文件。核验：2026-10-09，范围＝本仓库（Windows + git-bash 环境为主）。
> **执行状态约定**：表中每条命令都标注"本次会话执行状态"。`未执行`＝本次未运行，**不构成失败也不构成成功证据**；
> `已执行`＝本次实际跑过并附结果。历史成功不替代当前证据（见 [AGENTS.md](AGENTS.md) §2.6）。

## 0. 通用前置

| 前置 | 说明 | 本次核对 |
| --- | --- | --- |
| DSH checkout（含 `packages/` 与 `node_modules`） | 构建/类型检查的 tsc、tsdown 来源 | `E:\DSHSource\current`，已 bootstrap，`dsh --version` = `0.2.0-rc.2` |
| 本仓库 `node_modules`（junction 依赖） | 类型检查与构建需要 | **不存在**（需先跑 `build.sh` 或手工建 link） |
| 完全权限会话 | `tests/host-harness.mjs` 真实 spawn 走管道，受限沙箱下 EPERM | 当前为 `workspace-write`，故该测试本次**未执行** |

> ⚠️ **受限沙箱下不要跑 `bash scripts/build.sh`（换 shell 也绕不过）**：`link_pkg` 建的 junction target 全在工作区外，沙箱只拒绝**工作区外 target** 的符号链接/目录联接 → 第一步就 `EPERM`，且旧 junction 已被 `rmSync` 删掉（2026-10-09 实测；依据：[docs/conventions.md](docs/conventions.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §9.3）。顺带：受限沙箱内 **git-bash 无法启动**（`couldn't create signal pipe, Win32 error 5`），PATH 的 `bash` 是原生 applet shell、`niu`（Niubash，`D:\Scoop\shims\niu.exe`）是可用的 bash 替代（两者都不认 `/e/...`，脚本里写 `E:/...`）。受限文件沙箱内改代码请走 §3 的手动路径。

## 1. 环境检查（只读，安全）

```bash
# 仓库状态
git -C . status --porcelain
git -C . log -1 --format='%h %cI %s'

# checkout 与工具链
echo "$DSH_CHECKOUT"            # 为空则 build.sh 走默认探测
node --version && npm --version
dsh --version
test -d "E:/DSHSource/current/packages" && echo "checkout ok"
```

本次会话执行状态：部分 `已执行`（`git status`、`git log`、`node --version`、`npm --version`、`dsh --version`、checkout 存在性）。

## 2. 完整构建（**需完全权限**）

```bash
cd <仓库根>
DSH_CHECKOUT=<checkout 路径> bash scripts/build.sh
```

- 前置：checkout 存在 `packages/`；`.bin/tsc` 存在。
- 效果：探测 checkout → 建立 `vendor/*`、`packages/*` junction → `tsc` 出 host 产物 → `tsdown` 出 `lib/client.js`。
- 在受限沙箱内用 `niu`（或原生 applet `bash`）替换 `bash` **不能**绕过限制：被拒的是「target 在工作区外的 junction」，与 shell 无关（2026-10-09 实测，见 §0）。
- 验证：`lib/index.js`、`lib/client.js`、`lib/types/index.d.ts` 的 mtime 更新；发布前另需 `git diff lib/` 复核产物。
- 本次会话执行状态：**未执行**（受限沙箱会 `EPERM`）。

## 3. 受限沙箱内的手动构建路径（推荐用于本机默认策略）

```bash
cd <仓库根>
# host：直接用 checkout 的 tsc（依赖 junction 已存在）
DSH_CHECKOUT=<checkout 路径> "<checkout>/node_modules/.bin/tsc" -p tsconfig.json
# client：直接用 tsdown 入口，别用 .bin shim（git-bash 下有 MSYS 路径转换问题）
node "<checkout>/node_modules/tsdown/dist/run.mjs"
```

- 前置：`node_modules` 的 junction 已由**之前一次** `build.sh` 建立；本仓库当前无 `node_modules`，所以这条路径**现在还不能直接用**——要么先在完全权限下跑一次 `build.sh`，要么手工建立同样的 link（手工建 link 同样受「target 在工作区外」限制，需要完全文件权限）。
- 本次会话执行状态：**未执行**。

## 4. 类型基线

```bash
npx tsc -p tsconfig.json --noEmit
```

- 前置：`node_modules` junction 就绪（同 §3）。
- 本次会话执行状态：**未执行**（仓库无 `node_modules`）。

## 5. 回归测试

| 命令 | 覆盖 | 前置 | 本次执行状态 |
| --- | --- | --- | --- |
| `node tests/executable-and-args.mjs` | 可执行文件解析（绝对路径 / PATH 文件名）、启动参数模板、`/defaults` 与默认提示词一致、保存校验与归一化、显示名（spawn 为记录型桩） | 无（沙箱内可跑） | **未执行** |
| `node tests/host-harness.mjs` | 假 ctx 集成：schema 默认值、旧配置迁移、多工具注册、真实 spawn git-bash/pwsh、渲染与终端卡片、assemble 裁剪、引导文本、HTTP API、fullAccess 不 confine、后台任务通道、settings volatile 契约 | **完全权限**（受限沙箱下管道 spawn 会 `EPERM`） | **未执行**（当前沙箱受限） |

- 判定：脚本自身以非零退出表示失败；**断言条数不是契约**，以输出为准。
- 注意：两个脚本都直接依赖 `lib/`（构建产物）还是 `src/`，请以脚本头部 import 为准（**待核实**：本次未读脚本正文）。

## 6. 开发态注入与验证（免重启）

```bash
DSH_CHECKOUT=<checkout 路径> bash scripts/build.sh   # 产出 lib//（需完全权限；沙箱内用 niu 替代 bash 也仍需完全权限）
dev_inject_plugin <本仓库目录>                        # host + UI 即时生效
# 浏览器刷新后拉取新 client bundle
```

- 其他注入器命令：`dev_reload_package`（重建 fiber，失败回滚）、`dev_uninject_plugin`（卸载即净）、`dev_install_package`（持久化到 profile bundles）。
- 注入是**运行期**的：重启 web 后需重新注入；持久化用正式安装（`dsh plugin add`）。
- 验证入口：DSH「插件」页 → 本插件详情页 →「Shell 工具」面板；host 侧可直读 `/dsh-shell-policy/api/status`。
- 本次会话执行状态：**未执行**（本机 web profile 未安装本插件）。

## 7. 发布

```bash
# 1) 手动构建（prepublishOnly 已移除，必须手动跑）
DSH_CHECKOUT=<checkout 路径> bash scripts/build.sh
# 2) 验证
node tests/executable-and-args.mjs
node tests/host-harness.mjs          # 需完全权限
npx tsc -p tsconfig.json --noEmit
# 3) 产物复核
git diff --stat lib/ && git diff lib/
# 4) 提交 + 发布（--ignore-scripts 避免 cmd 环境下 bash 缺失）
git commit -am "release: vX.Y.Z"
npm publish --ignore-scripts
# 5) GitHub Release：ZIP = lib + cordis.patch.yml + package.json + LICENSE
# 6) 回填 CHANGELOG.md 与 README 徽章/版本引用
```

- 已知坑：npm **staged publishing** 可能"返回成功但 registry 未出现"，重复发布报 `E409 Cannot publish over previously staged version`；等待/网页批准，或另起补丁版本号。依据：[docs/conventions.md](docs/conventions.md)。
- **发布授权属于仓库所有者**；本文件只描述步骤，不构成执行授权（[AGENTS.md](AGENTS.md) §2.6）。
- 本次会话执行状态：**未执行**。

## 8. 安装到 profile（供使用者验证）

```bash
dsh plugin --profile web add github:<owner>/<repo>
# 或： dsh plugin --profile web add dsh-windows-shell-policy
# 或： dsh plugin --profile web add link:<解压目录>
# 然后重启 dsh web
```

- 桌面端与 web 端是**两套独立 profile**，需分别装配。
- 本次会话执行状态：**未执行**（本机 web profile 当前未安装本插件）。
