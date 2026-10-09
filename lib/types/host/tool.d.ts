/**
 * dsh-windows-shell-policy — host 侧的单个 shell 工具定义。
 *
 * `buildTool` 把「一个条目 + 已解析的可执行文件」编译成 `defineTool` 定义：
 * 参数面、输出 schema、执行链（workdir → 沙箱 confine / 升级审批 → argv → spawn）、
 * 终端卡片展示。执行链的全部复杂度都收在这个模块里。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { AppContext } from './context.js';
import type { ShellEntry } from './config.js';
/** 构造一个条目的工具定义（闭包捕获条目与已解析的可执行文件）。 */
export declare function buildTool(ctx: AppContext, shell: ShellEntry, executable: string): ReturnType<typeof defineTool>;
