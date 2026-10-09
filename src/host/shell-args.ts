/**
 * dsh-windows-shell-policy — host 侧的 shell 方言判定、启动参数模板与 argv 构造。
 *
 * 「启动参数」是**可执行文件之后的全部参数**模板：`{command}` 占位实际命令，留空用家族默认。
 * 默认工具提示词也只有这一份（`defaultToolDescription`），面板经 POST /defaults 取它预填。
 */
import type { ShellEntry } from './config.js'

/** PowerShell 家族命令的 UTF-8 输出前缀（Windows PowerShell 5.1 默认按控制台代码页输出）。 */
const PWSH_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); '

/** 是否 PowerShell 家族（决定 `-Command` 调用方言与探测候选）。 */
function isPwshFamily(entry: Pick<ShellEntry, 'name' | 'path'>): boolean {
  const hint = `${entry.name} ${entry.path}`.toLowerCase()
  return hint.includes('pwsh') || hint.includes('powershell')
}

/** 启动参数模板里的占位符：会被替换成实际命令。 */
const COMMAND_PLACEHOLDER = '{command}'

/**
 * 解析「启动参数」文本：空白分隔，双引号分组，`\\"` 表示字面量引号。
 * @returns 参数数组；引号未闭合返回 undefined（保存校验据此报错）。
 */
function parseArgs(text: string): string[] | undefined {
  const parsed: string[] = []
  let current = ''
  let quoted = false
  let started = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\\' && text[index + 1] === '"') {
      current += '"'
      index += 1
      started = true
      continue
    }
    if (char === '"') {
      quoted = !quoted
      started = true
      continue
    }
    if (!quoted && /\s/.test(char as string)) {
      if (started) {
        parsed.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += char
    started = true
  }
  if (quoted) return undefined
  if (started) parsed.push(current)
  return parsed
}

/** 条目的启动参数模板（可执行文件之后的全部参数）；留空用家族默认，其中包含取命令的开关。 */
function argTemplate(entry: Pick<ShellEntry, 'args'>, pwsh: boolean): string {
  const text = entry.args.trim()
  if (text.length > 0) return text
  return pwsh
    ? `-NoLogo -NoProfile -NonInteractive -Command ${COMMAND_PLACEHOLDER}`
    : `-c ${COMMAND_PLACEHOLDER}`
}

/** 校验启动参数模板：引号闭合，且非空模板必须含 {command}（否则命令不会传给 shell）。 */
function argTemplateProblem(text: string): string | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  if (parseArgs(trimmed) === undefined) return '启动参数的引号未闭合'
  if (!trimmed.includes(COMMAND_PLACEHOLDER)) {
    return `启动参数里必须写 ${COMMAND_PLACEHOLDER} 占位符（替换成实际命令）；留空则用家族默认，例如 -c ${COMMAND_PLACEHOLDER}`
  }
  return undefined
}

/**
 * 条目的默认工具提示词。面板新建条目时经 POST /defaults 取同一份文本预填，
 * 「重置为默认」也用它，因此 host 与面板不会各写一份模板。
 */
/** 按条目的启动参数模板构造 argv（{command} 替换成实际命令；PowerShell 家族加 UTF-8 前缀）。 */
function buildArgv(entry: ShellEntry, executable: string, pwsh: boolean, command: string): string[] {
  const payload = pwsh ? PWSH_PREAMBLE + command : command
  const tokens = parseArgs(argTemplate(entry, pwsh)) ?? []
  return [executable, ...tokens.map((token) => token.replaceAll(COMMAND_PLACEHOLDER, payload))]
}

export function defaultToolDescription(
  entry: Pick<ShellEntry, 'name' | 'path' | 'args'>,
  executable: string,
): string {
  const pwsh = isPwshFamily(entry)
  const resolved = executable.trim()
  const configured = entry.path.trim()
  const target = resolved.length > 0 ? resolved : configured.length > 0 ? configured : `<${entry.name} executable>`
  // 展示除 {command} 以外的启动参数（即取命令的开关与额外开关）。
  const flags = (parseArgs(argTemplate(entry, pwsh)) ?? [])
    .map((token) => token.replaceAll(COMMAND_PLACEHOLDER, '').trim())
    .filter((token) => token.length > 0)
    .join(' ')
  const invocation = flags.length > 0 ? `${target} ${flags}` : target
  return `Execute a ${entry.name} command (${invocation}) and return its stdout/stderr. `
    + 'Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — '
    + 'pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`. '
    + 'Long output is truncated to its tail. '
    + 'Set `run_in_background: true` for long-running commands: the call returns a job id immediately; '
    + 'read its output with `job_output` and stop it with `job_kill`.'
}

export {
  PWSH_PREAMBLE,
  COMMAND_PLACEHOLDER,
  isPwshFamily,
  parseArgs,
  argTemplate,
  argTemplateProblem,
  buildArgv,
}
