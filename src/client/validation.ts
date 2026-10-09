/**
 * dsh-windows-shell-policy — client 侧的保存前预校验与名称推导。
 *
 * 与 host 的规则各有一份（见 DECISIONS D4 / RISKS R4）：host 负责最终校验与执行，
 * 这份只用于面板即时反馈，改 host 规则时必须同步这里。
 */
import type { DraftEntry, EntryStatus } from './types.js'

/** 启动参数模板里的占位符（与 host 的 COMMAND_PLACEHOLDER 一致）。 */
const COMMAND_PLACEHOLDER = '{command}'

/** `path` 是否只是可执行文件名（与 host 的 isBareExecutableName 一致）。 */
function isBareExecutableName(value: string): boolean {
  return !/[\\/]/.test(value) && !/^[A-Za-z]:/.test(value)
}

/** 启动参数模板的保存前问题（与 host 的 argTemplateProblem 一致）。 */
function argTemplateProblem(text: string | undefined): string | undefined {
  const trimmed = (text ?? '').trim()
  if (trimmed.length === 0) return undefined
  if (parseArgs(trimmed) === undefined) return '启动参数的引号未闭合'
  if (!trimmed.includes(COMMAND_PLACEHOLDER)) {
    return `启动参数里必须写 ${COMMAND_PLACEHOLDER} 占位符（替换成实际命令）；留空则用家族默认，例如 -c ${COMMAND_PLACEHOLDER}`
  }
  return undefined
}

/** 解析「启动参数」文本（与 host 的 parseArgs 规则一致）；引号未闭合返回 undefined。 */
function parseArgs(text: string | undefined): string[] | undefined {
  const source = text ?? ''
  const parsed: string[] = []
  let current = ''
  let quoted = false
  let started = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\\' && source[index + 1] === '"') {
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

/** 与 host 一致的默认工具名推导（pwsh 让位给内置工具，改名为 powershell）。 */
function deriveName(path: string): string {
  const base = path.replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|sh)$/i, '')
  const cleaned = base
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 64)
  if (cleaned === 'pwsh') return 'powershell'
  return cleaned
}

/** 条目的生效工具名（空名称时由路径推导，与 host 行为一致）。 */
function effectiveName(entry: DraftEntry): string {
  const explicit = entry.name
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
  if (explicit.length > 0) return explicit
  const derived = deriveName(entry.path.trim())
  return derived.length > 0 ? derived : 'shell'
}

/** 面板里的条目名（显示名优先，留空回落到工具名 / 可执行文件名推导）。 */
function displayName(entry: DraftEntry): string {
  const label = (entry.label ?? '').trim()
  if (label.length > 0) return label
  const explicit = entry.name.trim()
  if (explicit.length > 0) return explicit
  const derived = deriveName(entry.path.trim())
  return derived.length > 0 ? derived : '未命名'
}

/** 条目的保存前问题（undefined 表示可保存）。 */
function entryProblem(entry: DraftEntry, all: readonly DraftEntry[]): string | undefined {
  if (!entry.enabled) return undefined
  const name = effectiveName(entry)
  if (name === 'run_code') return '工具名 run_code 是 DSH 保留名'
  const conflict = all.find((other) => other !== entry && other.enabled && effectiveName(other) === name)
  if (conflict !== undefined) {
    return `工具名 "${name}" 与「${displayName(conflict)}」重复`
  }
  const path = entry.path.trim()
  const absolute = /^[A-Za-z]:[\\/]|^\//.test(path)
  if (path.length > 0 && !absolute && !isBareExecutableName(path)) {
    return '可执行文件要么填绝对路径，要么只填文件名（在 PATH 里查找）'
  }
  const argsProblem = argTemplateProblem(entry.args)
  if (argsProblem !== undefined) return argsProblem
  return undefined
}

/** 从 /status 视图取面板草稿（丢弃运行时字段）。 */
function toDraft(entry: EntryStatus): DraftEntry {
  return {
    id: entry.id,
    name: entry.name,
    label: entry.label ?? '',
    enabled: entry.enabled,
    path: entry.path,
    args: entry.args ?? '',
    description: entry.description,
    fullAccess: entry.fullAccess,
    primary: entry.primary,
  }
}

export {
  COMMAND_PLACEHOLDER,
  isBareExecutableName,
  argTemplateProblem,
  parseArgs,
  deriveName,
  effectiveName,
  displayName,
  entryProblem,
  toDraft,
}
