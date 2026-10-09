/**
 * dsh-windows-shell-policy — host 侧的可执行文件解析。
 *
 * `path` 支持三种形态：绝对路径 / 纯文件名（在进程 PATH 里查找，命中即用、不回落家族候选）
 * / 留空（按家族内置候选探测 Git for Windows、MSYS2、Cygwin、PowerShell 与 PATH）。
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isPwshFamily } from './shell-args.js'
import type { ShellEntry } from './config.js'

/** `path` 是否只是可执行文件名（不含目录分隔符与盘符）。 */
function isBareExecutableName(value: string): boolean {
  return !/[\\/]/.test(value) && !/^[A-Za-z]:/.test(value)
}

/** 校验 `path` 的值域：空（自动探测）/ 绝对路径 / 纯文件名（在 PATH 里查找）。 */
function executablePathProblem(path: string): string | undefined {
  if (path.length === 0 || isAbsolute(path) || isBareExecutableName(path)) return undefined
  return `可执行文件要么填绝对路径，要么只填文件名（在 PATH 里查找）；当前值含目录分隔符却不是绝对路径：${path}`
}

/** PATH 里按可执行文件名查找（去引号；无扩展名的补 .exe——.cmd/.bat 不能直接 spawn）。 */
function pathCandidates(names: readonly string[]): string[] {
  const found: string[] = []
  for (const entry of (process.env.PATH ?? '').split(';')) {
    const dir = entry.trim().replace(/^"|"$/g, '')
    if (dir.length === 0) continue
    for (const candidateName of names) {
      if (candidateName.length === 0) continue
      found.push(join(dir, /\.[A-Za-z0-9]+$/.test(candidateName) ? candidateName : `${candidateName}.exe`))
    }
  }
  return found
}

/** bash 家族探测候选（Git for Windows 系统级/用户级、MSYS2、Cygwin、PATH）。 */
function bashCandidates(name: string): string[] {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA
  return [
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programFiles, 'Git', 'usr', 'bin', 'bash.exe'),
    join(programFilesX86, 'Git', 'bin', 'bash.exe'),
    ...localAppData !== undefined ? [join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')] : [],
    'C:\\msys64\\usr\\bin\\bash.exe',
    'C:\\cygwin64\\bin\\bash.exe',
    ...pathCandidates([name === 'bash' ? '' : name, 'bash']),
  ]
}

/** PowerShell 家族探测候选（PowerShell 7 安装位置、PATH、Windows PowerShell 5.1）。 */
function pwshCandidates(name: string): string[] {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  return [
    join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    ...pathCandidates([name === 'powershell' || name === 'pwsh' ? 'pwsh' : name, 'pwsh']),
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ]
}

/**
 * 解析条目的可执行文件：
 * - `path` 是绝对路径 → 直接用（不存在则条目不可用）；
 * - `path` 只是文件名 → 在进程 PATH 里查找（命中即用它的绝对路径，**不回落**家族候选，
 *   避免「填了 A 却起了 B」）；
 * - `path` 留空 → 按家族内置候选探测（候选里也包含 PATH）。
 * @returns 可执行文件绝对路径；未找到返回空串。
 */
function resolveShellPath(entry: ShellEntry): string {
  if (entry.path.length > 0) {
    if (isBareExecutableName(entry.path)) return resolveExecutableInPath(entry.path)
    return existsSync(entry.path) ? entry.path : ''
  }
  const candidates = isPwshFamily(entry) ? pwshCandidates(entry.name) : bashCandidates(entry.name)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

/**
 * 在进程 PATH 的每个目录里查找该可执行文件名（无扩展名时按 `<名字>.exe` 找，
 * 与 Windows 的 PATHEXT 语义一致；只有 .exe 能直接 spawn）。
 */
function resolveExecutableInPath(name: string): string {
  for (const candidate of pathCandidates([name])) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

export {
  isBareExecutableName,
  executablePathProblem,
  pathCandidates,
  bashCandidates,
  pwshCandidates,
  resolveShellPath,
  resolveExecutableInPath,
}
