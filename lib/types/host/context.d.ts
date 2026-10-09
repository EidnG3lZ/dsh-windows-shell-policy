/**
 * dsh-windows-shell-policy — host 侧的 DSH 上下文适配。
 *
 * 只放「与 DSH 接口对齐」的声明与工具，不含业务逻辑：
 * 1. 本插件消费的 host 服务面（webServer 的类型未随 Context 自动合并，需自行声明）；
 * 2. jobs 的 JobKindMap 增强（把 bash 注册为合法 job kind）；
 * 3. 经 loader 反查本插件 profile entry id（settings 写入时的 namespace）。
 */
import type { Context } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/dsh-jobs' {
    interface JobKindMap {
        bash: 'bash';
    }
}
/** 本插件的包名（也是 profile entry 的 name，用于解析自身 entry id）。 */
declare const PKG_NAME = "dsh-windows-shell-policy";
/**
 * 解析本插件在 profile 中的 entry id。
 * DSH 0.2.0 起 settings 的配置 namespace 即 profile entry id（插件 Config schema
 * 自动投影为表单），不再有插件自定义 namespace 的注册机制。
 */
declare function resolveOwnEntryId(ctx: Context): string | undefined;
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
export { PKG_NAME, resolveOwnEntryId };
export type { AppContext };
