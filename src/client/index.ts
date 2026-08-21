/**
 * dsh-windows-shell-policy — client 配置卡片（settings.plugin.item slot）。
 *
 * 在「设置 - 插件 - 插件配置」面板注册「默认 Shell」卡片，折叠式
 * （与官方「终端 / Agent 循环 / 网页搜索」卡片同构）：头部按钮命名插件
 * 并描述其配置，点击展开控件；折叠时保留 staged 编辑并在头部标记
 * 「未保存」。控件：自动 / bash / pwsh 三选一 + 显式 bash 路径输入框。
 * 读写走 host 插件自己的 API（/dsh-shell-policy/api/status、/preferred、
 * /bashpath）——settings 的 client 端 RPC 有 apiproxy allowlist 限制，
 * 本插件 namespace 不在其中，故不依赖 settingsScope；host 端仍经
 * settings 服务持久化。监听 settings/document-updated 事件实时刷新状态。
 *
 * 构建：npm run build:client（tsdown，产物 lib/client.js，ModuleLoader.load 注册）。
 * 必坑（2026-08 实测）：① apply 用 ctx.slots 必须 export const inject
 * = ['slots']（服务注入声明）；② register 必须带 name 字段（= slot 名）；
 * ③ rc.7 起该 slot 为 kind:'keyed'，注册必须带 key。
 */
import { createElement, useEffect, useState } from 'react'
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'

type ClientContext = {
  slots: SlotsService
  remote: {
    $on(event: string, callback: (ref?: unknown) => void): () => void
  }
}

export const inject = ['slots', 'remote']

/** host 状态 API 返回。 */
interface Status {
  platform: string
  supported: boolean
  bashFound: boolean
  bashPath: string
  effective: 'bash' | 'pwsh'
  preferred: 'auto' | 'bash' | 'pwsh'
  configuredBashPath: string
  registerError?: string
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

const statusStyle: Record<string, string> = {
  margin: '12px 0 4px',
  fontSize: '12px',
  lineHeight: '1.5',
  color: 'var(--dsw-alias-label-tertiary)',
  fontFamily: 'monospace',
  wordBreak: 'break-all',
}

const errorStatusStyle: Record<string, string> = {
  margin: '12px 0 4px',
  fontSize: '12px',
  lineHeight: '1.5',
  color: 'var(--dsw-alias-label-error)',
  wordBreak: 'break-all',
}

const optionStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  padding: '4px 0',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'var(--dsw-alias-label-primary)',
}

const optionLabelStyle: Record<string, string> = {
  fontWeight: 600,
  minWidth: '48px',
}

const optionHintStyle: Record<string, string> = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
}

const fieldStyle: Record<string, string> = {
  margin: '8px 0 4px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const fieldLabelStyle: Record<string, string> = {
  fontSize: '13px',
  color: 'var(--dsw-alias-label-primary)',
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

const disabledStyle: Record<string, string> = {
  opacity: '0.4',
  cursor: 'default',
}

/** 卡片组件：折叠头部 + 展开控件（状态行 + 选择器 + bashPath + staged 保存）。 */
function ShellPolicyCard(props: { remote: ClientContext['remote'] }) {
  const { remote } = props
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [draftBashPath, setDraftBashPath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

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

  const current = status?.preferred ?? 'auto'
  const currentBashPath = status?.configuredBashPath ?? ''
  const staged = draft ?? current
  const stagedBashPath = draftBashPath ?? currentBashPath
  const dirty = (draft !== null && draft !== current) || (draftBashPath !== null && draftBashPath !== currentBashPath)
  const blocked = !dirty || saving

  const save = (): void => {
    if (!dirty || saving) return
    setSaving(true)
    setFailed(false)
    const writes: Promise<unknown>[] = []
    if (draft !== null && draft !== current) {
      writes.push(fetch('/dsh-shell-policy/api/preferred', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferred: draft }),
      }).then((r) => r.json()).then((result) => {
        if (result.ok !== true) throw new Error(String(result.error ?? 'preferred write failed'))
      }))
    }
    if (draftBashPath !== null && draftBashPath !== currentBashPath) {
      writes.push(fetch('/dsh-shell-policy/api/bashpath', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bashPath: draftBashPath }),
      }).then((r) => r.json()).then((result) => {
        if (result.ok !== true) throw new Error(String(result.error ?? 'bashPath write failed'))
      }))
    }
    Promise.all(writes)
      .then(() => {
        setDraft(null)
        setDraftBashPath(null)
        load()
      })
      .catch(() => setFailed(true))
      .finally(() => setSaving(false))
  }

  const discard = (): void => {
    setDraft(null)
    setDraftBashPath(null)
    setFailed(false)
  }

  const options = [
    { value: 'auto', label: '自动', hint: '探测到 git-bash 则用 bash，否则 pwsh' },
    { value: 'bash', label: 'bash', hint: '强制 git-bash' },
    { value: 'pwsh', label: 'pwsh', hint: '强制 PowerShell' },
  ]

  const statusLine = status === null
    ? '状态加载中...'
    : !status.supported
      ? `当前平台 ${status.platform} 不受支持：DSH 默认 bash 工具已可用，本插件仅 Windows 生效`
      : status.effective === 'bash'
        ? `当前生效：bash（${status.bashPath}）`
        : status.bashFound
          ? '当前生效：pwsh（bash 可用但未启用）'
          : '当前生效：pwsh（未探测到 bash）'

  const registerErrorLine = status?.registerError !== undefined && status.registerError.length > 0
    ? `bash 工具注册失败：${status.registerError}`
    : null

  return createElement('li', { style: { ...cardStyle, ...(open ? cardOpenStyle : {}) } },
    createElement('button', {
      type: 'button',
      style: headerStyle,
      'aria-expanded': open,
      'aria-label': `${open ? '收起设置' : '展开设置'}: 默认 Shell`,
      onClick: () => setOpen(!open),
    },
      createElement('span', { style: headTextStyle },
        createElement('span', { style: nameStyle }, '默认 Shell'),
        createElement('span', { style: descriptionStyle }, '选择 agent 使用的 shell 工具。切换后下一次请求生效。'),
      ),
      dirty ? createElement('span', { style: pendingStyle }, '未保存') : null,
      createElement('span', { style: { ...chevronStyle, ...(open ? chevronOpenStyle : {}) } },
        createElement(ChevronIcon),
      ),
    ),
    open ? createElement('div', { style: bodyStyle },
      registerErrorLine !== null
        ? createElement('div', { style: errorStatusStyle }, registerErrorLine)
        : createElement('div', { style: statusStyle }, statusLine),
      ...options.map((opt) => createElement('label', { key: opt.value, style: optionStyle },
        createElement('input', {
          type: 'radio',
          name: 'shell-policy-preferred',
          checked: staged === opt.value,
          disabled: saving,
          onChange: () => setDraft(opt.value),
        }),
        createElement('span', { style: optionLabelStyle }, opt.label),
        createElement('span', { style: optionHintStyle }, opt.hint),
      )),
      createElement('div', { style: fieldStyle },
        createElement('span', { style: fieldLabelStyle }, 'bash 可执行文件路径'),
        createElement('input', {
          type: 'text',
          style: inputStyle,
          value: stagedBashPath,
          placeholder: '留空自动探测（Git / MSYS2 / Cygwin / PATH）',
          disabled: saving,
          onChange: (event: { target: { value: string } }) => setDraftBashPath(event.target.value),
        }),
        createElement('span', { style: fieldHintStyle }, '显式指定 bash.exe 路径；留空则自动探测。'),
      ),
      createElement('div', { style: footerStyle },
        failed ? createElement('p', { style: failedStyle, role: 'status' }, '保存失败，请重试') : null,
        createElement('button', {
          type: 'button',
          style: { ...discardStyle, ...(!dirty || saving ? disabledStyle : {}) },
          disabled: !dirty || saving,
          onClick: discard,
        }, '放弃'),
        createElement('button', {
          type: 'button',
          style: { ...saveStyle, ...(blocked ? disabledStyle : {}) },
          disabled: blocked,
          onClick: save,
        }, saving ? '保存中...' : '保存'),
      ),
    ) : null,
  )
}

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote
  ctx.effect(() => ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register({
      name: 'settings.plugin.item',
      id: 'shell-policy',
      // rc.7 起该 slot 为 kind:'keyed'，注册必须带 key（list 下多余字段被忽略，向后兼容）
      key: 'shell-policy',
      order: 5,
      label: () => '默认 Shell',
      inject: () => ({ remote }),
    } as any, ShellPolicyCard as any),
  ), 'dsh-windows-shell-policy: settings card')
}
