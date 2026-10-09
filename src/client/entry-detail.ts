/**
 * dsh-windows-shell-policy — client 面板的单条目配置界面。
 *
 * 显示名 / 工具名 / 可执行文件（含探测）/ 工具提示词（含重置为默认）/
 * 沙箱完全权限 / 启动参数 / 删除；纯展示组件，状态与请求都由 ShellPolicyCard 持有。
 */
import { createElement } from 'react'
import { displayName, effectiveName } from './validation.js'
import { entryStyle, fieldRowStyle, fieldLabelStyle, fieldHintStyle, inputStyle, textareaStyle, ghostStyle, detailHeadStyle, detailTitleStyle, inlineRowStyle, pathInputStyle, wrapLabelStyle } from './styles.js'
import type { DraftEntry, EntryStatus } from './types.js'

/** 单个条目单独的配置界面：名称、路径（含探测）、提示词、沙箱权限与删除。 */
export function EntryDetail(props: {
  entry: DraftEntry
  index: number
  /** 客户端保存前校验的问题；undefined 表示没有。 */
  problemText: string | undefined
  /** 该条目的运行时状态（/status）；未注册或未加载时为 undefined。 */
  runtime: EntryStatus | undefined
  dirty: boolean
  saving: boolean
  canRemove: boolean
  onUpdate(index: number, patch: Partial<DraftEntry>): void
  onProbe(index: number, entry: DraftEntry): void
  onResetDescription(index: number, entry: DraftEntry): void
  onRemove(index: number): void
  onBack(): void
}): ReturnType<typeof createElement> {
  const { entry, index, problemText, runtime, dirty, saving, canRemove, onUpdate, onProbe, onResetDescription, onRemove, onBack } = props
  const notice = entry.notice !== undefined
    ? createElement('div', { key: 'notice', style: fieldHintStyle }, entry.notice)
    : null
  const problem = problemText !== undefined
    ? createElement('div', { key: 'problem', style: { ...fieldHintStyle, color: 'var(--dsw-alias-label-error)' } }, problemText)
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
        onClick: onBack,
      }, '‹ 返回列表'),
      createElement('span', { key: 'title', style: detailTitleStyle, title: displayName(entry) }, `配置：${displayName(entry)}`),
      createElement('span', { key: 'spacer', style: { flex: '1' } }),
      createElement('button', {
        key: 'remove',
        type: 'button',
        style: ghostStyle,
        disabled: saving || !canRemove,
        onClick: () => onRemove(index),
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
        onChange: (event: { target: { value: string } }) => onUpdate(index, { label: event.target.value }),
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
        onChange: (event: { target: { value: string } }) => onUpdate(index, { name: event.target.value }),
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
          onChange: (event: { target: { value: string } }) => onUpdate(index, { path: event.target.value }),
        }),
        createElement('button', {
          type: 'button',
          style: ghostStyle,
          disabled: saving,
          onClick: () => { onProbe(index, entry) },
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
          onClick: () => { onResetDescription(index, entry) },
        }, '重置为默认'),
      ),
      createElement('textarea', {
        style: textareaStyle,
        value: entry.description,
        rows: 3,
        placeholder: '新建条目会自动填入默认说明；留空则由 host 回落到默认模板',
        disabled: saving,
        onChange: (event: { target: { value: string } }) => onUpdate(index, { description: event.target.value }),
      }),
    ),
    createElement('label', { key: 'fullAccess', style: wrapLabelStyle },
      createElement('input', {
        type: 'checkbox',
        checked: entry.fullAccess,
        disabled: saving,
        onChange: (event: { target: { checked: boolean } }) => onUpdate(index, { fullAccess: event.target.checked }),
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
        onChange: (event: { target: { value: string } }) => onUpdate(index, { args: event.target.value }),
      }),
      createElement('span', { style: fieldHintStyle }, '可执行文件之后的全部参数；{command} 会被替换成实际命令，想换掉 -c 这类开关就改这里，例如 -l -c {command}、-Command {command}'),
    ),
    runtimeLine,
    notice,
    problem,
  )
}
