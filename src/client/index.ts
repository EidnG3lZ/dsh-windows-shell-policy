/**
 * dsh-windows-shell-policy — client 配置页入口（plugins.bundle.config）。
 *
 * 在插件管理页的本插件详情页注册「Shell 工具」配置面板：可增删的 shell 条目列表。
 * 列表里的条目是**折叠态**——只显示名称（只读；显示名优先，留空回落到工具名）、启用开关
 * 与「默认」单选，避免长条目撑满屏幕；显示名、工具名、可执行文件路径（可探测）、工具提示词、
 * 沙箱完全权限与删除都收进该条目单独的「配置」界面（点行尾「配置」进入，点「返回列表」退出）。
 * 新建条目的「工具提示词」由 host 的 POST /defaults 预填成默认模板（面板不再各写一份模板），
 * 并可随时「重置为默认」。
 * 读写走 host 插件自己的 API
 * （/dsh-shell-policy/api/status、/shells、/detect、/defaults）——settings 的 client 端 RPC 有
 * apiproxy allowlist 限制，本插件 namespace 不在其中，故不依赖 settingsScope；
 * host 端仍经 settings 服务持久化。监听 settings/document-updated 事件实时刷新。
 *
 * 模块划分：types（类型/常量）、styles（内联样式）、icons、validation（保存前预校验）、
 * entry-row / entry-detail（展示组件）、card（容器组件）。
 *
 * 构建：npm run build:client（tsdown，产物 lib/client.js，ModuleLoader.load 注册）。
 * 必坑（2026-08 实测）：① apply 用 ctx.slots 必须 export const inject
 * = ['slots']（服务注入声明）；② register 必须带 name 字段（= slot 名）；
 * ③ rc.7 起该 slot 为 kind:'keyed'，注册必须带 key。
 */
import { ShellPolicyCard } from './card.js'
import type { ClientContext } from './types.js'

export const inject = ['slots', 'remote']

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote
  // DSH 0.2.0：bundle 自己的配置页注册到 plugins.bundle.config（key = 包名），
  // 渲染在插件管理页的 bundle 详情页内（描述与行列表之间）。
  ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register({
      name: 'plugins.bundle.config',
      key: 'dsh-windows-shell-policy',
      label: () => 'Shell 工具',
      inject: () => ({ remote }),
    } as any, ShellPolicyCard as any),
  ), 'dsh-windows-shell-policy: bundle config page')

  // 0.1.x 兼容：旧版「设置 → 插件 → 插件配置」的卡片槽位（0.2.0 已移除该槽位，
  // slots.inject 对未声明的槽位不会执行回调，因此无副作用）。
  ctx.effect(() => ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register({
      name: 'settings.plugin.item',
      id: 'shell-policy',
      key: 'shell-policy',
      order: 5,
      label: () => 'Shell 工具',
      inject: () => ({ remote }),
    } as any, ShellPolicyCard as any),
  ), 'dsh-windows-shell-policy: legacy settings card')
}
