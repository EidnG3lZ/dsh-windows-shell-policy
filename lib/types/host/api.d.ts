import type { AppContext } from './context.js';
import type { ShellEntry } from './config.js';
import type { EntryStatus } from './policy.js';
export interface StatusApiDeps {
    /** 是否 Windows（/status 的 supported 字段）。 */
    isWindows: boolean;
    /** 当前生效条目（配置值，或旧配置迁移结果）。 */
    currentEntries(): {
        entries: ShellEntry[];
        migrated: boolean;
    };
    /** 条目运行时视图。 */
    statusView(): EntryStatus[];
    /** 已成功注册的工具名。 */
    registeredNames(): readonly string[];
    /** 按最新配置对齐策略（/status 的兜底对齐）。 */
    reconcile(): void;
    /** 旧配置字段（仅为兼容旧客户端字段而返回）。 */
    legacy(): {
        preferred: 'auto' | 'bash' | 'pwsh';
        bashPath: string;
    };
}
/** 注册面板读写用的 HTTP API（所有平台都会注册）。 */
export declare function registerStatusApi(ctx: AppContext, deps: StatusApiDeps): void;
