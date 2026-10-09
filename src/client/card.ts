/**
 * dsh-windows-shell-policy — client 面板的配置组件（容器）。
 *
 * 持有全部状态与请求：加载 /status、草稿编辑、探测与默认提示词、保存 / 放弃，
 * 以及列表 ⇄ 单条目配置界面的视图切换与滚动位置保持。展示交给 EntryRow / EntryDetail。
 */
import { createElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EntryDetail } from './entry-detail.js'
import { EntryRow } from './entry-row.js'
import { ChevronIcon } from './icons.js'
import { cardStyle, cardOpenStyle, headerStyle, headTextStyle, nameStyle, descriptionStyle, chevronStyle, chevronOpenStyle, pendingStyle, bodyStyle, pageStyle, statusStyle, errorStatusStyle, footerStyle, failedStyle, discardStyle, saveStyle, addStyle, disabledStyle } from './styles.js'
import { deriveName, entryProblem, toDraft } from './validation.js'
import { MAX_ENTRIES } from './types.js'
import type { ClientContext, DraftEntry, Status } from './types.js'

/**
 * 配置组件：三种视图。
 * - `page`（DSH 0.2.0 的 plugins.bundle.config）：直接渲染配置面板（插件详情页内，无折叠）。
 * - `summary`：一行状态摘要。
 * - 未指定（0.1.x 的 settings.plugin.item）：折叠卡片。
 */
export function ShellPolicyCard(props: { view?: 'summary' | 'page'; remote: ClientContext['remote'] }) {
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
      ? [createElement(EntryDetail, {
        key: editingEntry.id,
        entry: editingEntry,
        index: editingIndex,
        problemText: problems[editingIndex],
        runtime: status?.entries.find((item) => item.id === editingEntry.id),
        dirty,
        saving,
        canRemove: entries.length > 1,
        onUpdate: update,
        onProbe: (index, entry) => { void probe(index, entry) },
        onResetDescription: (index, entry) => { void fillDefaultDescription(index, entry) },
        onRemove: removeEntry,
        onBack: backToList,
      })]
      : entries.map((entry, index) => createElement(EntryRow, {
        key: entry.id,
        entry,
        index,
        warning: entryWarning(entry, index),
        saving,
        onUpdate: update,
        onSetPrimary: setPrimary,
        onOpenConfig: openEntryConfig,
      }))),
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
