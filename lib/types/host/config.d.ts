import z from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
/** 条目数量上限（防止面板/注册表被无限撑大）。 */
declare const MAX_SHELL_ENTRIES = 16;
/** 一个 shell 条目（配置模型）。 */
export interface ShellEntry {
    /** 面板用于标识条目的稳定 id（跨保存保持不变）。 */
    id: string;
    /** 工具名（模型看到的 shell 工具名）；同一组合内必须唯一。 */
    name: string;
    /**
     * 显示名：只用于配置面板里区分条目（例如同为 `bash` 工具名的 git-bash 与 cygwin），
     * 不参与工具名、工具提示词或执行。留空时面板回落到工具名 / 可执行文件名。
     */
    label: string;
    /** 是否注册为该 shell 工具。 */
    enabled: boolean;
    /**
     * 可执行文件：**绝对路径**（如 `C:\\Program Files\\Git\\bin\\bash.exe`）**或纯文件名**
     * （如 `bash.exe`，此时在进程 PATH 里查找）；留空则按家族自动探测。
     */
    path: string;
    /**
     * 启动参数模板：可执行文件之后的**全部**参数，用 `{command}` 占位实际命令。
     * 留空用家族默认（bash `-c {command}`、PowerShell `-NoLogo -NoProfile -NonInteractive -Command {command}`）；
     * 想换掉取命令的开关（如 `-c`）就改这里，例如 `-l -c {command}`、`-Command {command}`、
     * 甚至只写 `{command}`。空白分隔，支持双引号分组。
     */
    args: string;
    /** 工具提示词（模型看到的工具说明）；留空使用默认模板。 */
    description: string;
    /** 是否跳过文件沙箱（等同 danger-full-access，不再触发沙箱审批）。 */
    fullAccess: boolean;
    /** 多个 shell 启用时，引导提示词里优先推荐的 shell（至多一个）。 */
    primary: boolean;
}
export interface Config {
    /**
     * shell 条目列表（可增删）。live 字段必须是 volatile 引用（settings 从 Config
     * schema 投影表单），读取时用 unwrapVolatile 解包。
     */
    shells: Volatile<ShellEntry[]>;
    /** @deprecated 旧版单 shell 首选（auto/bash/pwsh）；仅在 shells 为空时用于迁移。 */
    preferred: Volatile<'auto' | 'bash' | 'pwsh'>;
    /** @deprecated 旧版显式 bash 路径；仅在 shells 为空时用于迁移。 */
    bashPath: Volatile<string>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    shells: z<NoInfer<({
        id?: string | null | undefined;
        name?: string | null | undefined;
        label?: string | null | undefined;
        enabled?: boolean | null | undefined;
        path?: string | null | undefined;
        args?: string | null | undefined;
        description?: string | null | undefined;
        fullAccess?: boolean | null | undefined;
        primary?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[]>, NoInfer<Schemastery.ObjectT<NoInfer<{
        id: z<string, string, "defined">;
        name: z<string, string, "defined">;
        label: z<string, string, "defined">;
        enabled: z<boolean, boolean, "defined">;
        path: z<string, string, "defined">;
        args: z<string, string, "defined">;
        description: z<string, string, "defined">;
        fullAccess: z<boolean, boolean, "defined">;
        primary: z<boolean, boolean, "defined">;
    }>>[]>, "volatile-defined">;
    preferred: z<"pwsh" | "bash" | "auto", "pwsh" | "bash" | "auto", "volatile-defined">;
    bashPath: z<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    shells: z<NoInfer<({
        id?: string | null | undefined;
        name?: string | null | undefined;
        label?: string | null | undefined;
        enabled?: boolean | null | undefined;
        path?: string | null | undefined;
        args?: string | null | undefined;
        description?: string | null | undefined;
        fullAccess?: boolean | null | undefined;
        primary?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[]>, NoInfer<Schemastery.ObjectT<NoInfer<{
        id: z<string, string, "defined">;
        name: z<string, string, "defined">;
        label: z<string, string, "defined">;
        enabled: z<boolean, boolean, "defined">;
        path: z<string, string, "defined">;
        args: z<string, string, "defined">;
        description: z<string, string, "defined">;
        fullAccess: z<boolean, boolean, "defined">;
        primary: z<boolean, boolean, "defined">;
    }>>[]>, "volatile-defined">;
    preferred: z<"pwsh" | "bash" | "auto", "pwsh" | "bash" | "auto", "volatile-defined">;
    bashPath: z<string, string, "volatile-defined">;
}>>, "plain">;
/** 插件 apply 收到的原始 config（volatile 字段为引用对象）。 */
type RawConfig = {
    shells: unknown;
    preferred: unknown;
    bashPath: unknown;
};
/** 字符串字段读取（非字符串一律按空串处理）。 */
declare function stringField(value: unknown): string;
/** 归一化一个条目的原始值；无法解析的条目丢弃。 */
declare function normalizeEntry(value: unknown, index: number, usedIds: Set<string>): ShellEntry | undefined;
/**
 * 归一化条目列表：读取配置与写入配置共用同一条路径，保证面板看到的形状可再次落盘。
 * 同时收敛 primary（至多一个）等值域约束。
 */
declare function normalizeEntries(value: unknown): ShellEntry[];
/** 面板与错误信息里标识条目的名字：显示名优先，留空回落到工具名。 */
declare function entryLabel(entry: Pick<ShellEntry, 'label' | 'name'>): string;
/** 保存前的整表校验（返回错误文本；undefined 表示通过）。 */
declare function validateEntriesForSave(entries: readonly ShellEntry[]): string | undefined;
type ResolvedConfig = {
    shells: ShellEntry[];
    legacyPreferred: 'auto' | 'bash' | 'pwsh';
    legacyBashPath: string;
};
/** 从原始 config 读当前生效值（每次调用都取 volatile 最新快照）。 */
declare function readConfig(raw: RawConfig): ResolvedConfig;
/** 旧配置迁移：shells 为空时按 preferred/bashPath 生成等价条目（不落盘）。 */
declare function migrateLegacyEntries(cfg: ResolvedConfig, onWindows: boolean): ShellEntry[];
export { MAX_SHELL_ENTRIES, stringField, normalizeEntry, normalizeEntries, entryLabel, validateEntriesForSave, readConfig, migrateLegacyEntries, };
export type { RawConfig, ResolvedConfig };
