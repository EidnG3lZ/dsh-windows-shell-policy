/** 本插件的包名（也是 profile entry 的 name，用于解析自身 entry id）。 */
const PKG_NAME = 'dsh-windows-shell-policy';
/**
 * 解析本插件在 profile 中的 entry id。
 * DSH 0.2.0 起 settings 的配置 namespace 即 profile entry id（插件 Config schema
 * 自动投影为表单），不再有插件自定义 namespace 的注册机制。
 */
function resolveOwnEntryId(ctx) {
    const loader = ctx.loader;
    if (loader === undefined || typeof loader.entries !== 'function')
        return undefined;
    for (const entry of loader.entries()) {
        const options = entry.options;
        if (options !== undefined && String(options.name ?? '') === PKG_NAME && typeof options.id === 'string') {
            return options.id;
        }
    }
    return undefined;
}
export { PKG_NAME, resolveOwnEntryId };
//# sourceMappingURL=context.js.map