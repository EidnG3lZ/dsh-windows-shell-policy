/**
 * dsh-windows-shell-policy — Windows shell policy bundle plugin（host 侧）。
 *
 * 职责：
 * 1. 维护一组可增删的「shell 条目」（启用开关 / 工具名 / 可执行文件路径 / 工具提示词 /
 *    沙箱完全权限 / 默认项）。条目经 /dsh-shell-policy/api 由 client 配置页读写，
 *    并持久化在本插件的 profile entry config（settings.mutate）。
 * 2. 路径留空时自动探测（Git for Windows / MSYS2 / Cygwin / PowerShell / PATH）。
 * 3. 策略生效：每个启用且可用的条目注册一个独立 shell 工具（Bash 家族用 `-c`，
 *    PowerShell 家族用 `-Command`）。单个条目失败只影响该条目，原因经 /status 暴露。
 * 4. fullAccess 条目跳过文件沙箱 confine（等同 danger-full-access，因此不再触发
 *    沙箱拒绝后的升级审批），也不再向模型暴露 sandbox_permissions/justification。
 * 5. 只要有本插件的条目注册成功，就在 system-prompt/assemble 隐藏 DSH 内置的
 *    bash/pwsh 工具（避免工具面出现重复 shell），并按条目生成引导提示词。
 * 6. 旧配置 preferred/bashPath 在 shells 为空时映射为等价条目（首次保存时落盘）。
 * 7. 非 Windows 平台只保留状态 API，不注册工具、不裁剪提示词。
 */
import type { Context, Volatile } from 'cordis';
import z from 'schemastery';
declare module '@deepseek-ai/dsh-jobs' {
    interface JobKindMap {
        bash: 'bash';
    }
}
export declare const name = "dsh-windows-shell-policy";
export declare const inject: string[];
/** 一个 shell 条目（配置模型）。 */
export interface ShellEntry {
    /** 面板用于标识条目的稳定 id（跨保存保持不变）。 */
    id: string;
    /** 工具名（模型看到的 shell 工具名）；同一组合内必须唯一。 */
    name: string;
    /** 是否注册为该 shell 工具。 */
    enabled: boolean;
    /** shell 可执行文件路径；留空则自动探测。 */
    path: string;
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
        enabled?: boolean | null | undefined;
        path?: string | null | undefined;
        description?: string | null | undefined;
        fullAccess?: boolean | null | undefined;
        primary?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[]>, NoInfer<Schemastery.ObjectT<NoInfer<{
        id: z<string, string, "defined">;
        name: z<string, string, "defined">;
        enabled: z<boolean, boolean, "defined">;
        path: z<string, string, "defined">;
        description: z<string, string, "defined">;
        fullAccess: z<boolean, boolean, "defined">;
        primary: z<boolean, boolean, "defined">;
    }>>[]>, "volatile-defined">;
    preferred: z<"bash" | "pwsh" | "auto", "bash" | "pwsh" | "auto", "volatile-defined">;
    bashPath: z<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    shells: z<NoInfer<({
        id?: string | null | undefined;
        name?: string | null | undefined;
        enabled?: boolean | null | undefined;
        path?: string | null | undefined;
        description?: string | null | undefined;
        fullAccess?: boolean | null | undefined;
        primary?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[]>, NoInfer<Schemastery.ObjectT<NoInfer<{
        id: z<string, string, "defined">;
        name: z<string, string, "defined">;
        enabled: z<boolean, boolean, "defined">;
        path: z<string, string, "defined">;
        description: z<string, string, "defined">;
        fullAccess: z<boolean, boolean, "defined">;
        primary: z<boolean, boolean, "defined">;
    }>>[]>, "volatile-defined">;
    preferred: z<"bash" | "pwsh" | "auto", "bash" | "pwsh" | "auto", "volatile-defined">;
    bashPath: z<string, string, "volatile-defined">;
}>>, "plain">;
/** 本插件消费的 host 服务面（webServer 类型由本包声明）。 */
type AppContext = Context & {
    webServer: {
        register(spec: {
            kind: 'prefix';
            path: string;
            handler: (req: any, res: {
                writeHead(code: number, headers: Record<string, string>): void;
                end(body: string): void;
            }) => void | Promise<void>;
        }): () => void;
    };
};
export declare function apply(ctx: AppContext, config: Config): void;
export {};
