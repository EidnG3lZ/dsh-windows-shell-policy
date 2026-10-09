import type { ShellEntry } from './config.js';
/** `path` 是否只是可执行文件名（不含目录分隔符与盘符）。 */
declare function isBareExecutableName(value: string): boolean;
/** 校验 `path` 的值域：空（自动探测）/ 绝对路径 / 纯文件名（在 PATH 里查找）。 */
declare function executablePathProblem(path: string): string | undefined;
/** PATH 里按可执行文件名查找（去引号；无扩展名的补 .exe——.cmd/.bat 不能直接 spawn）。 */
declare function pathCandidates(names: readonly string[]): string[];
/** bash 家族探测候选（Git for Windows 系统级/用户级、MSYS2、Cygwin、PATH）。 */
declare function bashCandidates(name: string): string[];
/** PowerShell 家族探测候选（PowerShell 7 安装位置、PATH、Windows PowerShell 5.1）。 */
declare function pwshCandidates(name: string): string[];
/**
 * 解析条目的可执行文件：
 * - `path` 是绝对路径 → 直接用（不存在则条目不可用）；
 * - `path` 只是文件名 → 在进程 PATH 里查找（命中即用它的绝对路径，**不回落**家族候选，
 *   避免「填了 A 却起了 B」）；
 * - `path` 留空 → 按家族内置候选探测（候选里也包含 PATH）。
 * @returns 可执行文件绝对路径；未找到返回空串。
 */
declare function resolveShellPath(entry: ShellEntry): string;
/**
 * 在进程 PATH 的每个目录里查找该可执行文件名（无扩展名时按 `<名字>.exe` 找，
 * 与 Windows 的 PATHEXT 语义一致；只有 .exe 能直接 spawn）。
 */
declare function resolveExecutableInPath(name: string): string;
export { isBareExecutableName, executablePathProblem, pathCandidates, bashCandidates, pwshCandidates, resolveShellPath, resolveExecutableInPath, };
