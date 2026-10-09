import type { SandboxMode } from '@deepseek-ai/dsh-sandbox';
/** shell 工具结果形状。 */
interface BashResult {
    exitCode: number | null;
    timedOut: boolean;
    aborted: boolean;
    stdout: {
        text: string;
        truncated: boolean;
    };
    stderr: {
        text: string;
        truncated: boolean;
    };
    sandbox?: {
        mode: string;
        denied: boolean;
    };
}
/** 渲染 shell 工具结果文本（对齐官方 shell 工具：exit 标记在末尾，exit 0 不报）。 */
declare function renderShellResult(value: BashResult, escalationModes: readonly SandboxMode[]): string;
/**
 * 从渲染结果末尾拆出 exit 状态（官方 parseExitStatus 的本地等价实现）：
 * 终端卡片把 exit 状态显示为独立 pill，标记须从输出体移除。
 */
declare function parseExitStatus(text: string): {
    body: string;
    exitCode?: number;
    signal?: string;
};
export { renderShellResult, parseExitStatus };
export type { BashResult };
