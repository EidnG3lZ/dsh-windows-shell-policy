/**
 * dsh-windows-shell-policy — client 面板的内联样式。
 *
 * 与官方 PluginCard.module.css 同构（内联 style + 同一套 --dsw-alias-* CSS 变量）。
 * 注意：inline style 下不要用 border 简写（CSS 变量会被拆解丢失），必须用长写属性。
 */

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


export {
  cardStyle,
  cardOpenStyle,
  headerStyle,
  headTextStyle,
  nameStyle,
  descriptionStyle,
  chevronStyle,
  chevronOpenStyle,
  pendingStyle,
  bodyStyle,
  pageStyle,
  statusStyle,
  errorStatusStyle,
  entryStyle,
  entryHeadStyle,
  switchLabelStyle,
  fieldRowStyle,
  fieldLabelStyle,
  fieldHintStyle,
  inputStyle,
  textareaStyle,
  footerStyle,
  failedStyle,
  buttonBase,
  discardStyle,
  saveStyle,
  ghostStyle,
  addStyle,
  disabledStyle,
  rowStyle,
  rowNameStyle,
  rowNameDerivedStyle,
  rowMetaStyle,
  warnBadgeStyle,
  detailHeadStyle,
  detailTitleStyle,
  inlineRowStyle,
  pathInputStyle,
  wrapLabelStyle,
}
