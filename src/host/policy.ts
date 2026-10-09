/**
 * dsh-windows-shell-policy — host 侧的 shell 策略状态机。
 *
 * `createShellPolicy` 持有注册状态（已注册工具、其 disposer、上一次生效的配置签名），
 * 对外只暴露 5 个动作：reconcile（按最新配置幂等对齐）、statusView、registeredNames、
 * guidanceText、disposeAll。单条目的失败只写进该条目状态，不影响其它条目。
 */
import { buildTool } from './tool.js'
import { isBareExecutableName, resolveShellPath } from './detect.js'
import { entryLabel } from './config.js'
import type { ShellEntry } from './config.js'
import type { AppContext } from './context.js'

/** 条目运行时状态（配置字段 + 探测/注册结果）。 */
interface EntryStatus extends ShellEntry {
  /** 实际使用的可执行文件路径；未找到为空串。 */
  resolvedPath: string
  /** 是否已注册为工具。 */
  registered: boolean
  /** 该条目的问题描述（未启用时为空）。 */
  error?: string
}

export interface ShellPolicyDeps {
  /** 插件上下文（注册/注销工具、打日志都要用）。 */
  ctx: AppContext
  /** 是否 Windows；非 Windows 时 reconcile 不动工具面。 */
  isWindows: boolean
  /** 当前生效条目（配置值，或旧配置迁移结果）。 */
  currentEntries(): { entries: ShellEntry[]; migrated: boolean }
}

export interface ShellPolicy {
  /** 按最新 volatile 配置对齐（幂等；只在 Windows 执行）。 */
  reconcile(): void
  /** /status 的条目运行时视图。 */
  statusView(): EntryStatus[]
  /** 已成功注册的工具名。 */
  registeredNames(): readonly string[]
  /** 引导提示词（没有已注册工具时为空串）。 */
  guidanceText(): string
  /** 注销全部动态注册的工具。 */
  disposeAll(): void
}

export function createShellPolicy(deps: ShellPolicyDeps): ShellPolicy {
  const { ctx, isWindows, currentEntries } = deps

  let status: EntryStatus[] = []
  let registeredNames: string[] = []
  let appliedSignature: string | undefined
  const disposers = new Map<string, () => void>()

    /** 关闭所有已注册工具。 */
    const disposeAll = (): void => {
      for (const dispose of disposers.values()) {
        try { dispose() } catch (error) { ctx.logger.warn('[shell-policy] 注销工具失败（忽略）: %s', String(error)) }
      }
      disposers.clear()
    }

    /** 校验条目并说明不可注册的原因（undefined 表示可注册）。 */
    const entryProblem = (shell: ShellEntry, executable: string, claimed: ReadonlyMap<string, ShellEntry>): string | undefined => {
      if (shell.name.length === 0) return '工具名为空'
      if (shell.name === 'run_code') return '`run_code` 是 DSH 保留工具名，请更换'
      const previous = claimed.get(shell.name)
      if (previous !== undefined) {
        return `工具名 "${shell.name}" 与前面的条目「${entryLabel(previous)}」重复`
      }
      if (executable.length === 0) {
        if (shell.path.length > 0) {
          return isBareExecutableName(shell.path)
            ? `PATH 里没有找到可执行文件：${shell.path}`
            : `未找到可执行文件：${shell.path}`
        }
        return `未探测到「${entryLabel(shell)}」的可执行文件；请填写可执行文件名（在 PATH 里查找）、绝对路径，或点击「探测」`
      }
      if (ctx.tools.get(shell.name) !== undefined) {
        return `工具名 "${shell.name}" 已被 DSH 内置工具或其它插件占用；请改用别的名称（例如 pwsh → powershell）`
      }
      return undefined
    }

    /** 按当前配置重新应用策略：解析条目、注册/注销工具。幂等。 */
    const applyPolicy = (): void => {
      const { entries } = currentEntries()
      const signature = JSON.stringify([entries, isWindows])
      if (signature === appliedSignature) return
      appliedSignature = signature
  
      // 全量重建：条目集合、顺序或任一条目内容变化都走这里。
      disposeAll()
      const nextStatus: EntryStatus[] = []
      const nextRegistered: string[] = []
      const claimed = new Map<string, ShellEntry>()
      for (const shell of entries) {
        const item: EntryStatus = { ...shell, resolvedPath: '', registered: false }
        if (!shell.enabled) {
          nextStatus.push(item)
          continue
        }
        const executable = resolveShellPath(shell)
        item.resolvedPath = executable
        const problem = entryProblem(shell, executable, claimed)
        if (problem !== undefined) {
          item.error = problem
          nextStatus.push(item)
          continue
        }
        claimed.set(shell.name, shell)
        try {
          disposers.set(shell.id, ctx.tools.register(buildTool(ctx, shell, executable)))
          item.registered = true
          nextRegistered.push(shell.name)
        } catch (error) {
          item.error = `工具注册失败：${String(error)}`
        }
        nextStatus.push(item)
      }
      status = nextStatus
      registeredNames = nextRegistered
      ctx.logger.info('[shell-policy] 已注册 shell 工具: %s', nextRegistered.length > 0 ? nextRegistered.join(', ') : '(无)')
    }

    /** 条目运行时视图（非 Windows 下没有策略状态，按配置给出静态视图）。 */
    const statusView = (): EntryStatus[] => {
      if (isWindows) return status
      return currentEntries().entries.map((shell) => ({ ...shell, resolvedPath: '', registered: false }))
    }

    /** 引导提示词：列出已注册的 shell 工具与优先项；没有工具时不注入内容。 */
    const guidanceText = (): string => {
      const registered = status.filter((item) => item.registered)
      if (registered.length === 0) return ''
      const preferred = registered.find((item) => item.primary) ?? registered[0]
      const list = registered.map((item) => `\`${item.name}\``).join(', ')
      const lead = registered.length === 1
        ? `The \`${preferred?.name}\` tool is the shell.`
        : `Prefer \`${preferred?.name}\` for shell commands; the other available shells are for tasks that need them.`
      return `Windows shell policy: available shell tools: ${list}. ${lead} `
        + 'Check the [exit code: N] marker on every shell result; investigate failures before moving on.'
    }

    /**
     * 按当前 volatile 配置重新应用策略（幂等）。
     *
     * DSH 对「只有 volatile 字段变化」的 entry 更新**不会重挂插件**：loader 把新值
     * 原地写进已有的 Volatile 引用（cosmokit `updateVolatile`）并发 `loader/volatile-update`，
     * 不再调用 apply。所以设置面板保存之后必须自己重新读配置，否则工具注册与 /status
     * 会一直停在 apply 时的快照——用户看到的就是「保存后修改全部消失」。
     */
    const reconcile = (): void => {
      if (isWindows) applyPolicy()
    }

  return { reconcile, statusView, registeredNames: () => registeredNames, guidanceText, disposeAll }
}

export type { EntryStatus }
