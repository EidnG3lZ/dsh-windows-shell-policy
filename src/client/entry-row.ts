/**
 * dsh-windows-shell-policy — client 面板的折叠态条目行。
 *
 * 只显示名称、启用、默认，以及进入「配置」界面的入口；长字段都收进 EntryDetail。
 */
import { createElement } from 'react'
import { displayName, effectiveName } from './validation.js'
import { switchLabelStyle, ghostStyle, rowStyle, rowNameStyle, rowNameDerivedStyle, rowMetaStyle, warnBadgeStyle } from './styles.js'
import type { DraftEntry } from './types.js'

/** 折叠态条目行：只显示名称、启用、默认，以及进入「配置」界面的入口。 */
export function EntryRow(props: {
  entry: DraftEntry
  index: number
  /** 行内问题提示（悬停可见）；undefined 表示没有问题。 */
  warning: string | undefined
  saving: boolean
  onUpdate(index: number, patch: Partial<DraftEntry>): void
  onSetPrimary(index: number): void
  onOpenConfig(id: string): void
}): ReturnType<typeof createElement> {
  const { entry, index, warning, saving, onUpdate, onSetPrimary, onOpenConfig } = props
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
        onChange: (event: { target: { checked: boolean } }) => onUpdate(index, { enabled: event.target.checked }),
      }),
      createElement('span', null, '启用'),
    ),
    createElement('label', { key: 'primary', style: switchLabelStyle, title: '多个 shell 启用时，引导提示词优先推荐它' },
      createElement('input', {
        type: 'radio',
        name: 'shell-policy-primary',
        checked: entry.primary,
        disabled: saving || !entry.enabled,
        onChange: () => onSetPrimary(index),
      }),
      createElement('span', null, '默认'),
    ),
    createElement('button', {
      key: 'config',
      type: 'button',
      style: ghostStyle,
      disabled: saving,
      title: '显示名、工具名、可执行文件路径、工具提示词、沙箱完全权限与删除',
      onClick: () => onOpenConfig(entry.id),
    }, '配置'),
  )
}
