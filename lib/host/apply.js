/**
 * dsh-windows-shell-policy — host 侧的插件装配。
 *
 * `apply` 只做接线：解析配置入口、创建策略状态机与 HTTP API，然后在 Windows 上
 * 应用策略、监听 volatile 更新、裁剪内置 shell 工具面、注入引导 section、注册卸载清理。
 */
import { migrateLegacyEntries, readConfig } from './config.js';
import { createShellPolicy } from './policy.js';
import { registerStatusApi } from './api.js';
/**
 * DSH 内置 shell 工具名：本插件有工具注册成功时，从提示词工具面隐藏这些名字
 * （内置工具在运行时无法注销，只能靠 assemble 过滤隐藏）。
 */
const BUILT_IN_SHELL_TOOLS = ['bash', 'pwsh'];
export function apply(ctx, config) {
    const isWindows = process.platform === 'win32';
    // 0.2.0 起 config 的 live 字段是 volatile 引用；读取一律经 readConfig(source())。
    const entry = config;
    const source = () => entry;
    /** 当前生效条目（配置值），以及是否来自旧配置迁移。 */
    const currentEntries = () => {
        const cfg = readConfig(source());
        if (cfg.shells.length > 0)
            return { entries: cfg.shells, migrated: false };
        return { entries: migrateLegacyEntries(cfg, isWindows), migrated: true };
    };
    const policy = createShellPolicy({ ctx, isWindows, currentEntries });
    registerStatusApi(ctx, {
        isWindows,
        currentEntries,
        statusView: () => policy.statusView(),
        registeredNames: () => policy.registeredNames(),
        reconcile: () => policy.reconcile(),
        legacy: () => {
            const cfg = readConfig(source());
            return { preferred: cfg.legacyPreferred, bashPath: cfg.legacyBashPath };
        },
    });
    // 非 Windows：DSH 默认 bash 工具已可用，本插件跳过（不注册工具、不过滤、不注册引导）。
    if (!isWindows) {
        ctx.logger.info('[shell-policy] 非 Windows 平台，插件跳过（DSH 默认 bash 工具已可用）');
        return;
    }
    // DSH 0.2.0：settings 改为从插件 Config schema 自动投影表单，插件侧不再注册
    // namespace。配置变更由 Loader 重建 entry 后重新 apply。
    const settings = ctx.get('settings');
    if (settings !== undefined && typeof settings.configure === 'function') {
        try {
            ctx.effect(() => settings.configure({ auto: true }), 'dsh-windows-shell-policy: settings form');
        }
        catch (error) {
            ctx.logger.warn('[shell-policy] settings.configure 不可用（忽略）: %s', String(error));
        }
    }
    // 应用策略（按条目注册 / 注销 shell 工具）。
    policy.reconcile();
    // volatile-only 配置更新（面板保存、外部改 patch）：loader 不重挂插件，只原地更新
    // 引用并发这个事件，因此在这里重新应用策略，让工具注册与 /status 跟上新配置。
    const volatileUpdates = ctx;
    volatileUpdates.on('loader/volatile-update', () => { policy.reconcile(); });
    // 提示词工具面裁剪：本插件有工具注册成功时，隐藏 DSH 内置 bash/pwsh，
    // 让工具面完全由条目决定（内置工具名不能与本插件条目重名，见 entryProblem）。
    ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        // 兜底对齐（幂等）：工具面与隐藏集合不落后于最新配置。
        policy.reconcile();
        const assembled = await next();
        const ours = new Set(policy.registeredNames());
        if (ours.size === 0)
            return assembled;
        const hidden = BUILT_IN_SHELL_TOOLS.filter((toolName) => !ours.has(toolName));
        if (hidden.length === 0)
            return assembled;
        return { ...assembled, tools: assembled.tools.filter((tool) => !hidden.includes(tool.name)) };
    });
    // 引导文本：按当前已注册的 shell 工具动态生成（sections 按会话快照）。
    ctx.systemPrompt.section({
        name: 'shell-policy',
        order: 104,
        text: () => policy.guidanceText(),
    });
    // 卸载清理：注销动态注册的 shell 工具。
    ctx.effect(() => () => {
        policy.disposeAll();
    }, 'dsh-windows-shell-policy: shell tool cleanup');
}
//# sourceMappingURL=apply.js.map