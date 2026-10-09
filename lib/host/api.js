/**
 * dsh-windows-shell-policy — host 侧的 HTTP API（面板读写通道）。
 *
 * 路由挂在 /dsh-shell-policy/api：GET /status，POST /shells、/detect、/defaults，
 * 以及旧客户端的 /preferred、/bashpath。settings 的 client 端 RPC 有 allowlist 限制
 * （apiproxy WEB_SETTINGS_NAMESPACES），本插件 namespace 不在其中，因此面板读写都走这里，
 * host 端再经官方 settings 服务落盘。
 */
import { MAX_SHELL_ENTRIES, entryLabel, normalizeEntries, normalizeEntry, stringField, validateEntriesForSave } from './config.js';
import { resolveShellPath } from './detect.js';
import { defaultToolDescription, isPwshFamily } from './shell-args.js';
import { resolveOwnEntryId } from './context.js';
/** 读取请求体（手写拼接 + JSON.parse；与旧版一致，不做体积上限）。 */
async function readJsonBody(req) {
    const raw = await new Promise((resolveBody, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => resolveBody(data));
        req.on('error', reject);
    });
    return raw.length === 0 ? {} : JSON.parse(raw);
}
/** 注册面板读写用的 HTTP API（所有平台都会注册）。 */
export function registerStatusApi(ctx, deps) {
    ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-shell-policy/api',
        handler: async (req, res) => {
            const url = String(req.url ?? '');
            const send = (code, body) => {
                res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(body));
            };
            const writeSettings = async (path, value) => {
                const settings = ctx.get('settings');
                const entryId = resolveOwnEntryId(ctx);
                if (settings === undefined)
                    return 'settings service unavailable';
                if (entryId === undefined)
                    return 'own profile entry not found';
                try {
                    await settings.mutate(entryId, [{ op: 'set', path, value }]);
                    return undefined;
                }
                catch (error) {
                    return String(error);
                }
            };
            if (url.endsWith('/status') && req.method === 'GET') {
                // 兜底：即使没收到 volatile-update 事件，也按最新配置对齐一次。
                deps.reconcile();
                const view = deps.statusView();
                const bash = view.find((item) => item.resolvedPath.length > 0 && !isPwshFamily(item));
                const preferredEntry = view.find((item) => item.registered && item.primary) ?? view.find((item) => item.registered);
                const errors = view.flatMap((item) => item.error === undefined ? [] : [`${entryLabel(item)}: ${item.error}`]);
                const { migrated } = deps.currentEntries();
                send(200, {
                    platform: process.platform,
                    supported: deps.isWindows,
                    entries: view,
                    migrated,
                    registered: deps.registeredNames(),
                    // 旧客户端字段（v0.0.x 的单 shell 面板）：
                    effective: preferredEntry !== undefined && !isPwshFamily(preferredEntry) ? 'bash' : 'pwsh',
                    bashFound: bash !== undefined,
                    bashPath: bash?.resolvedPath ?? '',
                    preferred: deps.legacy().preferred,
                    configuredBashPath: deps.legacy().bashPath,
                    registerError: errors.length > 0 ? errors.join('; ') : undefined,
                });
                return;
            }
            if (url.endsWith('/shells') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const rawShells = parsed.shells;
                if (!Array.isArray(rawShells)) {
                    send(400, { ok: false, error: 'shells must be an array' });
                    return;
                }
                if (rawShells.length > MAX_SHELL_ENTRIES) {
                    send(400, { ok: false, error: `too many shells (max ${MAX_SHELL_ENTRIES})` });
                    return;
                }
                const shells = normalizeEntries(rawShells);
                const invalid = validateEntriesForSave(shells);
                if (invalid !== undefined) {
                    send(400, { ok: false, error: invalid });
                    return;
                }
                const failure = await writeSettings(['shells'], shells);
                if (failure !== undefined) {
                    send(500, { ok: false, error: failure });
                    return;
                }
                send(200, { ok: true, shells });
                return;
            }
            if (url.endsWith('/detect') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const body = parsed;
                const probe = normalizeEntry({
                    id: 'probe',
                    name: stringField(body.name),
                    enabled: true,
                    path: stringField(body.path),
                    args: '',
                    description: '',
                    fullAccess: false,
                    primary: false,
                }, 0, new Set());
                const found = probe === undefined ? '' : resolveShellPath(probe);
                send(200, { ok: true, path: found });
                return;
            }
            if (url.endsWith('/defaults') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const body = parsed;
                const candidate = normalizeEntry({
                    id: 'defaults',
                    name: stringField(body.name),
                    enabled: true,
                    path: stringField(body.path),
                    args: stringField(body.args),
                    description: '',
                    fullAccess: false,
                    primary: false,
                }, 0, new Set());
                if (candidate === undefined) {
                    send(400, { ok: false, error: 'invalid body' });
                    return;
                }
                // 与 buildTool 的回落文本完全一致；面板用它预填/重置工具提示词。
                send(200, { ok: true, description: defaultToolDescription(candidate, resolveShellPath(candidate)) });
                return;
            }
            if (url.endsWith('/preferred') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const preferred = parsed.preferred;
                if (preferred !== 'auto' && preferred !== 'bash' && preferred !== 'pwsh') {
                    send(400, { ok: false, error: 'preferred must be auto | bash | pwsh' });
                    return;
                }
                const failure = await writeSettings(['preferred'], preferred);
                if (failure !== undefined) {
                    send(500, { ok: false, error: failure });
                    return;
                }
                send(200, { ok: true, preferred });
                return;
            }
            if (url.endsWith('/bashpath') && req.method === 'POST') {
                let parsed;
                try {
                    parsed = await readJsonBody(req);
                }
                catch {
                    send(400, { ok: false, error: 'invalid json body' });
                    return;
                }
                const bashPath = stringField(parsed.bashPath).trim();
                const failure = await writeSettings(['bashPath'], bashPath);
                if (failure !== undefined) {
                    send(500, { ok: false, error: failure });
                    return;
                }
                send(200, { ok: true, bashPath });
                return;
            }
            send(404, { ok: false, error: 'not found' });
        },
    }), 'dsh-windows-shell-policy: status api');
}
//# sourceMappingURL=api.js.map