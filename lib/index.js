import z from 'schemastery';
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { ESCALATION_TARGETS, approveEscalation, sandboxDenialMarker, validateEscalationArgs } from '@deepseek-ai/dsh-sandbox';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
export const name = 'dsh-windows-shell-policy';
export const inject = ['tools', 'subprocess', 'systemPrompt', 'webServer'];
/** 本插件拥有的 settings namespace（与官方 shell namespace 区分）。 */
const SETTINGS_NAMESPACE = 'shell-policy';
export const Config = z.object({
    preferred: z.union([z.const('auto'), z.const('bash'), z.const('pwsh')]).default('auto'),
    bashPath: z.string().default(''),
});
/** 探测 bash 可执行文件：显式路径 → 常见安装位置 → PATH。 */
function probeBash(explicit) {
    if (explicit.length > 0) {
        return existsSync(explicit) ? { found: true, path: explicit } : { found: false, path: explicit };
    }
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const candidates = [
        join(programFiles, 'Git', 'bin', 'bash.exe'),
        join(programFilesX86, 'Git', 'bin', 'bash.exe'),
        'C:\\msys64\\usr\\bin\\bash.exe',
        'C:\\cygwin64\\bin\\bash.exe',
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return { found: true, path: candidate };
    }
    for (const entry of (process.env.PATH ?? '').split(';')) {
        const trimmed = entry.trim().replace(/^"|"$/g, '');
        if (trimmed.length === 0)
            continue;
        const candidate = join(trimmed, 'bash.exe');
        if (existsSync(candidate))
            return { found: true, path: candidate };
    }
    return { found: false, path: '' };
}
/** 从进程环境挑出 DSH_* 托管变量传给子进程。 */
function collectDshEnv() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('DSH_') && value !== undefined)
            env[key] = value;
    }
    return env;
}
/** 渲染 bash 工具结果文本（对齐官方 shell 工具：exit 标记在末尾，exit 0 不报）。 */
function renderBashResult(value, escalationModes) {
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
export function apply(ctx, config) {
    const isWindows = process.platform === 'win32';
    const entry = config;
    let source = () => entry;
    let probe = probeBash(entry.bashPath);
    let effective = 'pwsh';
    let bashDisposer;
    let registerError;
    /** 按当前配置重新应用策略：探测 bash、切换工具注册。幂等。 */
    const applyPolicy = () => {
        const cfg = source();
        probe = probeBash(cfg.bashPath);
        const wanted = cfg.preferred === 'auto' ? (probe.found ? 'bash' : 'pwsh') : cfg.preferred;
        const next = wanted === 'bash' && probe.found ? 'bash' : 'pwsh';
        if (next === effective && (next !== 'bash' || bashDisposer !== undefined))
            return;
        effective = next;
        if (effective === 'bash') {
            // 沙箱升级面是 composition 级事实（sandbox + sandboxPolicy 服务存在与否）。
            const escalationModes = ctx.get('sandbox') !== undefined && ctx.get('sandboxPolicy') !== undefined ? ESCALATION_TARGETS : [];
            try {
                bashDisposer = ctx.tools.register(defineTool({
                    name: 'bash',
                    description: 'Execute a bash command (git-bash on Windows) and return its stdout/stderr. '
                        + 'Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — '
                        + 'pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`. '
                        + 'Long output is truncated to its tail. '
                        + 'Set `run_in_background: true` for long-running commands: the call returns a job id immediately; '
                        + 'read its output with `job_output` and stop it with `job_kill`.',
                    parameters: {
                        command: { type: 'string', required: true, description: 'The bash command to execute.' },
                        description: {
                            type: 'string',
                            required: true,
                            description: 'Clear, concise description of what this command does in active voice, '
                                + '5-10 words (shown in the UI). Examples: "ls" → "List files in current directory"; '
                                + '"git status" → "Show working tree status".',
                        },
                        timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Defaults to 120000; the command is killed on expiry.' },
                        workdir: { type: 'string', description: 'Working directory for this command. Defaults to the session workspace; a relative path is resolved against it.' },
                        run_in_background: { type: 'boolean', description: 'Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies.' },
                        sandbox_permissions: {
                            type: 'string',
                            enum: [...ESCALATION_TARGETS],
                            description: 'The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval.',
                        },
                        justification: {
                            type: 'string',
                            description: 'Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access.',
                        },
                    },
                    output: {
                        schema: {
                            oneOf: [
                                {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        kind: { type: 'string', required: true, const: 'background' },
                                        jobId: { type: 'string', required: true },
                                    },
                                },
                                {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        exitCode: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
                                        timedOut: { type: 'boolean', required: true },
                                        aborted: { type: 'boolean', required: true },
                                        stdout: {
                                            type: 'object',
                                            additionalProperties: false,
                                            required: true,
                                            properties: {
                                                text: { type: 'string', required: true },
                                                truncated: { type: 'boolean', required: true },
                                            },
                                        },
                                        stderr: {
                                            type: 'object',
                                            additionalProperties: false,
                                            required: true,
                                            properties: {
                                                text: { type: 'string', required: true },
                                                truncated: { type: 'boolean', required: true },
                                            },
                                        },
                                        sandbox: {
                                            type: 'object',
                                            additionalProperties: false,
                                            properties: {
                                                mode: { type: 'string', required: true },
                                                denied: { type: 'boolean', required: true },
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                        render: (_args, value) => {
                            const v = value;
                            if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'background') {
                                return [{ type: 'text', text: `started background job ${v.jobId}` }];
                            }
                            return [{ type: 'text', text: renderBashResult(v, escalationModes) }];
                        },
                    },
                    async execute(args, exec) {
                        if (args.command.trim().length === 0) {
                            throw new Error('invalid command: expected a non-empty string');
                        }
                        if (args.description.trim().length === 0) {
                            throw new Error('invalid description: expected a non-empty string');
                        }
                        validateEscalationArgs(args.sandbox_permissions, args.justification);
                        // workdir：显式相对路径按 session cwd 解析；缺省用 session cwd。
                        const headerCwd = exec.agent?.session.header.cwd;
                        let workdir = args.workdir;
                        if (workdir !== undefined && headerCwd !== undefined && !isAbsolute(workdir)) {
                            workdir = resolve(headerCwd, workdir);
                        }
                        else if (workdir === undefined) {
                            workdir = headerCwd ?? process.cwd();
                        }
                        // 沙箱策略：standing policy + 升级请求。
                        const sandbox = ctx.get('sandbox');
                        const sandboxPolicy = ctx.get('sandboxPolicy');
                        const standingPolicy = sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
                        let policy = standingPolicy;
                        if (args.sandbox_permissions !== undefined && args.justification !== undefined) {
                            if (escalationModes.length === 0) {
                                throw new Error('sandbox_permissions is not available in this composition (no sandboxing executor to escalate)');
                            }
                            const approvedMode = await approveEscalation({ requestedMode: args.sandbox_permissions, justification: args.justification, effectiveMode: standingPolicy.mode, subject: 'command' }, {
                                approver: ctx.get('approval'),
                                agent: exec.agent,
                                callId: exec.callId,
                                toolName: 'bash',
                                signal: exec.signal,
                            });
                            policy = { ...standingPolicy, mode: approvedMode };
                        }
                        // argv 构造 + 沙箱 confine。
                        let argv = [probe.path, '-c', args.command];
                        let confined;
                        if (policy !== undefined && policy.mode !== 'danger-full-access' && sandbox !== undefined) {
                            confined = sandbox.confine(argv, { ...policy, mode: policy.mode });
                            argv = confined.argv;
                        }
                        const collect = { maxBytes: 64_000, spill: { maxBytes: 64 * 1024 * 1024 } };
                        const spawnSpec = (signal) => ({
                            argv,
                            cwd: workdir,
                            stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
                            graceMs: 3_000,
                            signal,
                            env: collectDshEnv(),
                        });
                        // 后台：jobs 通道，cancel/readOutput 增量。
                        if (args.run_in_background === true) {
                            const jobs = ctx.get('jobs');
                            if (jobs === undefined) {
                                throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs');
                            }
                            if (exec.signal.aborted) {
                                const error = new HarnessError('tool call aborted', TOOL_ABORTED);
                                error.name = 'AbortError';
                                throw error;
                            }
                            const id = jobs.start({
                                kind: 'bash',
                                label: args.command,
                                ...exec.agent ? { owner: exec.agent } : {},
                                run: () => {
                                    const handle = ctx.subprocess.spawn(spawnSpec(undefined));
                                    let stdoutOffset = 0;
                                    let stderrOffset = 0;
                                    return {
                                        cancel: () => handle.terminate(),
                                        done: handle.done.then((outcome) => ({
                                            status: outcome.exitCode === 0 ? 'completed' : 'failed',
                                            detail: `exit code: ${outcome.exitCode}`,
                                        })),
                                        readOutput: () => {
                                            const out = handle.collected.stdout?.readFrom(stdoutOffset);
                                            const err = handle.collected.stderr?.readFrom(stderrOffset);
                                            stdoutOffset = out?.nextOffset ?? stdoutOffset;
                                            stderrOffset = err?.nextOffset ?? stderrOffset;
                                            const outText = out?.text ?? '';
                                            const errText = err?.text ?? '';
                                            const separator = outText.length > 0 && !outText.endsWith('\n') ? '\n' : '';
                                            return outText + (errText.length > 0 ? `${separator}[stderr]\n${errText}` : '');
                                        },
                                    };
                                },
                            });
                            return { kind: 'background', jobId: id };
                        }
                        // 前台。
                        const timeoutMs = args.timeoutMs !== undefined && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
                            ? args.timeoutMs
                            : 120_000;
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), timeoutMs);
                        const onAbort = () => controller.abort();
                        exec.signal?.addEventListener('abort', onAbort);
                        try {
                            const handle = ctx.subprocess.spawn(spawnSpec(controller.signal));
                            const outcome = await handle.done;
                            const out = handle.collected.stdout?.readFrom(0);
                            const err = handle.collected.stderr?.readFrom(0);
                            const stderrText = err?.text ?? '';
                            const denied = confined !== undefined
                                && outcome.exitCode !== 0
                                && confined.denialSignatures.some((signature) => stderrText.toLowerCase().includes(signature.toLowerCase()));
                            const result = {
                                exitCode: outcome.exitCode,
                                timedOut: controller.signal.aborted && exec.signal?.aborted !== true,
                                aborted: exec.signal?.aborted === true,
                                stdout: { text: out?.text ?? '', truncated: out?.lossy ?? false },
                                stderr: { text: stderrText, truncated: err?.lossy ?? false },
                                ...denied ? { sandbox: { mode: policy?.mode ?? 'read-only', denied: true } } : {},
                            };
                            if (result.aborted) {
                                const error = new HarnessError('tool call aborted', TOOL_ABORTED);
                                error.name = 'AbortError';
                                throw error;
                            }
                            return result;
                        }
                        finally {
                            clearTimeout(timer);
                            exec.signal?.removeEventListener('abort', onAbort);
                        }
                    },
                    // 终端卡片展示：与官方 tool-bash/pwsh 一致，对话页可点击查看命令。
                    presentCall: (args) => ({
                        card: 'terminal',
                        title: args.command,
                        description: args.description,
                        ...args.workdir !== undefined ? { cwd: args.workdir } : {},
                    }),
                    presentResult: (args, result) => {
                        const block = result.content.length === 1 ? result.content[0] : undefined;
                        if (block === undefined || block.type !== 'text' || block.text === undefined)
                            return undefined;
                        const raw = block.text;
                        const isBackground = typeof args === 'object' && args !== null && args.run_in_background === true;
                        if (isBackground || result.isError) {
                            return { card: 'generic', content: [{ type: 'text', text: `\`\`\`console\n${raw.replace(/\n+$/, '')}\n\`\`\`` }] };
                        }
                        const { body, ...exit } = parseExitStatus(raw);
                        return { card: 'terminal', output: body, ...exit };
                    },
                }));
                registerError = undefined;
                ctx.logger.info('[shell-policy] bash 工具已注册（%s）', probe.path);
            }
            catch (error) {
                bashDisposer = undefined;
                effective = 'pwsh';
                registerError = String(error);
                ctx.logger.warn('[shell-policy] bash 工具注册失败，回落 pwsh: %s', registerError);
            }
        }
        else {
            bashDisposer?.();
            bashDisposer = undefined;
            registerError = undefined;
            ctx.logger.info('[shell-policy] 生效 shell: pwsh');
        }
    };
    // 状态与配置 API（所有平台注册；非 Windows 返回 supported: false）。
    // settings 的 client 端 RPC 有 allowlist 限制（apiproxy WEB_SETTINGS_NAMESPACES），
    // 本插件 namespace 不在其中，因此卡片读写都走本 API：host 端直接经 settings 服务持久化。
    ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-shell-policy/api',
        handler: async (req, res) => {
            const url = String(req.url ?? '');
            const send = (code, body) => {
                res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(body));
            };
            if (url.endsWith('/status') && req.method === 'GET') {
                send(200, {
                    platform: process.platform,
                    supported: isWindows,
                    bashFound: probe.found,
                    bashPath: probe.path,
                    effective,
                    preferred: source().preferred,
                    configuredBashPath: source().bashPath,
                    registerError,
                });
                return;
            }
            if (url.endsWith('/preferred') && req.method === 'POST') {
                const raw = await new Promise((resolve, reject) => {
                    let data = '';
                    req.on('data', (chunk) => { data += chunk; });
                    req.on('end', () => resolve(data));
                    req.on('error', reject);
                });
                let parsed;
                try {
                    parsed = JSON.parse(raw);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const preferred = parsed.preferred;
                if (preferred !== 'auto' && preferred !== 'bash' && preferred !== 'pwsh') {
                    send(400, { ok: false, error: 'preferred must be auto | bash | pwsh' });
                    return;
                }
                const settings = ctx.get('settings');
                if (settings === undefined) {
                    send(500, { ok: false, error: 'settings service unavailable' });
                    return;
                }
                try {
                    await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['preferred'], value: preferred }]);
                    send(200, { ok: true, preferred, effective });
                }
                catch (error) {
                    send(500, { ok: false, error: String(error) });
                }
                return;
            }
            if (url.endsWith('/bashpath') && req.method === 'POST') {
                const raw = await new Promise((resolve, reject) => {
                    let data = '';
                    req.on('data', (chunk) => { data += chunk; });
                    req.on('end', () => resolve(data));
                    req.on('error', reject);
                });
                let parsed;
                try {
                    parsed = JSON.parse(raw);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const bashPath = typeof parsed.bashPath === 'string' ? parsed.bashPath.trim() : '';
                const settings = ctx.get('settings');
                if (settings === undefined) {
                    send(500, { ok: false, error: 'settings service unavailable' });
                    return;
                }
                try {
                    await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['bashPath'], value: bashPath }]);
                    send(200, { ok: true, bashPath, effective });
                }
                catch (error) {
                    send(500, { ok: false, error: String(error) });
                }
                return;
            }
            send(404, { ok: false, error: 'not found' });
        },
    }), 'dsh-windows-shell-policy: status api');
    // 非 Windows：DSH 默认 bash 工具已可用，本插件跳过（不注册工具、不过滤、不注册引导）。
    if (!isWindows) {
        ctx.logger.info('[shell-policy] 非 Windows 平台，插件跳过（DSH 默认 bash 工具已可用）');
        return;
    }
    // settings 装配：preferred/bashPath 可被用户层覆盖，变化时重新应用策略。
    // DSH 0.1.5：顶层 installSettingsSection 已移除；改为注入 settings 服务后
    // 由 provider.installSection 注册（服务缺席时保留 entry 兜底语义）。
    ctx.inject(['settings'], (settingsCtx) => {
        settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, entry, {
            setSource: (current) => { source = current; },
            onChange: applyPolicy,
        });
    });
    // 无 settings 服务时的兜底（settings 服务存在时 applyPolicy 幂等跳过）。
    applyPolicy();
    // 提示词工具面裁剪：effective=bash 时隐藏 pwsh，反之隐藏 bash。
    ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const assembled = await next();
        if (effective === 'bash') {
            return { ...assembled, tools: assembled.tools.filter((tool) => tool.name !== 'pwsh') };
        }
        if (effective === 'pwsh') {
            return { ...assembled, tools: assembled.tools.filter((tool) => tool.name !== 'bash') };
        }
        return assembled;
    });
    // 引导文本。
    ctx.systemPrompt.section({
        name: 'shell-policy',
        order: 104,
        text: 'Windows shell policy: the `bash` tool (git-bash) is the default shell. '
            + 'Check the [exit code: N] marker on every bash result; investigate failures before moving on.',
    });
    // 卸载清理：注销动态注册的 bash 工具。
    ctx.effect(() => () => {
        bashDisposer?.();
        bashDisposer = undefined;
    }, 'dsh-windows-shell-policy: bash tool cleanup');
}
//# sourceMappingURL=index.js.map