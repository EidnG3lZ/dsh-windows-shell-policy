/**
 * dsh-windows-shell-policy — host 侧的条目模型与配置读写。
 *
 * 职责：定义 ShellEntry / Config（含 schemastery schema），把任意原始值归一化成
 * 可再次落盘的条目表，做保存前整表校验，按 volatile 引用读取最新配置，并在
 * shells 为空时把旧配置（preferred / bashPath）迁移成等价条目。
 *
 * 条目字段分两用：`name` / `description` / `args` / `path` 决定模型看到的工具面与执行；
 * `label`（显示名）只用于面板显示与错误文案。
 */
import { basename } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { argTemplateProblem } from './shell-args.js';
import { executablePathProblem } from './detect.js';
/** 条目数量上限（防止面板/注册表被无限撑大）。 */
const MAX_SHELL_ENTRIES = 16;
/** 工具名长度上限。 */
const MAX_TOOL_NAME = 64;
/** 显示名长度上限（面板里区分条目的名字，不进入工具面）。 */
const MAX_LABEL = 64;
/** 路径长度上限。 */
const MAX_PATH = 1024;
/** 工具提示词长度上限。 */
const MAX_DESCRIPTION = 8_000;
/** 「启动参数」模板长度上限。 */
const MAX_ARGS = 1_024;
const ShellEntrySchema = z.object({
    id: z.string().default(''),
    name: z.string().default(''),
    label: z.string().default(''),
    enabled: z.boolean().default(false),
    path: z.string().default(''),
    args: z.string().default(''),
    description: z.string().default(''),
    fullAccess: z.boolean().default(false),
    primary: z.boolean().default(false),
});
export const Config = z.object({
    shells: z.array(ShellEntrySchema).default([]).volatile(),
    preferred: z.union([z.const('auto'), z.const('bash'), z.const('pwsh')]).default('auto').volatile(),
    bashPath: z.string().default('').volatile(),
});
/** 解包 volatile 引用（结构检测：带 get() 的引用对象；非引用值原样返回）。 */
function unwrapVolatile(value) {
    if (typeof value === 'object' && value !== null && typeof value.get === 'function') {
        return value.get();
    }
    return value;
}
/** 字符串字段读取（非字符串一律按空串处理）。 */
function stringField(value) {
    return typeof value === 'string' ? value : '';
}
/** 去掉非法字符，得到可用的工具名。 */
function sanitizeToolName(value) {
    return value
        .trim()
        .replace(/[^A-Za-z0-9_.-]+/g, '_')
        .replace(/^[_.-]+|[_.-]+$/g, '')
        .slice(0, MAX_TOOL_NAME);
}
/** 由可执行文件名推导默认工具名（pwsh 被 DSH 内置工具占用，故默认改名为 powershell）。 */
function deriveToolName(path) {
    const stem = sanitizeToolName(path.length > 0 ? basename(path).replace(/\.(exe|cmd|bat|sh)$/i, '') : '');
    if (stem === 'pwsh')
        return 'powershell';
    return stem.length > 0 ? stem : 'shell';
}
/** 归一化一个条目的原始值；无法解析的条目丢弃。 */
function normalizeEntry(value, index, usedIds) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const raw = value;
    const path = stringField(raw.path).trim().replace(/^"|"$/g, '').slice(0, MAX_PATH);
    const args = stringField(raw.args).trim().slice(0, MAX_ARGS);
    const explicitName = stringField(raw.name);
    const name = sanitizeToolName(explicitName.length > 0 ? explicitName : deriveToolName(path));
    // 显示名是给人看的：保留原字符（含中文），只折叠空白并截断。
    const label = stringField(raw.label).replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
    let id = stringField(raw.id).trim();
    if (id.length === 0 || usedIds.has(id))
        id = `shell-${index + 1}-${name.length > 0 ? name : 'entry'}`;
    while (usedIds.has(id))
        id = `${id}_`;
    usedIds.add(id);
    return {
        id,
        name: name.length > 0 ? name : 'shell',
        label,
        enabled: raw.enabled === true,
        path,
        args,
        description: stringField(raw.description).trim().slice(0, MAX_DESCRIPTION),
        fullAccess: raw.fullAccess === true,
        primary: raw.primary === true,
    };
}
/**
 * 归一化条目列表：读取配置与写入配置共用同一条路径，保证面板看到的形状可再次落盘。
 * 同时收敛 primary（至多一个）等值域约束。
 */
function normalizeEntries(value) {
    if (!Array.isArray(value))
        return [];
    const usedIds = new Set();
    const entries = [];
    for (const [index, item] of value.slice(0, MAX_SHELL_ENTRIES).entries()) {
        const entry = normalizeEntry(item, index, usedIds);
        if (entry !== undefined)
            entries.push(entry);
    }
    let primarySeen = false;
    for (const entry of entries) {
        if (!entry.primary)
            continue;
        if (primarySeen)
            entry.primary = false;
        else
            primarySeen = true;
    }
    return entries;
}
/** 面板与错误信息里标识条目的名字：显示名优先，留空回落到工具名。 */
function entryLabel(entry) {
    const label = entry.label.trim();
    return label.length > 0 ? label : entry.name;
}
/** 保存前的整表校验（返回错误文本；undefined 表示通过）。 */
function validateEntriesForSave(entries) {
    const names = new Map();
    for (const [index, entry] of entries.entries()) {
        if (entry.name === 'run_code')
            return `第 ${index + 1} 条：\`run_code\` 是 DSH 保留工具名`;
        const pathProblem = executablePathProblem(entry.path);
        if (pathProblem !== undefined)
            return `第 ${index + 1} 条：${pathProblem}`;
        const argsProblem = argTemplateProblem(entry.args);
        if (argsProblem !== undefined)
            return `第 ${index + 1} 条：${argsProblem}`;
        if (!entry.enabled)
            continue;
        const key = entry.name.toLowerCase();
        const seen = names.get(key);
        if (seen !== undefined) {
            return `第 ${index + 1} 条：工具名 "${entry.name}" 与第 ${seen.index + 1} 条「${entryLabel(seen.entry)}」重复`;
        }
        names.set(key, { index, entry });
    }
    return undefined;
}
/** 从原始 config 读当前生效值（每次调用都取 volatile 最新快照）。 */
function readConfig(raw) {
    const preferred = unwrapVolatile(raw.preferred);
    const bashPath = unwrapVolatile(raw.bashPath);
    return {
        shells: normalizeEntries(unwrapVolatile(raw.shells)),
        legacyPreferred: preferred === 'bash' || preferred === 'pwsh' ? preferred : 'auto',
        legacyBashPath: typeof bashPath === 'string' ? bashPath.trim().replace(/^"|"$/g, '') : '',
    };
}
/** 旧配置迁移：shells 为空时按 preferred/bashPath 生成等价条目（不落盘）。 */
function migrateLegacyEntries(cfg, onWindows) {
    if (!onWindows)
        return [];
    const base = { args: '', description: '', label: '', fullAccess: false, primary: true };
    if (cfg.legacyPreferred === 'pwsh') {
        // 旧 pwsh 模式 = 内置 pwsh 工具生效；迁移为未启用的 PowerShell 条目，
        // 需要本插件接管（含完全权限）时由用户在面板打开开关。
        return [{ id: 'legacy-pwsh', name: 'powershell', enabled: false, path: '', ...base }];
    }
    return [{ id: 'legacy-bash', name: 'bash', enabled: true, path: cfg.legacyBashPath, ...base }];
}
export { MAX_SHELL_ENTRIES, stringField, normalizeEntry, normalizeEntries, entryLabel, validateEntriesForSave, readConfig, migrateLegacyEntries, };
//# sourceMappingURL=config.js.map