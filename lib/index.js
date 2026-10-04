import z from 'schemastery';
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { ESCALATION_TARGETS, approveEscalation, sandboxDenialMarker, validateEscalationArgs } from '@deepseek-ai/dsh-sandbox';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
export const name = 'dsh-windows-shell-policy';
export const inject = ['tools', 'subprocess', 'systemPrompt', 'webServer'];
/** 本插件的包名（也是 profile entry 的 name，用于解析自身 entry id）。 */
const PKG_NAME = 'dsh-windows-shell-policy';
/** 条目数量上限（防止面板/注册表被无限撑大）。 */
const MAX_SHELL_ENTRIES = 16;
/** 工具名长度上限。 */
const MAX_TOOL_NAME = 64;
/** 路径长度上限。 */
const MAX_PATH = 1024;
/** 工具提示词长度上限。 */
const MAX_DESCRIPTION = 8_000;
/**
 * DSH 内置 shell 工具名：本插件有工具注册成功时，从提示词工具面隐藏这些名字
 * （内置工具在运行时无法注销，只能靠 assemble 过滤隐藏）。
 */
const BUILT_IN_SHELL_TOOLS = ['bash', 'pwsh'];
/** PowerShell 家族命令的 UTF-8 输出前缀（Windows PowerShell 5.1 默认按控制台代码页输出）。 */
const PWSH_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); ';
/**
 * 解析本插件在 profile 中的 entry id。
 * DSH 0.2.0 起 settings 的配置 namespace 即 profile entry id（插件 Config schema
 * 自动投影为表单），不再有插件自定义 namespace 的注册机制。
 */
function resolveOwnEntryId(ctx) {
    const loader = ctx.loader;
    if (loader === undefined || typeof loader.entries !== 'function')
        return undefined;
    for (const entry of loader.entries()) {
        const options = entry.options;
        if (options !== undefined && String(options.name ?? '') === PKG_NAME && typeof options.id === 'string') {
            return options.id;
        }
    }
    return undefined;
}
const ShellEntrySchema = z.object({
    id: z.string().default(''),
    name: z.string().default(''),
    enabled: z.boolean().default(false),
    path: z.string().default(''),
    description: z.string().default(''),
    fullAccess: z.boolean().default(false),
    primary: z.boolean().default(false),
});
export const Config = z.object({
    shells: z.array(ShellEntrySchema).default([]).volatile(),
    preferred: z.union([z.const('auto'), z.const('bash'), z.const('pwsh')]).default('auto').volatile(),
    bashPath: z.string().default('').volatile(),
});
/** 解包 volatile 引用（结构检测：带 get() 的引用对象；非引用值原样返回）。 */
function unwrapVolatile(value) {
    if (typeof value === 'object' && value !== null && typeof value.get === 'function') {
        return value.get();
    }
    return value;
}
/** 字符串字段读取（非字符串一律按空串处理）。 */
function stringField(value) {
    return typeof value === 'string' ? value : '';
}
/** 去掉非法字符，得到可用的工具名。 */
function sanitizeToolName(value) {
    return value
        .trim()
        .replace(/[^A-Za-z0-9_.-]+/g, '_')
        .replace(/^[_.-]+|[_.-]+$/g, '')
        .slice(0, MAX_TOOL_NAME);
}
/** 由可执行文件名推导默认工具名（pwsh 被 DSH 内置工具占用，故默认改名为 powershell）。 */
function deriveToolName(path) {
    const stem = sanitizeToolName(path.length > 0 ? basename(path).replace(/\.(exe|cmd|bat|sh)$/i, '') : '');
    if (stem === 'pwsh')
        return 'powershell';
    return stem.length > 0 ? stem : 'shell';
}
/** 归一化一个条目的原始值；无法解析的条目丢弃。 */
function normalizeEntry(value, index, usedIds) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const raw = value;
    const path = stringField(raw.path).trim().replace(/^"|"$/g, '').slice(0, MAX_PATH);
    const explicitName = stringField(raw.name);
    const name = sanitizeToolName(explicitName.length > 0 ? explicitName : deriveToolName(path));
    let id = stringField(raw.id).trim();
    if (id.length === 0 || usedIds.has(id))
        id = `shell-${index + 1}-${name.length > 0 ? name : 'entry'}`;
    while (usedIds.has(id))
        id = `${id}_`;
    usedIds.add(id);
    return {
        id,
        name: name.length > 0 ? name : 'shell',
        enabled: raw.enabled === true,
        path,
        description: stringField(raw.description).trim().slice(0, MAX_DESCRIPTION),
        fullAccess: raw.fullAccess === true,
        primary: raw.primary === true,
    };
}
/**
 * 归一化条目列表：读取配置与写入配置共用同一条路径，保证面板看到的形状可再次落盘。
 * 同时收敛 primary（至多一个）等值域约束。
 */
function normalizeEntries(value) {
    if (!Array.isArray(value))
        return [];
    const usedIds = new Set();
    const entries = [];
    for (const [index, item] of value.slice(0, MAX_SHELL_ENTRIES).entries()) {
        const entry = normalizeEntry(item, index, usedIds);
        if (entry !== undefined)
            entries.push(entry);
    }
    let primarySeen = false;
    for (const entry of entries) {
        if (!entry.primary)
            continue;
        if (primarySeen)
            entry.primary = false;
        else
            primarySeen = true;
    }
    return entries;
}
/** 保存前的整表校验（返回错误文本；undefined 表示通过）。 */
function validateEntriesForSave(entries) {
    const names = new Map();
    for (const [index, entry] of entries.entries()) {
        if (entry.name === 'run_code')
            return `第 ${index + 1} 条：\`run_code\` 是 DSH 保留工具名`;
        if (entry.path.length > 0 && !isAbsolute(entry.path))
            return `第 ${index + 1} 条：路径必须是绝对路径`;
        if (!entry.enabled)
            continue;
        const key = entry.name.toLowerCase();
        const seen = names.get(key);
        if (seen !== undefined)
            return `第 ${index + 1} 条：工具名 "${entry.name}" 与第 ${seen + 1} 条重复`;
        names.set(key, index);
    }
    return undefined;
}
/** 从原始 config 读当前生效值（每次调用都取 volatile 最新快照）。 */
function readConfig(raw) {
    const preferred = unwrapVolatile(raw.preferred);
    const bashPath = unwrapVolatile(raw.bashPath);
    return {
        shells: normalizeEntries(unwrapVolatile(raw.shells)),
        legacyPreferred: preferred === 'bash' || preferred === 'pwsh' ? preferred : 'auto',
        legacyBashPath: typeof bashPath === 'string' ? bashPath.trim().replace(/^"|"$/g, '') : '',
    };
}
/** 是否 PowerShell 家族（决定 `-Command` 调用方言与探测候选）。 */
function isPwshFamily(entry) {
    const hint = `${entry.name} ${entry.path}`.toLowerCase();
    return hint.includes('pwsh') || hint.includes('powershell');
}
/** PATH 里按可执行文件名查找（去引号，只认 .exe——.cmd/.bat 不能直接 spawn）。 */
function pathCandidates(names) {
    const found = [];
    for (const entry of (process.env.PATH ?? '').split(';')) {
        const dir = entry.trim().replace(/^"|"$/g, '');
        if (dir.length === 0)
            continue;
        for (const candidateName of names) {
            if (candidateName.length === 0)
                continue;
            found.push(join(dir, `${candidateName}.exe`));
        }
    }
    return found;
}
/** bash 家族探测候选（Git for Windows 系统级/用户级、MSYS2、Cygwin、PATH）。 */
function bashCandidates(name) {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA;
    return [
        join(programFiles, 'Git', 'bin', 'bash.exe'),
        join(programFiles, 'Git', 'usr', 'bin', 'bash.exe'),
        join(programFilesX86, 'Git', 'bin', 'bash.exe'),
        ...localAppData !== undefined ? [join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')] : [],
        'C:\\msys64\\usr\\bin\\bash.exe',
        'C:\\cygwin64\\bin\\bash.exe',
        ...pathCandidates([name === 'bash' ? '' : name, 'bash']),
    ];
}
/** PowerShell 家族探测候选（PowerShell 7 安装位置、PATH、Windows PowerShell 5.1）。 */
function pwshCandidates(name) {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    return [
        join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
        ...pathCandidates([name === 'powershell' || name === 'pwsh' ? 'pwsh' : name, 'pwsh']),
        join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ];
}
/**
 * 解析条目的可执行文件：显式路径存在则用它，否则按家族探测。
 * @returns 可执行文件绝对路径；未找到返回空串。
 */
function resolveShellPath(entry) {
    if (entry.path.length > 0)
        return existsSync(entry.path) ? entry.path : '';
    const candidates = isPwshFamily(entry) ? pwshCandidates(entry.name) : bashCandidates(entry.name);
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return '';
}
/** 旧配置迁移：shells 为空时按 preferred/bashPath 生成等价条目（不落盘）。 */
function migrateLegacyEntries(cfg, onWindows) {
    if (!onWindows)
        return [];
    const base = { description: '', fullAccess: false, primary: true };
    if (cfg.legacyPreferred === 'pwsh') {
        // 旧 pwsh 模式 = 内置 pwsh 工具生效；迁移为未启用的 PowerShell 条目，
        // 需要本插件接管（含完全权限）时由用户在面板打开开关。
        return [{ id: 'legacy-pwsh', name: 'powershell', enabled: false, path: '', ...base }];
    }
    return [{ id: 'legacy-bash', name: 'bash', enabled: true, path: cfg.legacyBashPath, ...base }];
}
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
/** 读取请求体（手写拼接 + JSON.parse；与旧版一致，不做体积上限）。 */
async function readJsonBody(req) {
    const raw = await new Promise((resolveBody, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => resolveBody(data));
        req.on('error', reject);
    });
    return raw.length === 0 ? {} : JSON.parse(raw);
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
export function apply(ctx, config) {
    const isWindows = process.platform === 'win32';
    // 0.2.0 起 config 的 live 字段是 volatile 引用；读取一律经 readConfig(source())。
    const entry = config;
    const source = () => entry;
    /** 当前生效条目（配置值），以及是否来自旧配置迁移。 */
    const currentEntries = () => {
        const cfg = readConfig(source());
        if (cfg.shells.length > 0)
            return { entries: cfg.shells, migrated: false };
        return { entries: migrateLegacyEntries(cfg, isWindows), migrated: true };
    };
    let status = [];
    let registeredNames = [];
    let appliedSignature;
    const disposers = new Map();
    /** 关闭所有已注册工具。 */
    const disposeAll = () => {
        for (const dispose of disposers.values()) {
            try {
                dispose();
            }
            catch (error) {
                ctx.logger.warn('[shell-policy] 注销工具失败（忽略）: %s', String(error));
            }
        }
        disposers.clear();
    };
    /** 构造一个条目的工具定义（闭包捕获条目与已解析的可执行文件）。 */
    const buildTool = (shell, executable) => {
        const pwsh = isPwshFamily(shell);
        // 沙箱升级面是 composition 级事实（sandbox + sandboxPolicy 服务存在与否）；
        // fullAccess 条目本来就跳过 confine，因此不广告升级参数。
        const escalationModes = !shell.fullAccess && ctx.get('sandbox') !== undefined && ctx.get('sandboxPolicy') !== undefined
            ? ESCALATION_TARGETS
            : [];
        const invocation = pwsh ? '`-Command`' : '`-c`';
        const defaultDescription = `Execute a ${shell.name} command (${executable} ${invocation}) and return its stdout/stderr. `
            + 'Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — '
            + 'pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`. '
            + 'Long output is truncated to its tail. '
            + 'Set `run_in_background: true` for long-running commands: the call returns a job id immediately; '
            + 'read its output with `job_output` and stop it with `job_kill`.';
        return defineTool({
            name: shell.name,
            description: shell.description.length > 0 ? shell.description : defaultDescription,
            parameters: {
                command: { type: 'string', required: true, description: 'The shell command to execute.' },
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
                ...escalationModes.length > 0 ? {
                    sandbox_permissions: {
                        type: 'string',
                        enum: [...ESCALATION_TARGETS],
                        description: 'The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval.',
                    },
                    justification: {
                        type: 'string',
                        description: 'Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access.',
                    },
                } : {},
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
                    return [{ type: 'text', text: renderShellResult(v, escalationModes) }];
                },
            },
            async execute(args, exec) {
                if (args.command.trim().length === 0) {
                    throw new Error('invalid command: expected a non-empty string');
                }
                if (args.description.trim().length === 0) {
                    throw new Error('invalid description: expected a non-empty string');
                }
                if (shell.fullAccess) {
                    if (args.sandbox_permissions !== undefined || args.justification !== undefined) {
                        throw new Error(`shell "${shell.name}" runs with full sandbox access (fullAccess); sandbox_permissions/justification do not apply`);
                    }
                }
                else {
                    validateEscalationArgs(args.sandbox_permissions, args.justification);
                }
                // workdir：显式相对路径按 session cwd 解析；缺省用 session cwd。
                const headerCwd = exec.agent?.session.header.cwd;
                let workdir = args.workdir;
                if (workdir !== undefined && headerCwd !== undefined && !isAbsolute(workdir)) {
                    workdir = resolve(headerCwd, workdir);
                }
                else if (workdir === undefined) {
                    workdir = headerCwd ?? process.cwd();
                }
                // 沙箱策略：standing policy + 升级请求（fullAccess 条目完全跳过沙箱）。
                const sandbox = ctx.get('sandbox');
                const sandboxPolicy = ctx.get('sandboxPolicy');
                const standingPolicy = sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
                let policy = standingPolicy;
                if (!shell.fullAccess && args.sandbox_permissions !== undefined && args.justification !== undefined) {
                    if (escalationModes.length === 0) {
                        throw new Error('sandbox_permissions is not available in this composition (no sandboxing executor to escalate)');
                    }
                    const approvedMode = await approveEscalation({ requestedMode: args.sandbox_permissions, justification: args.justification, effectiveMode: standingPolicy.mode, subject: 'command' }, {
                        approver: ctx.get('approval'),
                        agent: exec.agent,
                        callId: exec.callId,
                        toolName: shell.name,
                        signal: exec.signal,
                    });
                    policy = { ...standingPolicy, mode: approvedMode };
                }
                // argv 构造 + 沙箱 confine（DSH 0.2.0 起 confine 为异步）。
                let argv = pwsh
                    ? [executable, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PWSH_PREAMBLE + args.command]
                    : [executable, '-c', args.command];
                let confined;
                if (!shell.fullAccess && policy !== undefined && policy.mode !== 'danger-full-access' && sandbox !== undefined) {
                    confined = await sandbox.confine(argv, { ...policy, mode: policy.mode });
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
                        // DSH 0.2.0 起 owner 为 SessionId（不再是 Agent 实例）。
                        ...exec.agent ? { owner: exec.agent.id } : {},
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
        });
    };
    /** 校验条目并说明不可注册的原因（undefined 表示可注册）。 */
    const entryProblem = (shell, executable, claimed) => {
        if (shell.name.length === 0)
            return '工具名为空';
        if (shell.name === 'run_code')
            return '`run_code` 是 DSH 保留工具名，请更换';
        if (claimed.has(shell.name))
            return `工具名 "${shell.name}" 与前面的条目重复`;
        if (executable.length === 0) {
            return shell.path.length > 0
                ? `未找到可执行文件：${shell.path}`
                : `未探测到 ${shell.name} 可执行文件；请填写路径或点击「探测」`;
        }
        if (ctx.tools.get(shell.name) !== undefined) {
            return `工具名 "${shell.name}" 已被 DSH 内置工具或其它插件占用；请改用别的名称（例如 pwsh → powershell）`;
        }
        return undefined;
    };
    /** 按当前配置重新应用策略：解析条目、注册/注销工具。幂等。 */
    const applyPolicy = () => {
        const { entries } = currentEntries();
        const signature = JSON.stringify([entries, isWindows]);
        if (signature === appliedSignature)
            return;
        appliedSignature = signature;
        // 全量重建：条目集合、顺序或任一条目内容变化都走这里。
        disposeAll();
        const nextStatus = [];
        const nextRegistered = [];
        const claimed = new Set();
        for (const shell of entries) {
            const item = { ...shell, resolvedPath: '', registered: false };
            if (!shell.enabled) {
                nextStatus.push(item);
                continue;
            }
            const executable = resolveShellPath(shell);
            item.resolvedPath = executable;
            const problem = entryProblem(shell, executable, claimed);
            if (problem !== undefined) {
                item.error = problem;
                nextStatus.push(item);
                continue;
            }
            claimed.add(shell.name);
            try {
                disposers.set(shell.id, ctx.tools.register(buildTool(shell, executable)));
                item.registered = true;
                nextRegistered.push(shell.name);
            }
            catch (error) {
                item.error = `工具注册失败：${String(error)}`;
            }
            nextStatus.push(item);
        }
        status = nextStatus;
        registeredNames = nextRegistered;
        ctx.logger.info('[shell-policy] 已注册 shell 工具: %s', nextRegistered.length > 0 ? nextRegistered.join(', ') : '(无)');
    };
    /** 条目运行时视图（非 Windows 下没有策略状态，按配置给出静态视图）。 */
    const statusView = () => {
        if (isWindows)
            return status;
        return currentEntries().entries.map((shell) => ({ ...shell, resolvedPath: '', registered: false }));
    };
    /** 引导提示词：列出已注册的 shell 工具与优先项；没有工具时不注入内容。 */
    const guidanceText = () => {
        const registered = status.filter((item) => item.registered);
        if (registered.length === 0)
            return '';
        const preferred = registered.find((item) => item.primary) ?? registered[0];
        const list = registered.map((item) => `\`${item.name}\``).join(', ');
        const lead = registered.length === 1
            ? `The \`${preferred?.name}\` tool is the shell.`
            : `Prefer \`${preferred?.name}\` for shell commands; the other available shells are for tasks that need them.`;
        return `Windows shell policy: available shell tools: ${list}. ${lead} `
            + 'Check the [exit code: N] marker on every shell result; investigate failures before moving on.';
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
            const writeSettings = async (path, value) => {
                const settings = ctx.get('settings');
                const entryId = resolveOwnEntryId(ctx);
                if (settings === undefined)
                    return 'settings service unavailable';
                if (entryId === undefined)
                    return 'own profile entry not found';
                try {
                    await settings.mutate(entryId, [{ op: 'set', path, value }]);
                    return undefined;
                }
                catch (error) {
                    return String(error);
                }
            };
            if (url.endsWith('/status') && req.method === 'GET') {
                const view = statusView();
                const bash = view.find((item) => item.resolvedPath.length > 0 && !isPwshFamily(item));
                const preferredEntry = view.find((item) => item.registered && item.primary) ?? view.find((item) => item.registered);
                const errors = view.flatMap((item) => item.error === undefined ? [] : [`${item.name}: ${item.error}`]);
                const { migrated } = currentEntries();
                send(200, {
                    platform: process.platform,
                    supported: isWindows,
                    entries: view,
                    migrated,
                    registered: registeredNames,
                    // 旧客户端字段（v0.0.x 的单 shell 面板）：
                    effective: preferredEntry !== undefined && !isPwshFamily(preferredEntry) ? 'bash' : 'pwsh',
                    bashFound: bash !== undefined,
                    bashPath: bash?.resolvedPath ?? '',
                    preferred: readConfig(source()).legacyPreferred,
                    configuredBashPath: readConfig(source()).legacyBashPath,
                    registerError: errors.length > 0 ? errors.join('; ') : undefined,
                });
                return;
            }
            if (url.endsWith('/shells') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const rawShells = parsed.shells;
                if (!Array.isArray(rawShells)) {
                    send(400, { ok: false, error: 'shells must be an array' });
                    return;
                }
                if (rawShells.length > MAX_SHELL_ENTRIES) {
                    send(400, { ok: false, error: `too many shells (max ${MAX_SHELL_ENTRIES})` });
                    return;
                }
                const shells = normalizeEntries(rawShells);
                const invalid = validateEntriesForSave(shells);
                if (invalid !== undefined) {
                    send(400, { ok: false, error: invalid });
                    return;
                }
                const failure = await writeSettings(['shells'], shells);
                if (failure !== undefined) {
                    send(500, { ok: false, error: failure });
                    return;
                }
                send(200, { ok: true, shells });
                return;
            }
            if (url.endsWith('/detect') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const body = parsed;
                const probe = normalizeEntry({
                    id: 'probe',
                    name: stringField(body.name),
                    enabled: true,
                    path: stringField(body.path),
                    description: '',
                    fullAccess: false,
                    primary: false,
                }, 0, new Set());
                const found = probe === undefined ? '' : resolveShellPath(probe);
                send(200, { ok: true, path: found });
                return;
            }
            if (url.endsWith('/preferred') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
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
                const failure = await writeSettings(['preferred'], preferred);
                if (failure !== undefined) {
                    send(500, { ok: false, error: failure });
                    return;
                }
                send(200, { ok: true, preferred });
                return;
            }
            if (url.endsWith('/bashpath') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const bashPath = stringField(parsed.bashPath).trim();
                const failure = await writeSettings(['bashPath'], bashPath);
                if (failure !== undefined) {
                    send(500, { ok: false, error: failure });
                    return;
                }
                send(200, { ok: true, bashPath });
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
    // DSH 0.2.0：settings 改为从插件 Config schema 自动投影表单，插件侧不再注册
    // namespace。配置变更由 Loader 重建 entry 后重新 apply。
    const settings = ctx.get('settings');
    if (settings !== undefined && typeof settings.configure === 'function') {
        try {
            ctx.effect(() => settings.configure({ auto: true }), 'dsh-windows-shell-policy: settings form');
        }
        catch (error) {
            ctx.logger.warn('[shell-policy] settings.configure 不可用（忽略）: %s', String(error));
        }
    }
    // 应用策略（按条目注册 / 注销 shell 工具）。
    applyPolicy();
    // 提示词工具面裁剪：本插件有工具注册成功时，隐藏 DSH 内置 bash/pwsh，
    // 让工具面完全由条目决定（内置工具名不能与本插件条目重名，见 entryProblem）。
    ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const assembled = await next();
        const ours = new Set(registeredNames);
        if (ours.size === 0)
            return assembled;
        const hidden = BUILT_IN_SHELL_TOOLS.filter((toolName) => !ours.has(toolName));
        if (hidden.length === 0)
            return assembled;
        return { ...assembled, tools: assembled.tools.filter((tool) => !hidden.includes(tool.name)) };
    });
    // 引导文本：按当前已注册的 shell 工具动态生成（sections 按会话快照）。
    ctx.systemPrompt.section({
        name: 'shell-policy',
        order: 104,
        text: () => guidanceText(),
    });
    // 卸载清理：注销动态注册的 shell 工具。
    ctx.effect(() => () => {
        disposeAll();
    }, 'dsh-windows-shell-policy: shell tool cleanup');
}
//# sourceMappingURL=index.js.map