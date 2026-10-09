import type { ShellEntry } from './config.js';
import type { AppContext } from './context.js';
/** 条目运行时状态（配置字段 + 探测/注册结果）。 */
interface EntryStatus extends ShellEntry {
    /** 实际使用的可执行文件路径；未找到为空串。 */
    resolvedPath: string;
    /** 是否已注册为工具。 */
    registered: boolean;
    /** 该条目的问题描述（未启用时为空）。 */
    error?: string;
}
export interface ShellPolicyDeps {
    /** 插件上下文（注册/注销工具、打日志都要用）。 */
    ctx: AppContext;
    /** 是否 Windows；非 Windows 时 reconcile 不动工具面。 */
    isWindows: boolean;
    /** 当前生效条目（配置值，或旧配置迁移结果）。 */
    currentEntries(): {
        entries: ShellEntry[];
        migrated: boolean;
    };
}
export interface ShellPolicy {
    /** 按最新 volatile 配置对齐（幂等；只在 Windows 执行）。 */
    reconcile(): void;
    /** /status 的条目运行时视图。 */
    statusView(): EntryStatus[];
    /** 已成功注册的工具名。 */
    registeredNames(): readonly string[];
    /** 引导提示词（没有已注册工具时为空串）。 */
    guidanceText(): string;
    /** 注销全部动态注册的工具。 */
    disposeAll(): void;
}
export declare function createShellPolicy(deps: ShellPolicyDeps): ShellPolicy;
export type { EntryStatus };
