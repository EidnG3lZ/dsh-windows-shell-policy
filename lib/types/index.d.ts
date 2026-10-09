/**
 * dsh-windows-shell-policy — Windows shell policy bundle plugin（host 侧入口）。
 *
 * 本文件是 host 的**公开入口（facade）**：只声明插件身份并重导出对外契约；
 * 实现按职责拆在 src/host/ 下，各自一个模块：
 *
 * - host/config.ts       条目模型、Config schema、归一化 / 保存校验、volatile 读取、旧配置迁移
 * - host/shell-args.ts   shell 家族判定、启动参数模板解析、argv 构造、默认工具提示词
 * - host/detect.ts       可执行文件解析（绝对路径 / PATH 文件名 / 家族自动探测）
 * - host/result.ts       shell 工具结果渲染与 exit / signal 状态解析
 * - host/tool.ts         单条目的 shell 工具定义（defineTool，含执行全链路）
 * - host/policy.ts       策略状态机：按配置注册 / 注销工具、状态视图、引导文本
 * - host/api.ts          面板读写用的 HTTP API（/dsh-shell-policy/api/*）
 * - host/context.ts      DSH 服务面类型声明、loader 反查 entry id、jobs kind 增强
 * - host/apply.ts        插件装配（apply）
 *
 * 对外行为不变，职责摘要：
 * 1. 维护一组可增删的「shell 条目」（显示名 / 启用开关 / 工具名 / 可执行文件路径 / 工具提示词 /
 *    沙箱完全权限 / 默认项）。条目经 /dsh-shell-policy/api 由 client 配置页读写，
 *    并持久化在本插件的 profile entry config（settings.mutate）。
 * 2. 路径留空时自动探测（Git for Windows / MSYS2 / Cygwin / PowerShell / PATH）。
 * 3. 策略生效：每个启用且可用的条目注册一个独立 shell 工具（Bash 家族用 `-c`，
 *    PowerShell 家族用 `-Command`）。单个条目失败只影响该条目，原因经 /status 暴露。
 * 4. fullAccess 条目跳过文件沙箱 confine（等同 danger-full-access，因此不再触发
 *    沙箱拒绝后的升级审批），也不再向模型暴露 sandbox_permissions/justification。
 * 5. 只要有本插件的条目注册成功，就在 system-prompt/assemble 隐藏 DSH 内置的
 *    bash/pwsh 工具（避免工具面出现重复 shell），并按条目生成引导提示词。
 * 6. 旧配置 preferred/bashPath 在 shells 为空时映射为等价条目（首次保存时落盘）。
 * 7. 非 Windows 平台只保留状态 API，不注册工具、不裁剪提示词。
 */
export { apply } from './host/apply.js';
export { Config } from './host/config.js';
export type { ShellEntry } from './host/config.js';
export { defaultToolDescription } from './host/shell-args.js';
export declare const name = "dsh-windows-shell-policy";
export declare const inject: string[];
