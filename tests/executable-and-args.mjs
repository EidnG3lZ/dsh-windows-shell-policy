
/**
 * host 侧「可执行文件（绝对路径 / 文件名走 PATH）/ 启动参数模板 / 默认提示词」回归测试（沙箱内可跑）。
 *
 * 与 host-harness.mjs 的区别：这里把 ctx.subprocess.spawn 换成**记录型桩**，不真正启动
 * 子进程，因此不受「受限沙箱不能开管道」的限制（host-harness 需要完全权限）。
 * 覆盖：path 为绝对路径 / 文件名（在 PATH 里查，无扩展名自动补 .exe）/ 空（家族探测）、
 * 非法 path 被拒、启动参数模板（含 {command} 占位符与 -c 开关替换）、PowerShell 家族方言、
 * /defaults 与工具回落文本一致、/detect、保存校验与字段归一化上限。
 *
 * 运行：node tests/executable-and-args.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

const BIN = mkdtempSync(join(tmpdir(), 'dsh-shell-bin-'))
writeFileSync(join(BIN, 'bash.exe'), '')
writeFileSync(join(BIN, 'pwsh.exe'), '')
const FAKE_BASH = join(BIN, 'bash.exe')
const FAKE_PWSH = join(BIN, 'pwsh.exe')
const ORIGINAL_PATH = process.env.PATH ?? ''
process.env.PATH = BIN + ';' + ORIGINAL_PATH

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) console.log('  ok   ' + name)
  else {
    failures += 1
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' -- ' + detail))
  }
}

const values = { shells: [], preferred: 'auto', bashPath: '' }
const config = {
  shells: { get: () => values.shells },
  preferred: { get: () => values.preferred },
  bashPath: { get: () => values.bashPath },
}
const tools = new Map()
const spawnCalls = []
const routes = []
const settingsWrites = []
const listeners = new Map()
const services = {
  settings: { configure: () => () => {}, mutate: async (ns, ops) => { settingsWrites.push({ ns, ops }) } },
  sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
  sandbox: { confine: async (argv) => ({ argv, denialSignatures: ['sandbox: file access denied'] }) },
}
const ctx = {
  logger: { info: () => {}, warn: () => {} },
  effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  on: (event, handler) => { listeners.set(event, handler); return () => {} },
  get: (n) => services[n],
  tools: {
    register(definition) {
      if (tools.has(definition.name)) throw new Error('already registered: ' + definition.name)
      tools.set(definition.name, definition)
      return () => { tools.delete(definition.name) }
    },
    get: (n) => tools.get(n),
  },
  subprocess: {
    spawn(spec) {
      spawnCalls.push(spec)
      return {
        done: Promise.resolve({ exitCode: 0, signal: null }),
        terminate: () => {},
        collected: {
          stdout: { readFrom: () => ({ text: 'ok', nextOffset: 2, lossy: false }) },
          stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
        },
      }
    },
  },
  systemPrompt: { section: () => () => {} },
  webServer: { register: (spec) => { routes.push(spec); return () => {} } },
  loader: { entries: () => [{ options: { id: 'dsh-windows-shell-policy', name: 'dsh-windows-shell-policy' } }] },
}

function callApi(path, method, body) {
  return new Promise((resolve, reject) => {
    const route = routes[0]
    const handlers = {}
    const req = { url: path, method, on(event, cb) { handlers[event] = cb; return this } }
    const res = { writeHead(code) { this.code = code }, end(text) { resolve({ code: this.code, json: JSON.parse(text) }) } }
    Promise.resolve(route.handler(req, res)).catch(reject)
    if (handlers.data !== undefined) handlers.data(JSON.stringify(body === undefined ? {} : body))
    if (handlers.end !== undefined) handlers.end()
  })
}

const entry = (patch) => Object.assign({
  id: 'e1', name: 'bash', enabled: true, path: '', args: '',
  description: '', fullAccess: false, primary: true,
}, patch)
const signal = () => new AbortController().signal
const live = (shells) => { values.shells = shells; listeners.get('loader/volatile-update')?.() }
const argvOf = async (shell, command) => {
  live([shell])
  const tool = tools.get(shell.name)
  await tool.execute({ command, description: 'probe' }, { callId: 'c', signal: signal() })
  return spawnCalls.at(-1).argv
}

// 1) 可执行文件：绝对路径 / 文件名（PATH）/ 无扩展名
values.shells = [entry({ path: FAKE_BASH })]
apply(ctx, config)
let status = await callApi('/dsh-shell-policy/api/status', 'GET')
check('绝对路径直接用', status.json.entries[0]?.resolvedPath === FAKE_BASH, status.json.entries[0]?.resolvedPath)
live([entry({ path: 'bash.exe' })])
status = await callApi('/dsh-shell-policy/api/status', 'GET')
check('文件名在 PATH 里查找', status.json.entries[0]?.resolvedPath === FAKE_BASH, status.json.entries[0]?.resolvedPath)
live([entry({ path: 'bash' })])
status = await callApi('/dsh-shell-policy/api/status', 'GET')
check('无扩展名自动补 .exe', status.json.entries[0]?.resolvedPath === FAKE_BASH, status.json.entries[0]?.resolvedPath)
live([entry({ path: 'C:/definitely/not/here/bash.exe' })])
status = await callApi('/dsh-shell-policy/api/status', 'GET')
check('绝对路径不存在 → 条目报错', String(status.json.entries[0]?.error ?? '').includes('未找到可执行文件'), JSON.stringify(status.json.entries[0]?.error))
live([entry({ path: 'no-such-shell-xyz' })])
status = await callApi('/dsh-shell-policy/api/status', 'GET')
check('PATH 里没有该文件 → 条目报错', String(status.json.entries[0]?.error ?? '').includes('PATH 里没有找到'), JSON.stringify(status.json.entries[0]?.error))
const relative = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ path: 'sub/bash.exe' })] })
check('相对路径被拒绝', relative.code === 400 && String(relative.json.error).includes('绝对路径'), JSON.stringify(relative.json))

// 2) 启动参数模板
check('默认 bash 模板 = -c {command}',
  JSON.stringify(await argvOf(entry({ path: FAKE_BASH }), 'echo hi')) === JSON.stringify([FAKE_BASH, '-c', 'echo hi']),
  JSON.stringify(await argvOf(entry({ path: FAKE_BASH }), 'echo hi')))
check('自定义模板可加开关',
  JSON.stringify(await argvOf(entry({ path: FAKE_BASH, args: '-l -c {command}' }), 'echo hi')) === JSON.stringify([FAKE_BASH, '-l', '-c', 'echo hi']))
check('模板可完全替换 -c（只留 {command}）',
  JSON.stringify(await argvOf(entry({ path: FAKE_BASH, args: '{command}' }), 'echo hi')) === JSON.stringify([FAKE_BASH, 'echo hi']))
check('模板可换成别的开关',
  JSON.stringify(await argvOf(entry({ path: FAKE_BASH, args: '--cmd={command}' }), 'echo hi')) === JSON.stringify([FAKE_BASH, '--cmd=echo hi']))
const pwshDefault = await argvOf(entry({ id: 'e2', name: 'powershell', path: FAKE_PWSH }), 'Write-Output x')
check('pwsh 默认模板含 -NoLogo/-NoProfile/-Command',
  pwshDefault[0] === FAKE_PWSH && pwshDefault[1] === '-NoLogo' && pwshDefault[2] === '-NoProfile' && pwshDefault[3] === '-NonInteractive' && pwshDefault[4] === '-Command' && pwshDefault[5].endsWith('Write-Output x') && pwshDefault[5].includes('[Console]::OutputEncoding'),
  JSON.stringify(pwshDefault))
const pwshCustom = await argvOf(entry({ id: 'e2', name: 'powershell', path: FAKE_PWSH, args: '-Command {command}' }), 'Write-Output x')
check('pwsh 模板可去掉默认开关',
  pwshCustom.length === 3 && pwshCustom[1] === '-Command' && pwshCustom[2].endsWith('Write-Output x'),
  JSON.stringify(pwshCustom))
const noPlaceholder = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ args: '-l' })] })
check('模板缺 {command} 被拒绝', noPlaceholder.code === 400 && String(noPlaceholder.json.error).includes('{command}'), JSON.stringify(noPlaceholder.json))
const badQuote = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ args: '-l "{command}' })] })
check('引号未闭合被拒绝', badQuote.code === 400 && String(badQuote.json.error).includes('引号未闭合'), JSON.stringify(badQuote.json))
const long = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ args: '{command}' + 'x'.repeat(5000) })] })
check('启动参数截断到 1024', long.json.shells[0].args.length === 1024, String(long.json.shells[0].args.length))

// 3) 保存 / 状态 / 探测 / 默认提示词
const saved = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ path: 'bash.exe', args: '-l -c {command}' })] })
const written = settingsWrites.at(-1)?.ops?.[0]?.value?.[0]
check('保存带 path/args', saved.json.ok === true && written?.path === 'bash.exe' && written?.args === '-l -c {command}', JSON.stringify(saved.json).slice(0, 120))
live([entry({ path: 'bash.exe' })])
status = await callApi('/dsh-shell-policy/api/status', 'GET')
check('status 回传 path/args', status.json.entries[0]?.path === 'bash.exe' && status.json.entries[0]?.args === '', JSON.stringify(status.json.entries[0]).slice(0, 200))
const detect = await callApi('/dsh-shell-policy/api/detect', 'POST', { name: 'bash', path: 'bash.exe' })
check('/detect 支持文件名', detect.json.path === FAKE_BASH, JSON.stringify(detect.json))
const detectEmpty = await callApi('/dsh-shell-policy/api/detect', 'POST', { name: 'bash', path: '' })
check('/detect 留空仍走家族探测', String(detectEmpty.json.path).toLowerCase().endsWith('bash.exe'), JSON.stringify(detectEmpty.json))

const defaults = await callApi('/dsh-shell-policy/api/defaults', 'POST', { name: 'bash', path: 'bash.exe', args: '' })
check('/defaults 返回模板', defaults.json.ok === true && defaults.json.description.includes(FAKE_BASH), JSON.stringify(defaults.json).slice(0, 140))
check('/defaults 文本含 -c 开关', defaults.json.description.includes('-c'), defaults.json.description.slice(0, 160))
check('工具默认说明与 /defaults 完全一致', tools.get('bash')?.description === defaults.json.description, JSON.stringify([tools.get('bash')?.description?.slice(0, 80), defaults.json.description.slice(0, 80)]))
const defaultsCustom = await callApi('/dsh-shell-policy/api/defaults', 'POST', { name: 'bash', path: 'bash.exe', args: '-l -c {command}' })
check('/defaults 反映自定义模板', defaultsCustom.json.description.includes('-l -c') && !defaultsCustom.json.description.includes('{command}'), defaultsCustom.json.description.slice(0, 160))

// 4) 子进程环境与自定义提示词
live([entry({ path: FAKE_BASH })])
await tools.get('bash').execute({ command: 'x', description: 'p' }, { callId: 'c3', signal: signal() })
const env = spawnCalls.at(-1).env
check('不额外改写子进程 PATH', env.PATH === undefined, String(env.PATH).slice(0, 80))
check('DSH_* 变量仍然注入', Object.keys(env).filter((k) => k.startsWith('DSH_')).length === Object.keys(process.env).filter((k) => k.startsWith('DSH_')).length)
live([entry({ path: FAKE_BASH, description: 'custom prompt' })])
check('自定义提示词优先于模板', tools.get('bash')?.description === 'custom prompt', tools.get('bash')?.description)

// 5) 显示名（label）：面板里区分同工具名的条目，不进入工具面
live([entry({ path: FAKE_BASH, label: '  Git\tBash  ' })])
let labelStatus = await callApi('/dsh-shell-policy/api/status', 'GET')
check('显示名折叠空白', labelStatus.json.entries[0]?.label === 'Git Bash', JSON.stringify(labelStatus.json.entries[0]?.label))
check('显示名不改变工具名', tools.has('bash') && !tools.has('Git Bash'), [...tools.keys()].join(','))
const savedLabel = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ path: 'bash.exe', label: 'Cygwin' })] })
check('保存带 label', savedLabel.json.ok === true && settingsWrites.at(-1)?.ops?.[0]?.value?.[0]?.label === 'Cygwin', JSON.stringify(savedLabel.json).slice(0, 120))
const longLabel = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ label: 'x'.repeat(200) })] })
check('显示名截断到 64', longLabel.json.shells[0].label.length === 64, String(longLabel.json.shells[0].label.length))
const missingLabel = await callApi('/dsh-shell-policy/api/shells', 'POST', { shells: [entry({ label: undefined })] })
check('旧配置缺 label 补空串', missingLabel.json.shells[0].label === '', JSON.stringify(missingLabel.json.shells[0].label))
const dupLabel = await callApi('/dsh-shell-policy/api/shells', 'POST', {
  shells: [
    entry({ id: 'e1', name: 'bash', label: 'Git Bash', path: 'bash.exe' }),
    entry({ id: 'e2', name: 'bash', label: 'Cygwin', path: 'bash.exe', primary: false }),
  ],
})
check('重名保存报错带显示名', dupLabel.code === 400 && String(dupLabel.json.error).includes('Git Bash'), JSON.stringify(dupLabel.json))
live([
  entry({ id: 'e1', name: 'bash', label: 'Git Bash', path: FAKE_BASH }),
  entry({ id: 'e2', name: 'cygwin_bash', label: 'Cygwin', path: FAKE_BASH, primary: false }),
])
check('不同工具名的条目可共存（靠显示名区分）', tools.has('bash') && tools.has('cygwin_bash'), [...tools.keys()].join(','))

process.env.PATH = ORIGINAL_PATH
rmSync(BIN, { recursive: true, force: true })
console.log(failures === 0 ? 'ALL CHECKS PASSED (' + checks + ')' : 'FAILED ' + failures + '/' + checks)
process.exit(failures === 0 ? 0 : 1)
