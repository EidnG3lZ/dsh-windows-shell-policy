/**
 * dsh-windows-shell-policy — host 侧的单个 shell 工具定义。
 *
 * `buildTool` 把「一个条目 + 已解析的可执行文件」编译成 `defineTool` 定义：
 * 参数面、输出 schema、执行链（workdir → 沙箱 confine / 升级审批 → argv → spawn）、
 * 终端卡片展示。执行链的全部复杂度都收在这个模块里。
 */
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ConfinedArgv, SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { ESCALATION_TARGETS, approveEscalation, validateEscalationArgs } from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import type { JobOutcome } from '@deepseek-ai/dsh-jobs'
import { isAbsolute, resolve } from 'node:path'
import { buildArgv, defaultToolDescription, isPwshFamily } from './shell-args.js'
import { parseExitStatus, renderShellResult } from './result.js'
import type { BashResult } from './result.js'
import type { AppContext } from './context.js'
import type { ShellEntry } from './config.js'

/** shell 工具参数。 */
interface ShellToolArgs {
  command: string
  description: string
  timeoutMs?: number
  workdir?: string
  run_in_background?: boolean
  sandbox_permissions?: string
  justification?: string
}

/** 从进程环境挑出 DSH_* 托管变量传给子进程。 */
function collectDshEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('DSH_') && value !== undefined) env[key] = value
  }
  return env
}

/** 构造一个条目的工具定义（闭包捕获条目与已解析的可执行文件）。 */
export function buildTool(ctx: AppContext, shell: ShellEntry, executable: string): ReturnType<typeof defineTool> {
  const pwsh = isPwshFamily(shell)
  // 沙箱升级面是 composition 级事实（sandbox + sandboxPolicy 服务存在与否）；
  // fullAccess 条目本来就跳过 confine，因此不广告升级参数。
  const escalationModes: readonly SandboxMode[] =
    !shell.fullAccess && ctx.get('sandbox') !== undefined && ctx.get('sandboxPolicy') !== undefined
      ? ESCALATION_TARGETS
      : []
  // 与面板「新建条目预填 / 重置为默认」共用同一份模板（POST /defaults）。
  const defaultDescription = defaultToolDescription(shell, executable)

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
      run_in_background: { type: 'boolean' as const, description: 'Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies.' },
      ...escalationModes.length > 0 ? {
        sandbox_permissions: {
          type: 'string' as const,
          enum: [...ESCALATION_TARGETS],
          description: 'The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval.',
        },
        justification: {
          type: 'string' as const,
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
      render: (_args: unknown, value: unknown) => {
        const v = value as BashResult | { kind: 'background'; jobId: string }
        if (typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'background') {
          return [{ type: 'text', text: `started background job ${v.jobId}` }]
        }
        return [{ type: 'text', text: renderShellResult(v as BashResult, escalationModes) }]
      },
    },
    async execute(args: ShellToolArgs, exec) {
      if (args.command.trim().length === 0) {
        throw new Error('invalid command: expected a non-empty string')
      }
      if (args.description.trim().length === 0) {
        throw new Error('invalid description: expected a non-empty string')
      }
      if (shell.fullAccess) {
        if (args.sandbox_permissions !== undefined || args.justification !== undefined) {
          throw new Error(`shell "${shell.name}" runs with full sandbox access (fullAccess); sandbox_permissions/justification do not apply`)
        }
      } else {
        validateEscalationArgs(args.sandbox_permissions, args.justification)
      }

      // workdir：显式相对路径按 session cwd 解析；缺省用 session cwd。
      const headerCwd = exec.agent?.session.header.cwd
      let workdir = args.workdir
      if (workdir !== undefined && headerCwd !== undefined && !isAbsolute(workdir)) {
        workdir = resolve(headerCwd, workdir)
      } else if (workdir === undefined) {
        workdir = headerCwd ?? process.cwd()
      }

      // 沙箱策略：standing policy + 升级请求（fullAccess 条目完全跳过沙箱）。
      const sandbox = ctx.get('sandbox')
      const sandboxPolicy: SandboxPolicyService | undefined = ctx.get('sandboxPolicy')
      const standingPolicy = sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
      let policy: SandboxExecutionPolicy | undefined = standingPolicy
      if (!shell.fullAccess && args.sandbox_permissions !== undefined && args.justification !== undefined) {
        if (escalationModes.length === 0) {
          throw new Error('sandbox_permissions is not available in this composition (no sandboxing executor to escalate)')
        }
        const approvedMode = await approveEscalation(
          { requestedMode: args.sandbox_permissions, justification: args.justification, effectiveMode: (standingPolicy as SandboxExecutionPolicy).mode, subject: 'command' },
          {
            approver: ctx.get('approval'),
            agent: exec.agent,
            callId: exec.callId,
            toolName: shell.name,
            signal: exec.signal,
          },
        )
        policy = { ...(standingPolicy as SandboxExecutionPolicy), mode: approvedMode }
      }

      // argv 构造 + 沙箱 confine（DSH 0.2.0 起 confine 为异步）。
      // argv 全部由条目的启动参数模板生成（可执行文件之后的部分），{command} 替换成实际命令；
      // 模板留空时用家族默认（bash `-c {command}`、PowerShell `-NoLogo … -Command {command}`），
      // 因此要换掉 `-c` 这类取命令的开关只需改 args（见 ShellEntry.args）。
      let argv: string[] = buildArgv(shell, executable, pwsh, args.command)
      let confined: ConfinedArgv | undefined
      if (!shell.fullAccess && policy !== undefined && policy.mode !== 'danger-full-access' && sandbox !== undefined) {
        confined = await sandbox.confine(argv, { ...policy, mode: policy.mode })
        argv = confined.argv
      }

      const collect = { maxBytes: 64_000, spill: { maxBytes: 64 * 1024 * 1024 } }
      const spawnSpec = (signal: AbortSignal | undefined): SubprocessSpawnSpec => ({
        argv,
        cwd: workdir,
        stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
        graceMs: 3_000,
        signal,
        env: collectDshEnv(),
      })

      // 后台：jobs 通道，cancel/readOutput 增量。
      if (args.run_in_background === true) {
        const jobs = ctx.get('jobs')
        if (jobs === undefined) {
          throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
        }
        if (exec.signal.aborted) {
          const error = new HarnessError('tool call aborted', TOOL_ABORTED)
          error.name = 'AbortError'
          throw error
        }
        const id = jobs.start({
          kind: 'bash',
          label: args.command,
          // DSH 0.2.0 起 owner 为 SessionId（不再是 Agent 实例）。
          ...exec.agent ? { owner: exec.agent.id } : {},
          run: () => {
            const handle = ctx.subprocess.spawn(spawnSpec(undefined))
            let stdoutOffset = 0
            let stderrOffset = 0
            return {
              cancel: () => handle.terminate(),
              done: handle.done.then((outcome): JobOutcome => ({
                status: outcome.exitCode === 0 ? 'completed' : 'failed',
                detail: `exit code: ${outcome.exitCode}`,
              })),
              readOutput: () => {
                const out = handle.collected.stdout?.readFrom(stdoutOffset)
                const err = handle.collected.stderr?.readFrom(stderrOffset)
                stdoutOffset = out?.nextOffset ?? stdoutOffset
                stderrOffset = err?.nextOffset ?? stderrOffset
                const outText = out?.text ?? ''
                const errText = err?.text ?? ''
                const separator = outText.length > 0 && !outText.endsWith('\n') ? '\n' : ''
                return outText + (errText.length > 0 ? `${separator}[stderr]\n${errText}` : '')
              },
            }
          },
        })
        return { kind: 'background' as const, jobId: id }
      }

      // 前台。
      const timeoutMs = args.timeoutMs !== undefined && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
        ? args.timeoutMs
        : 120_000
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const onAbort = (): void => controller.abort()
      exec.signal?.addEventListener('abort', onAbort)
      try {
        const handle = ctx.subprocess.spawn(spawnSpec(controller.signal))
        const outcome = await handle.done
        const out = handle.collected.stdout?.readFrom(0)
        const err = handle.collected.stderr?.readFrom(0)
        const stderrText = err?.text ?? ''
        const denied = confined !== undefined
          && outcome.exitCode !== 0
          && confined.denialSignatures.some((signature) => stderrText.toLowerCase().includes(signature.toLowerCase()))
        const result: BashResult = {
          exitCode: outcome.exitCode,
          timedOut: controller.signal.aborted && exec.signal?.aborted !== true,
          aborted: exec.signal?.aborted === true,
          stdout: { text: out?.text ?? '', truncated: out?.lossy ?? false },
          stderr: { text: stderrText, truncated: err?.lossy ?? false },
          ...denied ? { sandbox: { mode: policy?.mode ?? 'read-only', denied: true } } : {},
        }
        if (result.aborted) {
          const error = new HarnessError('tool call aborted', TOOL_ABORTED)
          error.name = 'AbortError'
          throw error
        }
        return result
      } finally {
        clearTimeout(timer)
        exec.signal?.removeEventListener('abort', onAbort)
      }
    },
    // 终端卡片展示：与官方 tool-bash/pwsh 一致，对话页可点击查看命令。
    presentCall: (args: ShellToolArgs) => ({
      card: 'terminal',
      title: args.command,
      description: args.description,
      ...args.workdir !== undefined ? { cwd: args.workdir } : {},
    }),
    presentResult: (args: unknown, result: { content: Array<{ type: string; text?: string }>; isError: boolean }) => {
      const block = result.content.length === 1 ? result.content[0] : undefined
      if (block === undefined || block.type !== 'text' || block.text === undefined) return undefined
      const raw = block.text
      const isBackground = typeof args === 'object' && args !== null && (args as { run_in_background?: unknown }).run_in_background === true
      if (isBackground || result.isError) {
        return { card: 'generic', content: [{ type: 'text', text: `\`\`\`console\n${raw.replace(/\n+$/, '')}\n\`\`\`` }] }
      }
      const { body, ...exit } = parseExitStatus(raw)
      return { card: 'terminal', output: body, ...exit }
    },
  })
}
