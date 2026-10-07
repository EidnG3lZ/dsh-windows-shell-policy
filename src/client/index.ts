/**
 * dsh-windows-shell-policy — client 配置页（plugins.bundle.config）。
 *
 * 在插件管理页的本插件详情页注册「Shell 工具」配置面板：可增删的 shell 条目列表。
 * 列表里的条目是**折叠态**——只显示名称（只读；显示名优先，留空回落到工具名）、启用开关
 * 与「默认」单选，避免长条目撑满屏幕；显示名、工具名、可执行文件路径（可探测）、工具提示词、
 * 沙箱完全权限与删除都收进该条目单独的「配置」界面（点行尾「配置」进入，点「返回列表」退出）。
 * 新建条目的「工具提示词」由 host 的 POST /defaults 预填成默认模板（面板不再各写一份
 * 模板），并可随时「重置为默认」。
 * 读写走 host 插件自己的 API
 * （/dsh-shell-policy/api/status、/shells、/detect、/defaults）——settings 的 client 端 RPC 有
 * apiproxy allowlist 限制，本插件 namespace 不在其中，故不依赖 settingsScope；
 * host 端仍经 settings 服务持久化。监听 settings/document-updated 事件实时刷新。
 *
 * 构建：npm run build:client（tsdown，产物 lib/client.js，ModuleLoader.load 注册）。
 * 必坑（2026-08 实测）：① apply 用 ctx.slots 必须 export const inject
 * = ['slots']（服务注入声明）；② register 必须带 name 字段（= slot 名）；
 * ③ rc.7 起该 slot 为 kind:'keyed'，注册必须带 key。
 */
import { createElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'

type ClientContext = {
  slots: SlotsService
  remote: {
    $on(event: string, callback: (ref?: unknown) => void): () => void
  }
}

export const inject = ['slots', 'remote']

/** 条目数量上限（与 host 保持一致）。 */
const MAX_ENTRIES = 16

/** host /status 返回的单个条目。 */
interface EntryStatus {
  id: string
  name: string
  /** 面板显示名；旧版 host 的 /status 没有这个字段，读取时兜底成空串。 */
  label?: string
  enabled: boolean
  path: string
  /** 旧版 host 的 /status 没有这个字段，读取时兜底成空串。 */
  args?: string
  description: string
  fullAccess: boolean
  primary: boolean
  resolvedPath: string
  registered: boolean
  error?: string
}

/** host 状态 API 返回。 */
interface Status {
  platform: string
  supported: boolean
  entries: EntryStatus[]
  migrated: boolean
  registered: string[]
  registerError?: string
}

/** 面板中的条目（草稿；notice 仅 UI 使用）。 */
interface DraftEntry {
  id: string
  name: string
  /** 面板显示名（只影响面板显示，不进入工具面）。 */
  label: string
  enabled: boolean
  path: string
  args: string
  description: string
  fullAccess: boolean
  primary: boolean
  notice?: string
}

// ── 样式：与官方 PluginCard.module.css 同构（内联，CSS 变量一致）──────────

const cardStyle: Record<string, string> = {
  listStyle: 'none',
  // border 简写在 React inline style 下拆解会丢失（border-color 回落 currentColor 黑色），
  // 必须用长写属性（官方卡片走 CSS class 无此问题）。
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--dsw-alias-border-l2)',
  borderRadius: '12px',
  background: 'var(--dsw-alias-bg-layer-3)',
  transition: 'border-color .16s, background .16s',
}

const cardOpenStyle: Record<string, string> = {
  background: 'var(--dsw-alias-bg-layer-2)',
  borderColor: 'var(--dsw-alias-label-dimmed)',
}

const headerStyle: Record<string, string> = {
  width: '100%',
  appearance: 'none',
  borderWidth: '0',
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '12px',
}

const headTextStyle: Record<string, string> = {
  flex: '1',
  minWidth: '0',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const nameStyle: Record<string, string> = {
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: '1.4',
  color: 'var(--dsw-alias-label-primary)',
}

const descriptionStyle: Record<string, string> = {
  fontSize: '13px',
  lineHeight: '1.5',
  color: 'var(--dsw-alias-label-tertiary)',
}

const chevronStyle: Record<string, string> = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
  transition: 'transform .16s',
  display: 'flex',
}

const chevronOpenStyle: Record<string, string> = {
  transform: 'rotate(180deg)',
}

/** 官方 IconChevronDownOutline14 的等价 SVG（fill=currentColor 继承 chevron 颜色）。 */
function ChevronIcon() {
  return createElement('svg', {
    width: 14,
    height: 14,
    viewBox: '0 0 14 14',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  },
    createElement('path', {
      d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z',
      fill: 'currentColor',
    }),
  )
}

const pendingStyle: Record<string, string> = {
  flex: 'none',
  borderRadius: '999px',
  padding: '1px 8px',
  fontSize: '11px',
  lineHeight: '17px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
}

const bodyStyle: Record<string, string> = {
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'var(--dsw-alias-border-l2)',
  margin: '0 16px',
  paddingBottom: '8px',
}

/** 0.2.0 bundle 配置页容器（插件详情页内，无折叠头）。 */
const pageStyle: Record<string, string> = {
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--dsw-alias-border-l2)',
  borderRadius: '12px',
  background: 'var(--dsw-alias-bg-layer-3)',
  padding: '4px 16px 8px',
}

const statusStyle: Record<string, string> = {
  margin: '12px 0 4px',
  fontSize: '12px',
  lineHeight: '1.5',
  color: 'var(--dsw-alias-label-tertiary)',
  wordBreak: 'break-word',
}

const errorStatusStyle: Record<string, string> = {
  margin: '12px 0 4px',
  fontSize: '12px',
  lineHeight: '1.5',
  color: 'var(--dsw-alias-label-error)',
  wordBreak: 'break-word',
}

/** 单个条目卡片。 */
const entryStyle: Record<string, string> = {
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--dsw-alias-border-l2)',
  borderRadius: '10px',
  background: 'var(--dsw-alias-bg-layer-2)',
  padding: '10px 12px',
  margin: '10px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const entryHeadStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

const switchLabelStyle: Record<string, string> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '13px',
  color: 'var(--dsw-alias-label-primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const fieldRowStyle: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const fieldLabelStyle: Record<string, string> = {
  fontSize: '12px',
  color: 'var(--dsw-alias-label-secondary)',
}

const fieldHintStyle: Record<string, string> = {
  fontSize: '12px',
  color: 'var(--dsw-alias-label-tertiary)',
}

const inputStyle: Record<string, string> = {
  appearance: 'none',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--dsw-alias-border-l2)',
  borderRadius: '8px',
  padding: '6px 10px',
  font: 'inherit',
  fontSize: '13px',
  color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-alias-bg-layer-3)',
  width: '100%',
  boxSizing: 'border-box',
}

const textareaStyle: Record<string, string> = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: '56px',
  fontFamily: 'inherit',
  lineHeight: '1.5',
}

const footerStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '12px 0 4px',
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'var(--dsw-alias-border-l2)',
}

const failedStyle: Record<string, string> = {
  flex: '1',
  minWidth: '0',
  margin: '0',
  fontSize: '12px',
  lineHeight: '1.5',
  color: 'var(--dsw-alias-label-error)',
}

const buttonBase: Record<string, string> = {
  appearance: 'none',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'transparent',
  borderRadius: '8px',
  padding: '5px 14px',
  font: 'inherit',
  fontSize: '13px',
  lineHeight: '1.5',
  cursor: 'pointer',
}

const discardStyle: Record<string, string> = {
  ...buttonBase,
  borderColor: 'var(--dsw-alias-border-l2)',
  background: 'none',
  color: 'var(--dsw-alias-label-secondary)',
}

const saveStyle: Record<string, string> = {
  ...buttonBase,
  background: 'var(--dsw-alias-label-primary)',
  color: 'var(--dsw-alias-bg-layer-3)',
}

const ghostStyle: Record<string, string> = {
  ...buttonBase,
  borderColor: 'var(--dsw-alias-border-l2)',
  background: 'none',
  color: 'var(--dsw-alias-label-secondary)',
  padding: '4px 10px',
  fontSize: '12px',
}

const addStyle: Record<string, string> = {
  ...buttonBase,
  borderColor: 'var(--dsw-alias-border-l2)',
  background: 'none',
  color: 'var(--dsw-alias-label-primary)',
}

const disabledStyle: Record<string, string> = {
  opacity: '0.4',
  cursor: 'default',
}

/** 折叠态条目行：只放名称、启用与默认，其余设置进「配置」界面。 */
const rowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--dsw-alias-border-l2)',
  borderRadius: '10px',
  background: 'var(--dsw-alias-bg-layer-2)',
  padding: '8px 12px',
  margin: '8px 0',
}

/** 行内条目名（只读展示）。 */
const rowNameStyle: Record<string, string> = {
  flex: '1',
  minWidth: '0',
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '1.4',
  color: 'var(--dsw-alias-label-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** 名称由路径推导时的弱化样式。 */
const rowNameDerivedStyle: Record<string, string> = {
  ...rowNameStyle,
  fontWeight: 400,
  color: 'var(--dsw-alias-label-tertiary)',
}

/** 折叠行里跟在显示名后的工具名（弱化，说明模型看到的名称）。 */
const rowMetaStyle: Record<string, string> = {
  flex: 'none',
  fontSize: '12px',
  lineHeight: '1.4',
  color: 'var(--dsw-alias-label-tertiary)',
}

/** 折叠行上的问题标记（悬停显示原因，不占额外行高）。 */
const warnBadgeStyle: Record<string, string> = {
  flex: 'none',
  display: 'inline-block',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  textAlign: 'center',
  fontSize: '11px',
  lineHeight: '14px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-error)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--dsw-alias-label-error)',
  cursor: 'help',
}

/** 「配置」界面头部：返回 / 标题 / 删除。 */
const detailHeadStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const detailTitleStyle: Record<string, string> = {
  flex: '1',
  minWidth: '0',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '1.4',
  color: 'var(--dsw-alias-label-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** 路径输入 + 探测按钮的一行。 */
const inlineRowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const pathInputStyle: Record<string, string> = {
  ...inputStyle,
  flex: '1',
  width: 'auto',
  minWidth: '0',
}

/** 长文案的开关标签（允许换行，避免撑宽）。 */
const wrapLabelStyle: Record<string, string> = {
  ...switchLabelStyle,
  whiteSpace: 'normal',
}

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

/**
 * 配置组件：三种视图。
 * - `page`（DSH 0.2.0 的 plugins.bundle.config）：直接渲染配置面板（插件详情页内，无折叠）。
 * - `summary`：一行状态摘要。
 * - 未指定（0.1.x 的 settings.plugin.item）：折叠卡片。
 */
function ShellPolicyCard(props: { view?: 'summary' | 'page'; remote: ClientContext['remote'] }) {
  const { view, remote } = props
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [draft, setDraft] = useState<DraftEntry[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // 正在「配置」界面里编辑的条目 id；null 表示条目列表视图。
  const [editingId, setEditingId] = useState<string | null>(null)
  // 视图切换的滚动锚点（见下方 useLayoutEffect）：面板根节点、离开列表时的滚动位置、
  // 列表视图的高度（作为配置界面的 min-height，避免页面高度缩水导致 scrollTop 被夹）。
  const rootRef = useRef<any>(null)
  const listScroll = useRef<{ target: any; top: number; left: number } | null>(null)
  const [listHeight, setListHeight] = useState<number | null>(null)

  const load = (): void => {
    fetch('/dsh-shell-policy/api/status')
      .then((r) => r.json())
      .then((s) => setStatus(s as Status))
      .catch(() => setStatus(null))
  }

  useEffect(() => {
    load()
    // settings 文档变化（本卡片或其他入口写入）时实时刷新。
    const off = remote.$on('settings/document-updated', () => { load() })
    return off
  }, [remote])

  const saved = (status?.entries ?? []).map(toDraft)
  const entries = draft ?? saved
  const dirty = draft !== null
  const problems = entries.map((entry) => entryProblem(entry, entries))
  const hasProblem = problems.some((problem) => problem !== undefined)
  const blocked = !dirty || saving || hasProblem

  /** 最近的真正可滚动祖先；找不到（或未挂载）时退回文档滚动容器。 */
  const findScroller = (): any => {
    const win = (globalThis as any).window
    const doc = (globalThis as any).document
    if (win === undefined || doc === undefined) return null
    let node: any = rootRef.current == null ? null : rootRef.current.parentElement
    while (node != null) {
      const overflowY = win.getComputedStyle(node).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight) return node
      node = node.parentElement
    }
    return doc.scrollingElement ?? doc.documentElement ?? null
  }

  /**
   * 进入条目的配置界面。
   *
   * 视图切换会改变面板高度：内容变短时浏览器会把 scrollTop 夹到新的上限，页面一长
   * 「滚动进度」就丢了。这里做两件事：① 记下当前滚动位置，返回列表时原样恢复；
   * ② 记下列表视图的高度，作为配置界面的 min-height，页面高度不缩水，夹取不会发生。
   */
  const openEntryConfig = (id: string): void => {
    const root = rootRef.current
    if (root != null) setListHeight(root.offsetHeight)
    const scroller = findScroller()
    if (scroller != null) listScroll.current = { target: scroller, top: scroller.scrollTop, left: scroller.scrollLeft }
    setEditingId(id)
  }

  /** 回到条目列表（返回 / 保存 / 放弃 / 删除都走这里）。 */
  const backToList = (): void => {
    setEditingId(null)
    setListHeight(null)
  }

  useLayoutEffect(() => {
    const saved = listScroll.current
    if (editingId === null) {
      // 回到列表：列表高度与离开时一致，恢复是精确的。
      listScroll.current = null
      if (saved != null) {
        saved.target.scrollTop = saved.top
        saved.target.scrollLeft = saved.left
      }
      return
    }
    // 进入配置界面：把配置卡片顶部对齐滚动视口顶部（留 8px），用户不会落在卡片中间。
    const scroller = findScroller()
    const root = rootRef.current
    if (scroller == null || root == null) return
    const win = (globalThis as any).window
    const doc = (globalThis as any).document
    const rect = root.getBoundingClientRect()
    const documentScroller = win !== undefined
      && (scroller === win || scroller === doc?.scrollingElement || scroller === doc?.documentElement || scroller === doc?.body)
    if (documentScroller) {
      if (typeof win.scrollTo === 'function') win.scrollTo({ top: win.scrollY + rect.top - 8, left: win.scrollX })
      return
    }
    const box = scroller.getBoundingClientRect()
    scroller.scrollTop += (rect.top - box.top) - 8
  }, [editingId])

  const update = (index: number, patch: Partial<DraftEntry>): void => {
    setDraft(entries.map((entry, i) => i === index ? { ...entry, ...patch } : entry))
  }

  const setPrimary = (index: number): void => {
    setDraft(entries.map((entry, i) => ({ ...entry, primary: i === index })))
  }

  const addEntry = (): void => {
    if (entries.length >= MAX_ENTRIES) return
    const entry: DraftEntry = {
      id: `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      label: '',
      enabled: true,
      path: '',
      args: '',
      description: '',
      fullAccess: false,
      primary: entries.length === 0,
    }
    setDraft([...entries, entry])
    openEntryConfig(entry.id)
    // 新建条目：先探测可执行文件，再用 host 的默认模板预填「工具提示词」。
    void (async () => {
      const probed = await probe(entries.length, entry)
      await fillDefaultDescription(entries.length, probed)
    })()
  }

  const removeEntry = (index: number): void => {
    setDraft(entries.filter((_, i) => i !== index))
    backToList()
  }

  /** 探测可执行文件；返回该条目探测后的形状（新建条目据此再取默认提示词）。 */
  const probe = async (index: number, entry: DraftEntry): Promise<DraftEntry> => {
    let next: DraftEntry
    try {
      const response = await fetch('/dsh-shell-policy/api/detect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: entry.name, path: entry.path }),
      })
      const result = await response.json() as { ok?: boolean; path?: string }
      const found = result.ok === true && typeof result.path === 'string' && result.path.length > 0 ? result.path : ''
      next = found.length > 0
        ? { ...entry, path: found, name: entry.name.length > 0 ? entry.name : deriveName(found), notice: undefined }
        : { ...entry, notice: '未探测到可执行文件，请手动填写路径' }
    } catch {
      next = { ...entry, notice: '探测请求失败' }
    }
    setDraft((current) => (current ?? entries).map((item, i) => i === index ? next : item))
    return next
  }

  /**
   * 用 host 的默认模板填充某个条目的「工具提示词」（新建预填与「重置为默认」共用）。
   * 模板由 host 的 defaultToolDescription 生成，面板不复制一份，避免两边漂移。
   */
  const fillDefaultDescription = async (index: number, entry: DraftEntry): Promise<void> => {
    try {
      const response = await fetch('/dsh-shell-policy/api/defaults', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: entry.name, path: entry.path, args: entry.args ?? '' }),
      })
      const result = await response.json() as { ok?: boolean; description?: string }
      if (result.ok !== true || typeof result.description !== 'string') return
      const description = result.description
      setDraft((current) => (current ?? entries).map((item, i) => i === index ? { ...item, description } : item))
    } catch {
      // 取不到模板就保留当前文本（留空时 host 会回落到默认模板）。
    }
  }

  const save = (): void => {
    if (blocked) return
    setSaving(true)
    setFailed(null)
    fetch('/dsh-shell-policy/api/shells', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shells: entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          label: entry.label,
          enabled: entry.enabled,
          path: entry.path,
          args: entry.args ?? '',
          description: entry.description,
          fullAccess: entry.fullAccess,
          primary: entry.primary,
        })),
      }),
    })
      .then((r) => r.json())
      .then((result) => {
        if ((result as { ok?: unknown }).ok !== true) throw new Error(String((result as { error?: unknown }).error ?? '保存失败'))
        setDraft(null)
        backToList()
        load()
      })
      .catch((error: unknown) => setFailed(String(error)))
      .finally(() => setSaving(false))
  }

  const discard = (): void => {
    setDraft(null)
    backToList()
    setFailed(null)
  }

  const registered = status?.registered ?? []
  const statusLine = status === null
    ? '状态加载中...'
    : !status.supported
      ? `当前平台 ${status.platform} 不受支持：DSH 默认 bash 工具已可用，本插件仅 Windows 生效`
      : registered.length === 0
        ? '当前没有注册任何 shell 工具（DSH 内置 shell 工具仍然可用）'
        : `已注册：${registered.join('、')}`

  const errorLine = status?.registerError !== undefined && status.registerError.length > 0 ? status.registerError : null

  /** 折叠行上的问题提示（悬停可见）：客户端校验优先，其次是运行时状态。 */
  const entryWarning = (entry: DraftEntry, index: number): string | undefined => {
    const problem = problems[index]
    if (problem !== undefined) return problem
    if (dirty || !entry.enabled) return undefined
    const runtime = status?.entries.find((item) => item.id === entry.id)
    if (runtime === undefined) return undefined
    if (runtime.error !== undefined) return runtime.error
    if (!runtime.registered) return '运行时未生效：未找到可执行文件'
    return undefined
  }

  /** 折叠态条目行：只显示名称、启用、默认，以及进入「配置」界面的入口。 */
  const entryRow = (entry: DraftEntry, index: number): ReturnType<typeof createElement> => {
    const warning = entryWarning(entry, index)
    const label = (entry.label ?? '').trim()
    const toolName = effectiveName(entry)
    // 显示名优先；两者都没有时才用弱化色提示「名称是从路径推导的」。
    const explicit = label.length > 0 || entry.name.trim().length > 0
    const title = label.length > 0
      ? `显示名：${label}；模型看到的工具名：${toolName}`
      : entry.name.trim().length > 0
        ? `工具名：${entry.name}`
        : '名称由可执行文件路径推导，点「配置」可修改'
    return createElement('div', { key: entry.id, style: rowStyle },
      createElement('span', {
        key: 'name',
        style: explicit ? rowNameStyle : rowNameDerivedStyle,
        title,
      }, displayName(entry)),
      label.length > 0 && label !== toolName
        ? createElement('span', { key: 'toolName', style: rowMetaStyle, title: '模型看到的工具名' }, toolName)
        : null,
      warning !== undefined
        ? createElement('span', { key: 'warning', style: warnBadgeStyle, title: warning }, '!')
        : null,
      createElement('label', { key: 'enabled', style: switchLabelStyle },
        createElement('input', {
          type: 'checkbox',
          checked: entry.enabled,
          disabled: saving,
          onChange: (event: { target: { checked: boolean } }) => update(index, { enabled: event.target.checked }),
        }),
        createElement('span', null, '启用'),
      ),
      createElement('label', { key: 'primary', style: switchLabelStyle, title: '多个 shell 启用时，引导提示词优先推荐它' },
        createElement('input', {
          type: 'radio',
          name: 'shell-policy-primary',
          checked: entry.primary,
          disabled: saving || !entry.enabled,
          onChange: () => setPrimary(index),
        }),
        createElement('span', null, '默认'),
      ),
      createElement('button', {
        key: 'config',
        type: 'button',
        style: ghostStyle,
        disabled: saving,
        title: '显示名、工具名、可执行文件路径、工具提示词、沙箱完全权限与删除',
        onClick: () => openEntryConfig(entry.id),
      }, '配置'),
    )
  }

  /** 单个条目单独的配置界面：名称、路径（含探测）、提示词、沙箱权限与删除。 */
  const entryDetail = (entry: DraftEntry, index: number): ReturnType<typeof createElement> => {
    const runtime = status?.entries.find((item) => item.id === entry.id)
    const notice = entry.notice !== undefined
      ? createElement('div', { key: 'notice', style: fieldHintStyle }, entry.notice)
      : null
    const problem = problems[index] !== undefined
      ? createElement('div', { key: 'problem', style: { ...fieldHintStyle, color: 'var(--dsw-alias-label-error)' } }, problems[index])
      : null
    const runtimeLine = !dirty && runtime !== undefined && entry.enabled
      ? createElement('div', {
        key: 'runtime',
        style: runtime.error !== undefined ? { ...fieldHintStyle, color: 'var(--dsw-alias-label-error)' } : fieldHintStyle,
      }, runtime.error !== undefined
        ? `运行时未生效：${runtime.error}`
        : runtime.registered
          ? `运行时已生效：${runtime.resolvedPath}`
          : '运行时未生效：未找到可执行文件')
      : null
    return createElement('div', { key: entry.id, style: entryStyle },
      createElement('div', { key: 'head', style: detailHeadStyle },
        createElement('button', {
          key: 'back',
          type: 'button',
          style: ghostStyle,
          disabled: saving,
          onClick: backToList,
        }, '‹ 返回列表'),
        createElement('span', { key: 'title', style: detailTitleStyle, title: displayName(entry) }, `配置：${displayName(entry)}`),
        createElement('span', { key: 'spacer', style: { flex: '1' } }),
        createElement('button', {
          key: 'remove',
          type: 'button',
          style: ghostStyle,
          disabled: saving || entries.length <= 1,
          onClick: () => removeEntry(index),
        }, '删除'),
      ),
      createElement('div', { key: 'label', style: fieldRowStyle },
        createElement('span', { style: fieldLabelStyle }, '显示名'),
        createElement('input', {
          type: 'text',
          style: inputStyle,
          value: entry.label,
          placeholder: '留空用工具名；只在面板里区分条目（例如 Git Bash / Cygwin）',
          maxLength: 64,
          disabled: saving,
          onChange: (event: { target: { value: string } }) => update(index, { label: event.target.value }),
        }),
        createElement('span', { style: fieldHintStyle }, '只影响面板显示与错误提示，模型看到的仍是工具名'),
      ),
      createElement('div', { key: 'name', style: fieldRowStyle },
        createElement('span', { style: fieldLabelStyle }, '工具名'),
        createElement('input', {
          type: 'text',
          style: inputStyle,
          value: entry.name,
          placeholder: '留空按可执行文件名推导（pwsh 会改名为 powershell）',
          disabled: saving,
          onChange: (event: { target: { value: string } }) => update(index, { name: event.target.value }),
        }),
        createElement('span', { style: fieldHintStyle }, `模型看到的工具名：${effectiveName(entry)}`),
      ),
      createElement('div', { key: 'path', style: fieldRowStyle },
        createElement('span', { style: fieldLabelStyle }, '可执行文件'),
        createElement('div', { style: inlineRowStyle },
          createElement('input', {
            type: 'text',
            style: pathInputStyle,
            value: entry.path,
            placeholder: '绝对路径，或只填文件名（如 bash.exe，在 PATH 里查找）；留空自动探测',
            disabled: saving,
            onChange: (event: { target: { value: string } }) => update(index, { path: event.target.value }),
          }),
          createElement('button', {
            type: 'button',
            style: ghostStyle,
            disabled: saving,
            onClick: () => { void probe(index, entry) },
          }, '探测'),
        ),
        createElement('span', { style: fieldHintStyle }, '填文件名时用 PATH 里的那个可执行文件；留空时按家族自动探测（Git / MSYS2 / Cygwin / PowerShell / PATH）'),
      ),
      createElement('div', { key: 'description', style: fieldRowStyle },
        createElement('div', { style: { ...inlineRowStyle, justifyContent: 'space-between' } },
          createElement('span', { style: fieldLabelStyle }, '工具提示词'),
          createElement('button', {
            type: 'button',
            style: ghostStyle,
            disabled: saving,
            title: '按当前工具名 / 路径 / PATH / 启动参数重新生成 host 的默认说明',
            onClick: () => { void fillDefaultDescription(index, entry) },
          }, '重置为默认'),
        ),
        createElement('textarea', {
          style: textareaStyle,
          value: entry.description,
          rows: 3,
          placeholder: '新建条目会自动填入默认说明；留空则由 host 回落到默认模板',
          disabled: saving,
          onChange: (event: { target: { value: string } }) => update(index, { description: event.target.value }),
        }),
      ),
      createElement('label', { key: 'fullAccess', style: wrapLabelStyle },
        createElement('input', {
          type: 'checkbox',
          checked: entry.fullAccess,
          disabled: saving,
          onChange: (event: { target: { checked: boolean } }) => update(index, { fullAccess: event.target.checked }),
        }),
        createElement('span', null, '沙箱完全权限（跳过文件沙箱，执行不再逐次审批）'),
      ),
      createElement('div', { key: 'args', style: fieldRowStyle },
        createElement('span', { style: fieldLabelStyle }, '启动参数'),
        createElement('input', {
          type: 'text',
          style: inputStyle,
          value: entry.args,
          placeholder: '留空用默认：-c {command}（bash）/ -NoLogo -NoProfile -NonInteractive -Command {command}（pwsh）',
          disabled: saving,
          onChange: (event: { target: { value: string } }) => update(index, { args: event.target.value }),
        }),
        createElement('span', { style: fieldHintStyle }, '可执行文件之后的全部参数；{command} 会被替换成实际命令，想换掉 -c 这类开关就改这里，例如 -l -c {command}、-Command {command}'),
      ),
      runtimeLine,
      notice,
      problem,
    )
  }

  // 「配置」界面只在被点开的条目仍存在于当前条目表时生效；否则回落到列表。
  const editingEntry = editingId === null ? null : (entries.find((item) => item.id === editingId) ?? null)
  const editingIndex = editingEntry === null ? -1 : entries.indexOf(editingEntry)

  const controls = [
    errorLine !== null
      ? createElement('div', { key: 'status', style: errorStatusStyle }, errorLine)
      : createElement('div', { key: 'status', style: statusStyle },
        statusLine,
        status?.migrated === true ? createElement('span', null, '（当前条目由旧配置迁移，保存后写入配置）') : null,
      ),
    ...(editingEntry !== null && editingIndex >= 0
      ? [entryDetail(editingEntry, editingIndex)]
      : entries.map(entryRow)),
    entries.length === 0
      ? createElement('div', { key: 'empty', style: statusStyle }, '还没有条目。点击「添加 shell」新增一个（例如 git-bash 或 PowerShell）。')
      : null,
    createElement('div', { key: 'footer', style: footerStyle },
      failed !== null ? createElement('p', { style: failedStyle, role: 'status' }, `保存失败：${failed}`) : null,
      createElement('span', { key: 'spacer', style: { flex: '1' } }),
      createElement('button', {
        key: 'add',
        type: 'button',
        style: { ...addStyle, ...(saving || entries.length >= MAX_ENTRIES ? disabledStyle : {}) },
        disabled: saving || entries.length >= MAX_ENTRIES,
        onClick: addEntry,
      }, '添加 shell'),
      createElement('button', {
        key: 'discard',
        type: 'button',
        style: { ...discardStyle, ...(!dirty || saving ? disabledStyle : {}) },
        disabled: !dirty || saving,
        onClick: discard,
      }, '放弃'),
      createElement('button', {
        key: 'save',
        type: 'button',
        style: { ...saveStyle, ...(blocked ? disabledStyle : {}) },
        disabled: blocked,
        onClick: save,
      }, saving ? '保存中...' : '保存'),
    ),
  ]

  // summary：官方卡片/行的一行摘要。
  if (view === 'summary') {
    return createElement('span', null, errorLine ?? statusLine)
  }

  // page：DSH 0.2.0 的 bundle 配置页（插件详情页内，无折叠）。
  if (view === 'page') {
    // 配置界面用列表视图的高度兜底：切到更短的界面时页面高度不缩水，
    // 浏览器就不会夹取 scrollTop（与 openEntryConfig 的滚动锚点配合）。
    const containerStyle = editingEntry !== null && listHeight !== null
      ? { ...pageStyle, boxSizing: 'border-box', minHeight: `${listHeight}px` }
      : pageStyle
    return createElement('div', { style: containerStyle, ref: rootRef }, ...controls)
  }

  // 旧版 settings.plugin.item：折叠卡片。
  return createElement('li', { style: { ...cardStyle, ...(open ? cardOpenStyle : {}) } },
    createElement('button', {
      type: 'button',
      style: headerStyle,
      'aria-expanded': open,
      'aria-label': `${open ? '收起设置' : '展开设置'}: Shell 工具`,
      onClick: () => setOpen(!open),
    },
      createElement('span', { style: headTextStyle },
        createElement('span', { style: nameStyle }, 'Shell 工具'),
        createElement('span', { style: descriptionStyle }, '配置 agent 可用的 shell 工具：启用/停用、路径、工具提示词与沙箱权限。切换后下一次请求生效。'),
      ),
      dirty ? createElement('span', { style: pendingStyle }, '未保存') : null,
      createElement('span', { style: { ...chevronStyle, ...(open ? chevronOpenStyle : {}) } },
        createElement(ChevronIcon),
      ),
    ),
    open ? createElement('div', { style: bodyStyle }, ...controls) : null,
  )
}

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote
  // DSH 0.2.0：bundle 自己的配置页注册到 plugins.bundle.config（key = 包名），
  // 渲染在插件管理页的 bundle 详情页内（描述与行列表之间）。
  ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register({
      name: 'plugins.bundle.config',
      key: 'dsh-windows-shell-policy',
      label: () => 'Shell 工具',
      inject: () => ({ remote }),
    } as any, ShellPolicyCard as any),
  ), 'dsh-windows-shell-policy: bundle config page')

  // 0.1.x 兼容：旧版「设置 → 插件 → 插件配置」的卡片槽位（0.2.0 已移除该槽位，
  // slots.inject 对未声明的槽位不会执行回调，因此无副作用）。
  ctx.effect(() => ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register({
      name: 'settings.plugin.item',
      id: 'shell-policy',
      key: 'shell-policy',
      order: 5,
      label: () => 'Shell 工具',
      inject: () => ({ remote }),
    } as any, ShellPolicyCard as any),
  ), 'dsh-windows-shell-policy: legacy settings card')
}
