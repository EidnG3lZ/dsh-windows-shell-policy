/**
 * dsh-windows-shell-policy — Windows 默认 Shell 策略组合插件（host 侧）。
 *
 * 职责：
 * 1. 探测 git-bash / MSYS2 / Cygwin 可执行文件（显式 bashPath → 常见安装路径 → PATH）。
 * 2. 通过 settings namespace `shell-policy` 暴露 preferred（auto/bash/pwsh）配置，
 *    在「设置 - 插件 - 插件配置」面板由 client 卡片编辑。
 * 3. 策略生效：effective=bash 时动态注册 `bash` 工具（git-bash 执行），
 *    并在 system-prompt/assemble 中裁剪掉 `pwsh` 工具；effective=pwsh 时注销
 *    bash 工具并裁剪掉 `bash`（官方 tool-pwsh 继续工作）。
 * 4. 提供 /dsh-shell-policy/api/status 供 client 卡片显示探测状态。
 */
import type { Context } from 'cordis'
import z from 'schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'dsh-windows-shell-policy'
export const inject = ['tools', 'subprocess', 'systemPrompt', 'webServer']

/** 本插件拥有的 settings namespace（与官方 shell namespace 区分）。 */
const NS = settingsNamespace('shell-policy')

export interface Config {
  /** 首选 shell：auto（探测到 bash 则用 bash，否则 pwsh）/ bash / pwsh。 */
  preferred: 'auto' | 'bash' | 'pwsh'
  /** 显式 bash 可执行文件路径；留空则自动探测。 */
  bashPath: string
}

export const Config = z.object({
  preferred: z.union([z.const('auto'), z.const('bash'), z.const('pwsh')]).default('auto'),
  bashPath: z.string().default(''),
})

type ResolvedConfig = { preferred: 'auto' | 'bash' | 'pwsh'; bashPath: string }

/** bash 探测结果。 */
interface BashProbe {
  found: boolean
  path: string
}

/** 探测 bash 可执行文件：显式路径 → 常见安装位置 → PATH。 */
function probeBash(explicit: string): BashProbe {
  if (explicit.length > 0) {
    return existsSync(explicit) ? { found: true, path: explicit } : { found: false, path: explicit }
  }
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const candidates = [
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programFilesX86, 'Git', 'bin', 'bash.exe'),
    'C:\\msys64\\usr\\bin\\bash.exe',
    'C:\\cygwin64\\bin\\bash.exe',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { found: true, path: candidate }
  }
  for (const entry of (process.env.PATH ?? '').split(';')) {
    const trimmed = entry.trim().replace(/^"|"$/g, '')
    if (trimmed.length === 0) continue
    const candidate = join(trimmed, 'bash.exe')
    if (existsSync(candidate)) return { found: true, path: candidate }
  }
  return { found: false, path: '' }
}

/** 从进程环境挑出 DSH_* 托管变量传给子进程。 */
function collectDshEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('DSH_') && value !== undefined) env[key] = value
  }
  return env
}

/** bash 工具结果形状。 */
interface BashResult {
  exitCode: number | null
  timedOut: boolean
  aborted: boolean
  stdout: { text: string; truncated: boolean }
  stderr: { text: string; truncated: boolean }
}

/** 渲染 bash 工具结果文本（对齐官方 shell 工具：exit 标记在末尾，exit 0 不报）。 */
function renderBashResult(value: BashResult): string {
  let body = value.stdout.text
  if (value.stderr.text.length > 0) {
    if (body.length > 0 && !body.endsWith('\n')) body += '\n'
    body += `[stderr]\n${value.stderr.text}`
  }
  if (body.length === 0) body = '(no output)'
  const markers: string[] = []
  if (value.timedOut) markers.push('[timed out]')
  if (value.aborted) markers.push('[aborted]')
  else if (value.exitCode !== null && value.exitCode !== 0) markers.push(`[exit code: ${value.exitCode}]`)
  if (markers.length === 0) return body
  if (!body.endsWith('\n')) body += '\n'
  return body + markers.join('\n')
}

/**
 * 从渲染结果末尾拆出 exit 状态（官方 parseExitStatus 的本地等价实现）：
 * 终端卡片把 exit 状态显示为独立 pill，标记须从输出体移除。
 */
function parseExitStatus(text: string): { body: string; exitCode?: number; signal?: string } {
  const signal = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text)
  if (signal?.[1] !== undefined) return { body: text.slice(0, signal.index), signal: signal[1] }
  const exit = /\n\[exit code: (\d+)\]$/.exec(text)
  if (exit?.[1] !== undefined) return { body: text.slice(0, exit.index), exitCode: Number(exit[1]) }
  return { body: text, exitCode: 0 }
}

/** bash 工具参数。 */
interface BashToolArgs {
  command: string
  description: string
  timeoutMs?: number
  workdir?: string
}

/** 本插件消费的 host 服务面（webServer 类型由本包声明）。 */
type AppContext = Context & {
  webServer: {
    register(spec: {
      kind: 'prefix'
      path: string
      handler: (req: unknown, res: { writeHead(code: number, headers: Record<string, string>): void; end(body: string): void }) => void | Promise<void>
    }): () => void
  }
}

export function apply(ctx: AppContext, config: Config): void {
  const entry = config as ResolvedConfig
  let source: () => ResolvedConfig = () => entry
  let probe: BashProbe = probeBash(entry.bashPath)
  let effective: 'bash' | 'pwsh' = 'pwsh'
  let bashDisposer: (() => void) | undefined

  /** 按当前配置重新应用策略：探测 bash、切换工具注册。幂等。 */
  const applyPolicy = (): void => {
    const cfg = source()
    probe = probeBash(cfg.bashPath)
    const wanted = cfg.preferred === 'auto' ? (probe.found ? 'bash' : 'pwsh') : cfg.preferred
    const next = wanted === 'bash' && probe.found ? 'bash' : 'pwsh'
    if (next === effective && (next !== 'bash' || bashDisposer !== undefined)) return
    effective = next
    if (effective === 'bash') {
      try {
        bashDisposer = ctx.tools.register(defineTool({
          name: 'bash',
          description: 'Execute a bash command (git-bash on Windows) and return its stdout/stderr. '
            + 'Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — '
            + 'pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`. '
            + 'Long output is truncated to its tail.',
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
            workdir: { type: 'string', description: 'Working directory for this command. Defaults to the harness process cwd.' },
          },
          output: {
            schema: {
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
              },
            },
            render: (_args: unknown, value: unknown) => [{ type: 'text', text: renderBashResult(value as BashResult) }],
          },
          async execute(args: BashToolArgs, exec) {
            if (args.command.trim().length === 0) {
              throw new Error('invalid command: expected a non-empty string')
            }
            if (args.description.trim().length === 0) {
              throw new Error('invalid description: expected a non-empty string')
            }
            const timeoutMs = args.timeoutMs !== undefined && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
              ? args.timeoutMs
              : 120_000
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), timeoutMs)
            const onAbort = (): void => controller.abort()
            exec.signal?.addEventListener('abort', onAbort)
            const collect = { maxBytes: 64_000, spill: { maxBytes: 64 * 1024 * 1024 } }
            try {
              const handle = ctx.subprocess.spawn({
                argv: [probe.path, '-c', args.command],
                cwd: args.workdir ?? process.cwd(),
                stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
                graceMs: 3_000,
                signal: controller.signal,
                env: collectDshEnv(),
              } satisfies SubprocessSpawnSpec)
              const outcome = await handle.done
              const out = handle.collected.stdout?.readFrom(0)
              const err = handle.collected.stderr?.readFrom(0)
              return {
                exitCode: outcome.exitCode,
                timedOut: controller.signal.aborted && exec.signal?.aborted !== true,
                aborted: exec.signal?.aborted === true,
                stdout: { text: out?.text ?? '', truncated: out?.lossy ?? false },
                stderr: { text: err?.text ?? '', truncated: err?.lossy ?? false },
              } satisfies BashResult
            } finally {
              clearTimeout(timer)
              exec.signal?.removeEventListener('abort', onAbort)
            }
          },
          // 终端卡片展示：与官方 tool-bash/pwsh 一致，对话页可点击查看命令。
          presentCall: (args: BashToolArgs) => ({
            card: 'terminal',
            title: args.command,
            description: args.description,
            ...args.workdir !== undefined ? { cwd: args.workdir } : {},
          }),
          presentResult: (args: unknown, result: { content: Array<{ type: string; text?: string }>; isError: boolean }) => {
            const block = result.content.length === 1 ? result.content[0] : undefined
            if (block === undefined || block.type !== 'text' || block.text === undefined) return undefined
            const raw = block.text
            if (result.isError) {
              return { card: 'generic', content: [{ type: 'text', text: `\`\`\`console\n${raw.replace(/\n+$/, '')}\n\`\`\`` }] }
            }
            const { body, ...exit } = parseExitStatus(raw)
            return { card: 'terminal', output: body, ...exit }
          },
        }))
        ctx.logger.info('[shell-policy] bash 工具已注册（%s）', probe.path)
      } catch (error) {
        bashDisposer = undefined
        effective = 'pwsh'
        ctx.logger.warn('[shell-policy] bash 工具注册失败，回落 pwsh: %s', String(error))
      }
    } else {
      bashDisposer?.()
      bashDisposer = undefined
      ctx.logger.info('[shell-policy] 生效 shell: pwsh')
    }
  }

  // settings 装配：preferred/bashPath 可被用户层覆盖，变化时重新应用策略。
  installSettingsSection(ctx, NS, Config, entry, {
    setSource: (current) => { source = current },
    onChange: applyPolicy,
  })

  // 无 settings 服务时的兜底（settings 服务存在时 applyPolicy 幂等跳过）。
  applyPolicy()

  // 提示词工具面裁剪：effective=bash 时隐藏 pwsh，反之隐藏 bash。
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    if (effective === 'bash') {
      return { ...assembled, tools: assembled.tools.filter((tool) => tool.name !== 'pwsh') }
    }
    if (effective === 'pwsh') {
      return { ...assembled, tools: assembled.tools.filter((tool) => tool.name !== 'bash') }
    }
    return assembled
  })

  // 引导文本。
  ctx.systemPrompt.section({
    name: 'shell-policy',
    order: 104,
    text: 'Windows shell policy: the `bash` tool (git-bash) is the default shell. '
      + 'Check the [exit code: N] marker on every bash result; investigate failures before moving on.',
  })

  // 状态 API（client 卡片消费）。settings 的 client 端 RPC 有 allowlist
  // 限制（apiproxy WEB_SETTINGS_NAMESPACES），本插件 namespace 不在其中，
  // 因此卡片读写都走本 API：host 端直接经 settings 服务持久化。
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-shell-policy/api',
    handler: async (req: any, res: any) => {
      const url = String(req.url ?? '')
      const send = (code: number, body: unknown): void => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(body))
      }
      if (url.endsWith('/status') && req.method === 'GET') {
        send(200, {
          platform: process.platform,
          bashFound: probe.found,
          bashPath: probe.path,
          effective,
          preferred: source().preferred,
        })
        return
      }
      if (url.endsWith('/preferred') && req.method === 'POST') {
        const raw = await new Promise<string>((resolve, reject) => {
          let data = ''
          req.on('data', (chunk: any) => { data += chunk })
          req.on('end', () => resolve(data))
          req.on('error', reject)
        })
        let parsed: { preferred?: unknown }
        try {
          parsed = JSON.parse(raw) as { preferred?: unknown }
        } catch {
          send(400, { ok: false, error: 'invalid json body' })
          return
        }
        const preferred = parsed.preferred
        if (preferred !== 'auto' && preferred !== 'bash' && preferred !== 'pwsh') {
          send(400, { ok: false, error: 'preferred must be auto | bash | pwsh' })
          return
        }
        const settings = ctx.get('settings')
        if (settings === undefined) {
          send(500, { ok: false, error: 'settings service unavailable' })
          return
        }
        try {
          await settings.mutate(NS, [{ op: 'set', path: ['preferred'], value: preferred }])
          send(200, { ok: true, preferred, effective })
        } catch (error) {
          send(500, { ok: false, error: String(error) })
        }
        return
      }
      send(404, { ok: false, error: 'not found' })
    },
  }), 'dsh-windows-shell-policy: status api')

  // 卸载清理：注销动态注册的 bash 工具。
  ctx.effect(() => () => {
    bashDisposer?.()
    bashDisposer = undefined
  }, 'dsh-windows-shell-policy: bash tool cleanup')
}
