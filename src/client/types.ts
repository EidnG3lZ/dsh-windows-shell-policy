/**
 * dsh-windows-shell-policy — client 面板的类型与常量。
 */
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'

type ClientContext = {
  slots: SlotsService
  remote: {
    $on(event: string, callback: (ref?: unknown) => void): () => void
  }
}

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

export { MAX_ENTRIES }
export type { ClientContext, EntryStatus, Status, DraftEntry }
