/**
 * dsh-windows-shell-policy — host 侧的 shell 方言判定、启动参数模板与 argv 构造。
 *
 * 「启动参数」是**可执行文件之后的全部参数**模板：`{command}` 占位实际命令，留空用家族默认。
 * 默认工具提示词也只有这一份（`defaultToolDescription`），面板经 POST /defaults 取它预填。
 */
import type { ShellEntry } from './config.js';
/** PowerShell 家族命令的 UTF-8 输出前缀（Windows PowerShell 5.1 默认按控制台代码页输出）。 */
declare const PWSH_PREAMBLE = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); ";
/** 是否 PowerShell 家族（决定 `-Command` 调用方言与探测候选）。 */
declare function isPwshFamily(entry: Pick<ShellEntry, 'name' | 'path'>): boolean;
/** 启动参数模板里的占位符：会被替换成实际命令。 */
declare const COMMAND_PLACEHOLDER = "{command}";
/**
 * 解析「启动参数」文本：空白分隔，双引号分组，`\\"` 表示字面量引号。
 * @returns 参数数组；引号未闭合返回 undefined（保存校验据此报错）。
 */
declare function parseArgs(text: string): string[] | undefined;
/** 条目的启动参数模板（可执行文件之后的全部参数）；留空用家族默认，其中包含取命令的开关。 */
declare function argTemplate(entry: Pick<ShellEntry, 'args'>, pwsh: boolean): string;
/** 校验启动参数模板：引号闭合，且非空模板必须含 {command}（否则命令不会传给 shell）。 */
declare function argTemplateProblem(text: string): string | undefined;
/**
 * 条目的默认工具提示词。面板新建条目时经 POST /defaults 取同一份文本预填，
 * 「重置为默认」也用它，因此 host 与面板不会各写一份模板。
 */
/** 按条目的启动参数模板构造 argv（{command} 替换成实际命令；PowerShell 家族加 UTF-8 前缀）。 */
declare function buildArgv(entry: ShellEntry, executable: string, pwsh: boolean, command: string): string[];
export declare function defaultToolDescription(entry: Pick<ShellEntry, 'name' | 'path' | 'args'>, executable: string): string;
export { PWSH_PREAMBLE, COMMAND_PLACEHOLDER, isPwshFamily, parseArgs, argTemplate, argTemplateProblem, buildArgv, };
