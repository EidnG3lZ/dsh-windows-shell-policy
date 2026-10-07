/**
 * 本地集成测试（假 ctx，不启动 DSH）：验证 host 侧的条目模型、旧配置迁移、
 * 多工具注册、执行链路（真实 spawn git-bash / pwsh）、提示词裁剪与 HTTP API。
 *
 * 运行：node tests/host-harness.mjs
 * 注意：脚本用管道捕获子进程输出，受限沙箱下 spawn 管道会 EPERM，
 *       因此需要在无沙箱（完全权限）下运行。
 */
import { spawn as spawnProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { apply, Config } from '../lib/index.js'

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const GITBASH = 'C:\\Program Files\\Git\\bin\\bash.exe'
const signal = () => new AbortController().signal
const rejects = async (fn) => {
  try { await fn(); return false } catch { return true }
}
const bashEntry = (patch = {}) => ({
  id: 'e1', name: 'bash', enabled: true, path: GITBASH, description: '', fullAccess: false, primary: true, ...patch,
})

function makeHarness(options = {}) {
  const tools = new Map()
  const services = options.services ?? {}
  const harness = {
    tools, services,
    spawnCalls: [], confineCalls: [], sections: [], routes: [], listeners: new Map(),
    logs: [], settingsWrites: [],
  }
  for (const name of options.builtinTools ?? []) tools.set(name, { name })
  harness.ctx = {
    logger: {
      info: (...args) => harness.logs.push(['info', ...args]),
      warn: (...args) => harness.logs.push(['warn', ...args]),
    },
    effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    on: (event, handler) => { harness.listeners.set(event, handler); return () => {} },
    get: (name) => services[name],
    tools: {
      register(definition) {
        // 与真实 ToolRuntime.register 一致：先做 registry 级 schema 校验。
        assertSupportedJsonSchema(definition.output.schema)
        if (tools.has(definition.name)) throw new Error(`tool "${definition.name}" is already registered`)
        tools.set(definition.name, definition)
        return () => { tools.delete(definition.name) }
      },
      get: (name) => tools.get(name),
    },
    subprocess: {
      spawn(spec) {
        harness.spawnCalls.push(spec)
        const child = spawnProcess(spec.argv[0], spec.argv.slice(1), {
          cwd: spec.cwd,
          env: { ...process.env, ...(spec.env ?? {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => { stdout += String(chunk) })
        child.stderr.on('data', (chunk) => { stderr += String(chunk) })
        const done = new Promise((resolve) => {
          child.on('close', (code, exitSignal) => resolve({ exitCode: code, signal: exitSignal }))
          child.on('error', () => resolve({ exitCode: null, signal: null }))
        })
        spec.signal?.addEventListener('abort', () => { child.kill() })
        return {
          done,
          terminate: () => { child.kill() },
          collected: {
            stdout: { readFrom: (offset) => ({ text: stdout.slice(offset), nextOffset: stdout.length, lossy: false }) },
            stderr: { readFrom: (offset) => ({ text: stderr.slice(offset), nextOffset: stderr.length, lossy: false }) },
          },
        }
      },
    },
    systemPrompt: { section: (section) => { harness.sections.push(section); return () => {} } },
    webServer: { register: (spec) => { harness.routes.push(spec); return () => {} } },
    loader: { entries: () => [{ options: { id: 'dsh-windows-shell-policy', name: 'dsh-windows-shell-policy' } }] },
  }
  harness.emit = (event, ...args) => harness.listeners.get(event)?.(...args)
  return harness
}

function wireServices(harness, overrides = {}) {
  harness.services.settings = overrides.settings ?? {
    configure: () => () => {},
    mutate: async (ns, ops) => { harness.settingsWrites.push({ ns, ops }) },
  }
  harness.services.sandboxPolicy = overrides.sandboxPolicy ?? {
    resolve: () => ({ mode: 'workspace-write', workspaceRoot: process.cwd() }),
  }
  harness.services.sandbox = overrides.sandbox ?? {
    confine: async (argv, policy) => {
      harness.confineCalls.push({ argv, policy })
      return { argv, denialSignatures: ['sandbox: file access denied'] }
    },
  }
  return harness
}

/** 手工 volatile 包装：引用值可被测试改写，模拟 loader 在热更新时的原地 updateVolatile。 */
function liveConfig(values) {
  return {
    shells: { get: () => values.shells ?? [] },
    preferred: { get: () => values.preferred ?? 'auto' },
    bashPath: { get: () => values.bashPath ?? '' },
  }
}

/** 用 Config schema 解析（volatile 字段变成带 get() 的引用，与 DSH loader 一致）。 */
function pluginConfig(values) {
  try {
    const parsed = Config(values)
    if (parsed?.shells !== undefined && typeof parsed.shells.get === 'function') return parsed
  } catch {
    // 落到手工 volatile 包装
  }
  return {
    shells: { get: () => values.shells ?? [] },
    preferred: { get: () => values.preferred ?? 'auto' },
    bashPath: { get: () => values.bashPath ?? '' },
  }
}

function callApi(route, url, method, body) {
  return new Promise((resolve, reject) => {
    const res = {
      status: 0,
      headers: undefined,
      body: '',
      writeHead(code, headers) { this.status = code; this.headers = headers },
      end(payload) {
        this.body = payload
        try { resolve({ status: this.status, headers: this.headers, json: payload.length > 0 ? JSON.parse(payload) : undefined }) }
        catch (error) { reject(error) }
      },
    }
    const request = {
      url,
      method,
      on(event, callback) {
        if (event === 'data' && body !== undefined) callback(JSON.stringify(body))
        if (event === 'end') callback()
        return request
      },
    }
    void route.handler(request, res)
  })
}

console.log('== Config schema ==')
{
  const parsed = Config({})
  check('shells 默认空数组', Array.isArray(parsed.shells.get()) && parsed.shells.get().length === 0)
  check('preferred 默认 auto', parsed.preferred.get() === 'auto')
  check('bashPath 默认空串', parsed.bashPath.get() === '')
  const withEntry = Config({ shells: [{ name: 'bash', enabled: true, path: GITBASH }] })
  check('数组条目解析并补默认值', withEntry.shells.get()[0]?.fullAccess === false && withEntry.shells.get()[0]?.description === '')
}

console.log('== 全新安装：默认迁移为启用的 bash 条目 ==')
{
  const h = wireServices(makeHarness())
  apply(h.ctx, pluginConfig({ preferred: 'auto', bashPath: '', shells: [] }))
  check('注册 bash 工具', h.tools.has('bash'))
  const status = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  check('status.migrated=true', status.json.migrated === true)
  check('解析出 bash.exe', String(status.json.entries[0]?.resolvedPath ?? '').endsWith('bash.exe'), JSON.stringify(status.json.entries[0]))
  const tool = h.tools.get('bash')
  const result = await tool.execute({ command: 'echo out; echo err 1>&2; exit 3', description: 'probe' }, { callId: 'c1', signal: signal() })
  check('exitCode=3', result.exitCode === 3, String(result.exitCode))
  check('stdout 捕获', result.stdout.text.includes('out'), JSON.stringify(result.stdout.text))
  check('stderr 捕获', result.stderr.text.includes('err'), JSON.stringify(result.stderr.text))
  check('受沙箱管辖时 confine 被调用', h.confineCalls.length === 1, String(h.confineCalls.length))
  const rendered = tool.output.render(undefined, result)[0].text
  check('渲染末尾带 [exit code: 3]', rendered.includes('[exit code: 3]'), JSON.stringify(rendered))
  const view = tool.presentResult({ command: 'echo out; echo err 1>&2; exit 3', description: 'probe' }, { content: [{ type: 'text', text: rendered }], isError: false })
  check('presentResult 拆出 exit pill', view?.card === 'terminal' && view.exitCode === 3 && !view.output.includes('[exit code'), JSON.stringify(view))
  const assembly = { sections: [], contexts: [], tools: [{ name: 'pwsh' }, { name: 'bash' }, { name: 'read' }], variables: {} }
  const filtered = await h.listeners.get('system-prompt/assemble')(assembly, {}, async () => assembly)
  check('assemble 隐藏内置 pwsh、保留自身 bash', filtered.tools.map((t) => t.name).join(',') === 'bash,read', filtered.tools.map((t) => t.name).join(','))
  const section = h.sections.find((item) => item.name === 'shell-policy')
  const text = section.text()
  check('引导文本列出 bash', text.includes('available shell tools') && text.includes('bash'), text)
  const detect = await callApi(h.routes[0], '/dsh-shell-policy/api/detect', 'POST', { name: 'bash', path: '' })
  check('探测接口返回路径', detect.json.ok === true && String(detect.json.path).endsWith('bash.exe'), JSON.stringify(detect.json))
  const bad = await callApi(h.routes[0], '/dsh-shell-policy/api/shells', 'POST', { shells: [bashEntry(), bashEntry({ id: 'e2' })] })
  check('重复工具名被拒', bad.status === 400, JSON.stringify(bad.json))
  const good = await callApi(h.routes[0], '/dsh-shell-policy/api/shells', 'POST', { shells: [bashEntry()] })
  check('合法条目写入 settings', good.status === 200 && h.settingsWrites.at(-1)?.ops?.[0]?.path?.[0] === 'shells', JSON.stringify(h.settingsWrites.at(-1)))
}

console.log('== fullAccess ==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  apply(h.ctx, pluginConfig({ shells: [bashEntry({ fullAccess: true })] }))
  const tool = h.tools.get('bash')
  check('不暴露 sandbox_permissions', tool.parameters.properties?.sandbox_permissions === undefined)
  const result = await tool.execute({ command: 'echo full', description: 'probe' }, { callId: 'c2', signal: signal() })
  check('fullAccess 不调用 confine', h.confineCalls.length === 0, String(h.confineCalls.length))
  check('fullAccess 仍可执行', result.stdout.text.includes('full'), JSON.stringify(result.stdout.text))
  check('fullAccess 拒绝升级参数', await rejects(() => tool.execute({ command: 'echo x', description: 'p', sandbox_permissions: 'danger-full-access', justification: 'why' }, { callId: 'c3', signal: signal() })))
}

console.log('== PowerShell 方言 ==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  apply(h.ctx, pluginConfig({ shells: [{ id: 'p1', name: 'powershell', enabled: true, path: '', description: '', fullAccess: false, primary: true }] }))
  const status = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  const resolved = String(status.json.entries[0]?.resolvedPath ?? '')
  if (resolved.length === 0) console.log('  skip：未探测到 pwsh')
  else {
    const tool = h.tools.get('powershell')
    check('powershell 工具已注册', tool !== undefined)
    const result = await tool.execute({ command: 'Write-Output psi-ok', description: 'probe' }, { callId: 'c4', signal: signal() })
    check('PowerShell 输出', result.stdout.text.includes('psi-ok'), JSON.stringify(result.stdout.text))
    check('argv 使用 -Command', h.spawnCalls.at(-1)?.argv.includes('-Command') === true, JSON.stringify(h.spawnCalls.at(-1)?.argv))
  }
}

console.log('== 工具 schema 与参数校验 ==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  apply(h.ctx, pluginConfig({ shells: [bashEntry()] }))
  const tool = h.tools.get('bash')
  let schemaOk = true
  try { assertSupportedJsonSchema(tool.output.schema) } catch { schemaOk = false }
  check('output schema 通过 registry 校验', schemaOk)
  check('合法参数通过校验', validateJsonSchemaValue(tool.parameters, { command: 'echo', description: 'p' }, '').length === 0)
  check('缺 command 被参数校验拦下', validateJsonSchemaValue(tool.parameters, { description: 'p' }, '').length > 0)
  check('未知工具名不被占用', h.tools.get('bash')?.name === 'bash')
}

console.log('== 工具名冲突 ==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  apply(h.ctx, pluginConfig({ shells: [
    bashEntry(),
    bashEntry({ id: 'e2', name: 'pwsh', primary: false }),
    bashEntry({ id: 'e3', name: 'bash', primary: false }),
  ] }))
  const status = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  check('内置 pwsh 占用报错', String(status.json.entries[1]?.error).includes('占用'), JSON.stringify(status.json.entries[1]))
  check('重复条目报错', String(status.json.entries[2]?.error).includes('重复'), JSON.stringify(status.json.entries[2]))
  check('只注册一个 bash', h.tools.has('bash') && h.tools.has('pwsh') && h.tools.size === 2, [...h.tools.keys()].join(','))
}

console.log('== 显示名（区分同工具名的条目）==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  const values = { shells: [], preferred: 'auto', bashPath: '' }
  apply(h.ctx, liveConfig(values))
  values.shells = [
    { id: 'e1', name: 'bash', label: 'Git Bash', enabled: true, path: GITBASH, description: '', fullAccess: false, primary: true },
    { id: 'e2', name: 'bash', label: 'Cygwin', enabled: true, path: GITBASH, description: '', fullAccess: false, primary: false },
  ]
  h.emit('loader/volatile-update')
  const status = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  check('显示名随条目返回', status.json.entries[0]?.label === 'Git Bash' && status.json.entries[1]?.label === 'Cygwin', JSON.stringify(status.json.entries.map((item) => item.label)))
  check('重名条目错误提示带显示名', String(status.json.entries[1]?.error).includes('「Git Bash」'), JSON.stringify(status.json.entries[1]?.error))
  check('registerError 用显示名', String(status.json.registerError ?? '').startsWith('Cygwin:'), JSON.stringify(status.json.registerError))
  check('显示名不进入工具面', h.tools.has('bash') && !h.tools.has('Git Bash'), [...h.tools.keys()].join(','))

  // 同名 shell 的常见用法：模型侧改用不同工具名（必须唯一），显示名只用于面板区分。
  values.shells = [
    { id: 'e1', name: 'bash', label: 'Git Bash', enabled: true, path: GITBASH, description: '', fullAccess: false, primary: true },
    { id: 'e2', name: 'cygwin_bash', label: 'Cygwin', enabled: true, path: GITBASH, description: '', fullAccess: false, primary: false },
  ]
  h.emit('loader/volatile-update')
  const both = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  check('不同工具名的条目共存', h.tools.has('bash') && h.tools.has('cygwin_bash'), [...h.tools.keys()].join(','))
  check('共存条目均无错误', both.json.entries.every((item) => item.error === undefined), JSON.stringify(both.json.entries.map((item) => item.error)))

  const dupSave = await callApi(h.routes[0], '/dsh-shell-policy/api/shells', 'POST', { shells: [
    bashEntry({ label: 'Git Bash' }), bashEntry({ id: 'e2', label: 'Cygwin', primary: false }),
  ] })
  check('重名保存报错带显示名', dupSave.status === 400 && String(dupSave.json.error).includes('Git Bash'), JSON.stringify(dupSave.json))
  const saved = await callApi(h.routes[0], '/dsh-shell-policy/api/shells', 'POST', { shells: [bashEntry({ label: 'Git Bash' })] })
  check('显示名落盘', saved.status === 200 && h.settingsWrites.at(-1)?.ops?.[0]?.value?.[0]?.label === 'Git Bash', JSON.stringify(h.settingsWrites.at(-1)))
}

console.log('== 旧 pwsh 配置迁移 ==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  apply(h.ctx, pluginConfig({ preferred: 'pwsh', bashPath: '', shells: [] }))
  const status = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  check('迁移为未启用的 powershell 条目', status.json.entries.length === 1 && status.json.entries[0].name === 'powershell' && status.json.entries[0].enabled === false, JSON.stringify(status.json.entries))
  check('不注册工具', !h.tools.has('powershell') && !h.tools.has('bash'))
}

console.log('== 全部停用 ==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  apply(h.ctx, pluginConfig({ shells: [bashEntry({ enabled: false })] }))
  check('停用条目不注册', !h.tools.has('bash'), [...h.tools.keys()].join(','))
  const assembly = { sections: [], contexts: [], tools: [{ name: 'pwsh' }, { name: 'read' }], variables: {} }
  const filtered = await h.listeners.get('system-prompt/assemble')(assembly, {}, async () => assembly)
  check('不裁剪内置工具', filtered.tools.length === 2, JSON.stringify(filtered.tools))
  const section = h.sections.find((item) => item.name === 'shell-policy')
  check('引导文本为空', section.text() === '', JSON.stringify(section.text()))
}

console.log('== 后台任务通道 ==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  const started = []
  h.services.jobs = {
    start(spec) {
      const handle = spec.run()
      started.push({ spec, handle })
      return 'job-1'
    },
  }
  apply(h.ctx, pluginConfig({ shells: [bashEntry()] }))
  const tool = h.tools.get('bash')
  const result = await tool.execute({ command: 'echo bg-ok', description: 'probe', run_in_background: true }, { callId: 'c5', signal: signal() })
  check('后台返回 jobId', result.kind === 'background' && result.jobId === 'job-1', JSON.stringify(result))
  check('后台 render 文案', tool.output.render(undefined, result)[0].text === 'started background job job-1')
  const outcome = await started[0].handle.done
  check('后台 JobOutcome completed', outcome.status === 'completed', JSON.stringify(outcome))
  const read = started[0].handle.readOutput()
  check('后台 readOutput 有输出', read.includes('bg-ok'), JSON.stringify(read))
  const view = tool.presentResult({ command: 'echo bg-ok', description: 'probe', run_in_background: true }, { content: [{ type: 'text', text: read }], isError: false })
  check('后台用 generic 卡片', view?.card === 'generic', JSON.stringify(view))
}

console.log('== volatile 热更新（面板保存路径）==')
{
  const h = wireServices(makeHarness({ builtinTools: ['pwsh'] }))
  const values = { shells: [], preferred: 'auto', bashPath: '' }
  apply(h.ctx, liveConfig(values))
  const initial = h.tools.get('bash')
  check('初始迁移注册 bash', initial !== undefined)
  check('非 fullAccess 暴露升级参数', initial.parameters.properties?.sandbox_permissions !== undefined)

  // 面板保存 = loader 原地更新 volatile 引用 + 发 loader/volatile-update，不重挂插件。
  values.shells = [
    { id: 'e1', name: 'bash', enabled: true, path: GITBASH, description: 'live-desc', fullAccess: true, primary: true },
    { id: 'e2', name: 'powershell', enabled: false, path: '', description: '', fullAccess: false, primary: false },
  ]
  h.emit('loader/volatile-update')
  const updated = h.tools.get('bash')
  check('热更新后换成新条目', updated !== undefined && updated.description === 'live-desc', updated?.description)
  check('热更新后 fullAccess 生效', updated.parameters.properties?.sandbox_permissions === undefined)
  check('停用条目不注册', !h.tools.has('powershell'))
  const status = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  check('/status 反映新配置', status.json.migrated === false && status.json.entries.length === 2 && status.json.entries[0].fullAccess === true, JSON.stringify(status.json.entries))
  check('/status registered 列表', JSON.stringify(status.json.registered) === JSON.stringify(['bash']), JSON.stringify(status.json.registered))

  // 完全不发事件：/status 自己也应对齐（兜底自愈）。
  values.shells = [{ id: 'e3', name: 'bash', enabled: false, path: '', description: '', fullAccess: false, primary: true }]
  const healed = await callApi(h.routes[0], '/dsh-shell-policy/api/status', 'GET')
  check('未收到事件时 /status 自愈', healed.json.entries[0]?.enabled === false && !h.tools.has('bash'), JSON.stringify(healed.json.entries))
}

console.log('== settings 持久化契约 ==')
{
  try {
    // 真实 settings 服务的校验：path ['shells'] 必须落在 volatile 字段上，
    // 否则 settings.mutate 会抛 "Config field \"shells\" is not volatile"。
    const require = createRequire(import.meta.url)
    const settingsEntry = require.resolve('@deepseek-ai/dsh-settings')
    const helpers = await import(pathToFileURL(join(dirname(settingsEntry), '..', 'src', 'schema.ts')).href)
    check('shells 是 volatile 路径', helpers.isVolatilePath(Config, ['shells']) === true)
    const form = helpers.volatileForm(Config)
    const hasShells = form !== undefined && Object.hasOwn(form.dict ?? {}, 'shells')
    check('volatileForm 含 shells', hasShells)
    if (form !== undefined) {
      const projected = helpers.projectForm(form, { shells: [{ name: 'bash', enabled: true, path: GITBASH }] })
      check('projectForm 保留条目数组', Array.isArray(projected.shells) && projected.shells[0]?.name === 'bash')
    }
  } catch (error) {
    console.log('  skip：未找到 dsh-settings 源码（非源码 checkout）', String(error).slice(0, 80))
  }
}

console.log(`\n${checks - failures}/${checks} 通过`)
if (failures > 0) {
  console.log(`失败 ${failures} 项`)
  process.exit(1)
}
console.log('全部通过')
