# MAP.md — 目录 / 版本 / 配置 / 部署映射

> 定位"要改哪里、跑的是哪一份"时读。核验：2026-10-09，范围＝本工作副本 + 本机 web profile（未写入私有设备路径，按需替换）。
> 变动时更新本文件；**不虚构环境**，未核实项显式标注。

## 1. 目录结构（本仓库）

```
E:\DSHProjects\dsh-windows-shell-policy\     ← 工作区根 = git 仓库根（origin/main）
├── src/index.ts              host 入口（facade）：name/inject + 重导出（38 行）
├── src/host/                 host 实现，9 个模块：config / shell-args / detect / result / tool / policy / api / context / apply
├── src/client/               client 实现，8 个模块：index / card / entry-row / entry-detail / validation / styles / icons / types
├── lib/                      构建产物，**刻意入库**（Release ZIP / link: 安装直接使用）
│   ├── index.js  index.js.map  types/index.d.ts      host 入口产物 / 公开类型
│   ├── host/*.js  *.js.map  types/host/*.d.ts        host 各模块产物
│   └── client.js  client.js.map                      client 产物（单文件包）
├── tests/host-harness.mjs            假 ctx 集成测试（真实 spawn；受限沙箱下 EPERM）
├── tests/executable-and-args.mjs     记录型 spawn 桩回归（沙箱内可跑）
├── scripts/build.sh          一键构建（探测 checkout → link 依赖 → tsc → tsdown）
├── docs/                     专题文档 + screenshots/
├── cordis.patch.yml          bundle patch（把自身插入 profile 插件名册）
├── tsconfig.json             host tsc 配置（**必须 exclude src/client**）
├── tsdown.config.ts          client 打包配置（→ lib/client.js）
├── package.json              元数据 / exports / dsh.bundle.patch / dsh.client
├── README.md / README.en.md  中英文说明
├── CHANGELOG.md              版本变更史
└── LICENSE                   MIT
```

说明：仓库**没有** `node_modules`（工作副本未安装依赖）；`.gitignore` 只忽略 `node_modules/`、`*.tsbuildinfo`、`*.tgz`、`*.zip`，因此 `lib/` 是有意提交的。

## 2. 版本

| 项 | 值 | 来源 |
| --- | --- | --- |
| 当前版本 | `0.1.1` | [package.json](package.json) / [CHANGELOG.md](CHANGELOG.md) |
| 版本号规范 | SemVer；变更记录参考 Keep a Changelog | CHANGELOG 头部说明 |
| git 主分支 | `main` → `origin/main`；最新提交 `8e7c580`（2026-10-08）；**无 tag** | `git log`/`git tag` |
| 远端 | fetch: `git.64832619.xyz`；push: `github.com` | `git remote -v` |

## 3. 构建与工具链映射

| 产物 | 工具 | 来源 | 输入 → 输出 |
| --- | --- | --- | --- |
| host | `tsc` | DSH checkout 的 `node_modules/.bin` | `src/` → `lib/`（+ `lib/types`） |
| client | `tsdown`（`dist/run.mjs`，不用 `.bin` shim） | DSH checkout | `src/client/index.ts` → `lib/client.js` |

- `scripts/build.sh` 按 `DSH_CHECKOUT` → `$HOME/dsh-harness` → `$HOME/dsh` → `$HOME/.dsh/dsh-harness` 探测 checkout（必须含 `packages/`）。
- 本机 checkout：`E:\DSHSource\current`，**已 bootstrap**，`dsh --version` = `0.2.0-rc.2`（本次核对）。备选 checkout 的存在性与 bootstrap 状态：**待核实**。
- 工具链实测：node `v26.10.0`、npm `11.19.1`（本次核对）。
- 编译期依赖靠 `build.sh` 建立的 junction（`vendor/*`、`packages/*`）解析；**运行期 import 必须用发布名**（见 [DECISIONS.md](DECISIONS.md) D7）。

## 4. 部署 / 装配映射

| 位置 | 内容 | 本机状态（2026-10-09 核对） |
| --- | --- | --- |
| npm 包 | `lib` + `cordis.patch.yml` + `LICENSE`（`files` 字段） | 是否已发布 `0.1.1`：**待核实** |
| GitHub Release | ZIP（lib + cordis.patch.yml + package.json + LICENSE） | 最新 Release 版本：**待核实** |
| web profile | `~/.dsh/profiles/web`（`dsh web` 服务实例） | **未安装本插件**；依赖中含同类插件 `dsh-gitbash-shell@0.33.0` |
| desktop profile | Electron 桌面应用使用的 `~/.dsh/profiles/desktop` | **待核实**（本次未检查；两端 profile 互相独立，需分别装配） |
| 开发态注入 | `dev_inject_plugin`（junction + `loader.create`） | 运行期注入，重启 web 后失效；持久化用 `dev_install_package` 或正式安装 |

安装形态（详见 [README.md](README.md)）：`dsh plugin add github:<owner>/<repo>`｜`... add dsh-windows-shell-policy`｜`... add link:<解压目录>`。

## 5. 配置持久化位置

- 条目写入**本插件 profile entry config 的 `shells` 数组**（经 host 的 `settings.mutate(entryId, …)`；settings namespace = profile entry id）。
- 旧字段 `preferred` / `bashPath` 仅在 `shells` 为空时作为迁移来源，首次保存时落盘。
- 面板读写不走 settings 的浏览器 RPC（apiproxy allowlist 不含本插件），而走自带 HTTP API `/dsh-shell-policy/api/*`（见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §4.7）。
