window.__ModuleLoader__.load({
	id: "dsh-windows-shell-policy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.ts
		/**
		* dsh-windows-shell-policy — client 配置卡片（settings.plugin.item slot）。
		*
		* 在「设置 - 插件 - 插件配置」面板注册「默认 Shell」卡片，折叠式
		* （与官方「终端 / Agent 循环 / 网页搜索」卡片同构）：头部按钮命名插件
		* 并描述其配置，点击展开控件；折叠时保留 staged 编辑并在头部标记
		* 「未保存」。读写走 host 插件自己的 API（/dsh-shell-policy/api/status
		* 与 /preferred）——settings 的 client 端 RPC 有 apiproxy allowlist 限制，
		* 本插件 namespace 不在其中，故不依赖 settingsScope；host 端仍经
		* settings 服务持久化 preferred。
		*
		* 构建：npm run build:client（tsdown，产物 lib/client.js，ModuleLoader.load 注册）。
		* 必坑（2026-08 实测）：① apply 用 ctx.slots 必须 export const inject
		* = ['slots']（服务注入声明）；② register 必须带 name 字段（= slot 名）。
		*/
		const inject = ["slots"];
		const cardStyle = {
			listStyle: "none",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: "12px",
			background: "var(--dsw-alias-bg-layer-3)",
			transition: "border-color .16s, background .16s"
		};
		const cardOpenStyle = {
			background: "var(--dsw-alias-bg-layer-2)",
			borderColor: "var(--dsw-alias-label-dimmed)"
		};
		const headerStyle = {
			width: "100%",
			appearance: "none",
			border: "0",
			background: "none",
			font: "inherit",
			color: "inherit",
			textAlign: "left",
			cursor: "pointer",
			display: "flex",
			alignItems: "center",
			gap: "12px",
			padding: "14px 16px",
			borderRadius: "12px"
		};
		const headTextStyle = {
			flex: "1",
			minWidth: "0",
			display: "flex",
			flexDirection: "column",
			gap: "4px"
		};
		const nameStyle = {
			fontSize: "15px",
			fontWeight: 600,
			lineHeight: "1.4",
			color: "var(--dsw-alias-label-primary)"
		};
		const descriptionStyle = {
			fontSize: "13px",
			lineHeight: "1.5",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const chevronStyle = {
			flex: "none",
			color: "var(--dsw-alias-label-tertiary)",
			transition: "transform .16s",
			fontSize: "12px"
		};
		const chevronOpenStyle = { transform: "rotate(180deg)" };
		const pendingStyle = {
			flex: "none",
			borderRadius: "999px",
			padding: "1px 8px",
			fontSize: "11px",
			lineHeight: "17px",
			fontWeight: 500,
			whiteSpace: "nowrap",
			background: "var(--dsw-alias-bg-module-platform)",
			color: "var(--dsw-alias-label-secondary)"
		};
		const bodyStyle = {
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			margin: "0 16px",
			paddingBottom: "8px"
		};
		const statusStyle = {
			margin: "12px 0 4px",
			fontSize: "12px",
			lineHeight: "1.5",
			color: "var(--dsw-alias-label-tertiary)",
			fontFamily: "monospace",
			wordBreak: "break-all"
		};
		const optionStyle = {
			display: "flex",
			alignItems: "baseline",
			gap: "8px",
			padding: "4px 0",
			cursor: "pointer",
			fontSize: "13px",
			color: "var(--dsw-alias-label-primary)"
		};
		const optionLabelStyle = {
			fontWeight: 600,
			minWidth: "48px"
		};
		const optionHintStyle = {
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: "12px"
		};
		const footerStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "flex-end",
			gap: "8px",
			padding: "12px 0 4px",
			borderTop: "1px solid var(--dsw-alias-border-l2)"
		};
		const failedStyle = {
			flex: "1",
			minWidth: "0",
			margin: "0",
			fontSize: "12px",
			lineHeight: "1.5",
			color: "var(--dsw-alias-label-error)"
		};
		const buttonBase = {
			appearance: "none",
			border: "1px solid transparent",
			borderRadius: "8px",
			padding: "5px 14px",
			font: "inherit",
			fontSize: "13px",
			lineHeight: "1.5",
			cursor: "pointer"
		};
		const discardStyle = {
			...buttonBase,
			borderColor: "var(--dsw-alias-border-l2)",
			background: "none",
			color: "var(--dsw-alias-label-secondary)"
		};
		const saveStyle = {
			...buttonBase,
			background: "var(--dsw-alias-label-primary)",
			color: "var(--dsw-alias-bg-layer-3)"
		};
		const disabledStyle = {
			opacity: "0.4",
			cursor: "default"
		};
		/** 卡片组件：折叠头部 + 展开控件（状态行 + 选择器 + staged 保存）。 */
		function ShellPolicyCard() {
			const [open, setOpen] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			const load = () => {
				fetch("/dsh-shell-policy/api/status").then((r) => r.json()).then((s) => setStatus(s)).catch(() => setStatus(null));
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			const current = status?.preferred ?? "auto";
			const staged = draft ?? current;
			const dirty = draft !== null && draft !== current;
			const blocked = !dirty || saving;
			const save = () => {
				if (draft === null || draft === current || saving) return;
				setSaving(true);
				setFailed(false);
				fetch("/dsh-shell-policy/api/preferred", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ preferred: draft })
				}).then((r) => r.json()).then((result) => {
					if (result.ok === true) {
						setDraft(null);
						load();
					} else setFailed(true);
				}).catch(() => setFailed(true)).finally(() => setSaving(false));
			};
			const discard = () => {
				setDraft(null);
				setFailed(false);
			};
			const options = [
				{
					value: "auto",
					label: "自动",
					hint: "探测到 git-bash 则用 bash，否则 pwsh"
				},
				{
					value: "bash",
					label: "bash",
					hint: "强制 git-bash"
				},
				{
					value: "pwsh",
					label: "pwsh",
					hint: "强制 PowerShell"
				}
			];
			const statusLine = status === null ? "状态加载中..." : status.effective === "bash" ? `当前生效：bash（${status.bashPath}）` : status.bashFound ? "当前生效：pwsh（bash 可用但未启用）" : "当前生效：pwsh（未探测到 bash）";
			return (0, react.createElement)("li", { style: {
				...cardStyle,
				...open ? cardOpenStyle : {}
			} }, (0, react.createElement)("button", {
				type: "button",
				style: headerStyle,
				"aria-expanded": open,
				"aria-label": `${open ? "收起设置" : "展开设置"}: 默认 Shell`,
				onClick: () => setOpen(!open)
			}, (0, react.createElement)("span", { style: headTextStyle }, (0, react.createElement)("span", { style: nameStyle }, "默认 Shell"), (0, react.createElement)("span", { style: descriptionStyle }, "选择 agent 使用的 shell 工具。切换后新会话生效。")), dirty ? (0, react.createElement)("span", { style: pendingStyle }, "未保存") : null, (0, react.createElement)("span", { style: {
				...chevronStyle,
				...open ? chevronOpenStyle : {}
			} }, "▾")), open ? (0, react.createElement)("div", { style: bodyStyle }, (0, react.createElement)("div", { style: statusStyle }, statusLine), ...options.map((opt) => (0, react.createElement)("label", {
				key: opt.value,
				style: optionStyle
			}, (0, react.createElement)("input", {
				type: "radio",
				name: "shell-policy-preferred",
				checked: staged === opt.value,
				disabled: saving,
				onChange: () => setDraft(opt.value)
			}), (0, react.createElement)("span", { style: optionLabelStyle }, opt.label), (0, react.createElement)("span", { style: optionHintStyle }, opt.hint))), (0, react.createElement)("div", { style: footerStyle }, failed ? (0, react.createElement)("p", {
				style: failedStyle,
				role: "status"
			}, "保存失败，请重试") : null, (0, react.createElement)("button", {
				type: "button",
				style: {
					...discardStyle,
					...!dirty || saving ? disabledStyle : {}
				},
				disabled: !dirty || saving,
				onClick: discard
			}, "放弃"), (0, react.createElement)("button", {
				type: "button",
				style: {
					...saveStyle,
					...blocked ? disabledStyle : {}
				},
				disabled: blocked,
				onClick: save
			}, saving ? "保存中..." : "保存"))) : null);
		}
		function apply(ctx) {
			ctx.effect(() => ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: "shell-policy",
				order: 5,
				label: () => "默认 Shell"
			}, ShellPolicyCard)), "dsh-windows-shell-policy: settings card");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map