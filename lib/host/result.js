/**
 * dsh-windows-shell-policy — host 侧的 shell 工具结果渲染与状态解析。
 *
 * 渲染对齐官方 shell 工具：exit 标记在输出末尾，exit 0 不报；终端卡片把 exit 状态
 * 显示为独立 pill，因此解析时需把末尾标记从输出体拆走（`parseExitStatus`）。
 */
import { sandboxDenialMarker } from '@deepseek-ai/dsh-sandbox';
/** 渲染 shell 工具结果文本（对齐官方 shell 工具：exit 标记在末尾，exit 0 不报）。 */
function renderShellResult(value, escalationModes) {
    let body = value.stdout.text;
    if (value.stderr.text.length > 0) {
        if (body.length > 0 && !body.endsWith('\n'))
            body += '\n';
        body += `[stderr]\n${value.stderr.text}`;
    }
    if (body.length === 0)
        body = '(no output)';
    const markers = [];
    if (value.sandbox?.denied) {
        markers.push(sandboxDenialMarker(value.sandbox.mode));
        if (escalationModes.length > 0)
            markers.push('[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]');
    }
    if (value.timedOut)
        markers.push('[timed out]');
    if (value.aborted)
        markers.push('[aborted]');
    else if (value.exitCode !== null && value.exitCode !== 0)
        markers.push(`[exit code: ${value.exitCode}]`);
    if (markers.length === 0)
        return body;
    if (!body.endsWith('\n'))
        body += '\n';
    return body + markers.join('\n');
}
/**
 * 从渲染结果末尾拆出 exit 状态（官方 parseExitStatus 的本地等价实现）：
 * 终端卡片把 exit 状态显示为独立 pill，标记须从输出体移除。
 */
function parseExitStatus(text) {
    const signal = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text);
    if (signal?.[1] !== undefined)
        return { body: text.slice(0, signal.index), signal: signal[1] };
    const exit = /\n\[exit code: (\d+)\]$/.exec(text);
    if (exit?.[1] !== undefined)
        return { body: text.slice(0, exit.index), exitCode: Number(exit[1]) };
    return { body: text, exitCode: 0 };
}
export { renderShellResult, parseExitStatus };
//# sourceMappingURL=result.js.map