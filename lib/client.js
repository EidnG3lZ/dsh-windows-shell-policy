window.__ModuleLoader__.load({
	id: "dsh-windows-shell-policy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.ts
		/**
		* dsh-windows-shell-policy — client 配置页（plugins.bundle.config）。
		*
		* 在插件管理页的本插件详情页注册「Shell 工具」配置面板：可增删的 shell 条目列表。
		* 列表里的条目是**折叠态**——只显示名称（只读）、启用开关与「默认」单选，避免长条目
		* 撑满屏幕；名称、可执行文件路径（可探测）、工具提示词、沙箱完全权限与删除都收进
		* 该条目单独的「配置」界面（点行尾「配置」进入，点「返回列表」退出）。
		* 读写走 host 插件自己的 API
		* （/dsh-shell-policy/api/status、/shells、/detect）——settings 的 client 端 RPC 有
		* apiproxy allowlist 限制，本插件 namespace 不在其中，故不依赖 settingsScope；
		* host 端仍经 settings 服务持久化。监听 settings/document-updated 事件实时刷新。
		*
		* 构建：npm run build:client（tsdown，产物 lib/client.js，ModuleLoader.load 注册）。
		* 必坑（2026-08 实测）：① apply 用 ctx.slots 必须 export const inject
		* = ['slots']（服务注入声明）；② register 必须带 name 字段（= slot 名）；
		* ③ rc.7 起该 slot 为 kind:'keyed'，注册必须带 key。
		*/
		const inject = ["slots", "remote"];
		/** 条目数量上限（与 host 保持一致）。 */
		const MAX_ENTRIES = 16;
		const cardStyle = {
			listStyle: "none",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "var(--dsw-alias-border-l2)",
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
			borderWidth: "0",
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
			display: "flex"
		};
		const chevronOpenStyle = { transform: "rotate(180deg)" };
		/** 官方 IconChevronDownOutline14 的等价 SVG（fill=currentColor 继承 chevron 颜色）。 */
		function ChevronIcon() {
			return (0, react.createElement)("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 14 14",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg"
			}, (0, react.createElement)("path", {
				d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
				fill: "currentColor"
			}));
		}
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
			borderTopWidth: "1px",
			borderTopStyle: "solid",
			borderTopColor: "var(--dsw-alias-border-l2)",
			margin: "0 16px",
			paddingBottom: "8px"
		};
		/** 0.2.0 bundle 配置页容器（插件详情页内，无折叠头）。 */
		const pageStyle = {
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "var(--dsw-alias-border-l2)",
			borderRadius: "12px",
			background: "var(--dsw-alias-bg-layer-3)",
			padding: "4px 16px 8px"
		};
		const statusStyle = {
			margin: "12px 0 4px",
			fontSize: "12px",
			lineHeight: "1.5",
			color: "var(--dsw-alias-label-tertiary)",
			wordBreak: "break-word"
		};
		const errorStatusStyle = {
			margin: "12px 0 4px",
			fontSize: "12px",
			lineHeight: "1.5",
			color: "var(--dsw-alias-label-error)",
			wordBreak: "break-word"
		};
		/** 单个条目卡片。 */
		const entryStyle = {
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "var(--dsw-alias-border-l2)",
			borderRadius: "10px",
			background: "var(--dsw-alias-bg-layer-2)",
			padding: "10px 12px",
			margin: "10px 0",
			display: "flex",
			flexDirection: "column",
			gap: "8px"
		};
		const switchLabelStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "6px",
			fontSize: "13px",
			color: "var(--dsw-alias-label-primary)",
			cursor: "pointer",
			whiteSpace: "nowrap"
		};
		const fieldRowStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "4px"
		};
		const fieldLabelStyle = {
			fontSize: "12px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const fieldHintStyle = {
			fontSize: "12px",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const inputStyle = {
			appearance: "none",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "var(--dsw-alias-border-l2)",
			borderRadius: "8px",
			padding: "6px 10px",
			font: "inherit",
			fontSize: "13px",
			color: "var(--dsw-alias-label-primary)",
			background: "var(--dsw-alias-bg-layer-3)",
			width: "100%",
			boxSizing: "border-box"
		};
		const textareaStyle = {
			...inputStyle,
			resize: "vertical",
			minHeight: "56px",
			fontFamily: "inherit",
			lineHeight: "1.5"
		};
		const footerStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "flex-end",
			gap: "8px",
			padding: "12px 0 4px",
			borderTopWidth: "1px",
			borderTopStyle: "solid",
			borderTopColor: "var(--dsw-alias-border-l2)"
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
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "transparent",
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
		const ghostStyle = {
			...buttonBase,
			borderColor: "var(--dsw-alias-border-l2)",
			background: "none",
			color: "var(--dsw-alias-label-secondary)",
			padding: "4px 10px",
			fontSize: "12px"
		};
		const addStyle = {
			...buttonBase,
			borderColor: "var(--dsw-alias-border-l2)",
			background: "none",
			color: "var(--dsw-alias-label-primary)"
		};
		const disabledStyle = {
			opacity: "0.4",
			cursor: "default"
		};
		/** 折叠态条目行：只放名称、启用与默认，其余设置进「配置」界面。 */
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "10px",
			flexWrap: "wrap",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "var(--dsw-alias-border-l2)",
			borderRadius: "10px",
			background: "var(--dsw-alias-bg-layer-2)",
			padding: "8px 12px",
			margin: "8px 0"
		};
		/** 行内条目名（只读展示）。 */
		const rowNameStyle = {
			flex: "1",
			minWidth: "0",
			fontSize: "14px",
			fontWeight: 500,
			lineHeight: "1.4",
			color: "var(--dsw-alias-label-primary)",
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		/** 名称由路径推导时的弱化样式。 */
		const rowNameDerivedStyle = {
			...rowNameStyle,
			fontWeight: 400,
			color: "var(--dsw-alias-label-tertiary)"
		};
		/** 折叠行上的问题标记（悬停显示原因，不占额外行高）。 */
		const warnBadgeStyle = {
			flex: "none",
			display: "inline-block",
			width: "16px",
			height: "16px",
			borderRadius: "50%",
			textAlign: "center",
			fontSize: "11px",
			lineHeight: "14px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-error)",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "var(--dsw-alias-label-error)",
			cursor: "help"
		};
		/** 「配置」界面头部：返回 / 标题 / 删除。 */
		const detailHeadStyle = {
			display: "flex",
			alignItems: "center",
			gap: "8px"
		};
		const detailTitleStyle = {
			flex: "1",
			minWidth: "0",
			fontSize: "14px",
			fontWeight: 600,
			lineHeight: "1.4",
			color: "var(--dsw-alias-label-primary)",
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		/** 路径输入 + 探测按钮的一行。 */
		const inlineRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "8px"
		};
		const pathInputStyle = {
			...inputStyle,
			flex: "1",
			width: "auto",
			minWidth: "0"
		};
		/** 长文案的开关标签（允许换行，避免撑宽）。 */
		const wrapLabelStyle = {
			...switchLabelStyle,
			whiteSpace: "normal"
		};
		/** 与 host 一致的默认工具名推导（pwsh 让位给内置工具，改名为 powershell）。 */
		function deriveName(path) {
			const cleaned = path.replace(/^.*[\\/]/, "").replace(/\.(exe|cmd|bat|sh)$/i, "").trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "").slice(0, 64);
			if (cleaned === "pwsh") return "powershell";
			return cleaned;
		}
		/** 条目的生效工具名（空名称时由路径推导，与 host 行为一致）。 */
		function effectiveName(entry) {
			const explicit = entry.name.trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "");
			if (explicit.length > 0) return explicit;
			const derived = deriveName(entry.path.trim());
			return derived.length > 0 ? derived : "shell";
		}
		/** 条目的保存前问题（undefined 表示可保存）。 */
		function entryProblem(entry, all) {
			if (!entry.enabled) return void 0;
			const name = effectiveName(entry);
			if (name === "run_code") return "工具名 run_code 是 DSH 保留名";
			if (all.some((other) => other !== entry && other.enabled && effectiveName(other) === name)) return `工具名 "${name}" 与其它启用条目重复`;
			const path = entry.path.trim();
			if (path.length > 0 && !/^[A-Za-z]:[\\/]|^\//.test(path)) return "路径必须是绝对路径";
		}
		/** 从 /status 视图取面板草稿（丢弃运行时字段）。 */
		function toDraft(entry) {
			return {
				id: entry.id,
				name: entry.name,
				enabled: entry.enabled,
				path: entry.path,
				description: entry.description,
				fullAccess: entry.fullAccess,
				primary: entry.primary
			};
		}
		/**
		* 配置组件：三种视图。
		* - `page`（DSH 0.2.0 的 plugins.bundle.config）：直接渲染配置面板（插件详情页内，无折叠）。
		* - `summary`：一行状态摘要。
		* - 未指定（0.1.x 的 settings.plugin.item）：折叠卡片。
		*/
		function ShellPolicyCard(props) {
			const { view, remote } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(null);
			const [editingId, setEditingId] = (0, react.useState)(null);
			const load = () => {
				fetch("/dsh-shell-policy/api/status").then((r) => r.json()).then((s) => setStatus(s)).catch(() => setStatus(null));
			};
			(0, react.useEffect)(() => {
				load();
				return remote.$on("settings/document-updated", () => {
					load();
				});
			}, [remote]);
			const saved = (status?.entries ?? []).map(toDraft);
			const entries = draft ?? saved;
			const dirty = draft !== null;
			const problems = entries.map((entry) => entryProblem(entry, entries));
			const hasProblem = problems.some((problem) => problem !== void 0);
			const blocked = !dirty || saving || hasProblem;
			const update = (index, patch) => {
				setDraft(entries.map((entry, i) => i === index ? {
					...entry,
					...patch
				} : entry));
			};
			const setPrimary = (index) => {
				setDraft(entries.map((entry, i) => ({
					...entry,
					primary: i === index
				})));
			};
			const addEntry = () => {
				if (entries.length >= MAX_ENTRIES) return;
				const entry = {
					id: `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
					name: "",
					enabled: true,
					path: "",
					description: "",
					fullAccess: false,
					primary: entries.length === 0
				};
				setDraft([...entries, entry]);
				setEditingId(entry.id);
				probe(entries.length, entry);
			};
			const removeEntry = (index) => {
				setDraft(entries.filter((_, i) => i !== index));
				setEditingId(null);
			};
			const probe = async (index, entry) => {
				try {
					const result = await (await fetch("/dsh-shell-policy/api/detect", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							name: entry.name,
							path: entry.path
						})
					})).json();
					const found = result.ok === true && typeof result.path === "string" && result.path.length > 0 ? result.path : "";
					setDraft((current) => (current ?? entries).map((item, i) => {
						if (i !== index) return item;
						return found.length > 0 ? {
							...item,
							path: found,
							name: item.name.length > 0 ? item.name : deriveName(found),
							notice: void 0
						} : {
							...item,
							notice: "未探测到可执行文件，请手动填写路径"
						};
					}));
				} catch {
					setDraft((current) => (current ?? entries).map((item, i) => i === index ? {
						...item,
						notice: "探测请求失败"
					} : item));
				}
			};
			const save = () => {
				if (blocked) return;
				setSaving(true);
				setFailed(null);
				fetch("/dsh-shell-policy/api/shells", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ shells: entries.map((entry) => ({
						id: entry.id,
						name: entry.name,
						enabled: entry.enabled,
						path: entry.path,
						description: entry.description,
						fullAccess: entry.fullAccess,
						primary: entry.primary
					})) })
				}).then((r) => r.json()).then((result) => {
					if (result.ok !== true) throw new Error(String(result.error ?? "保存失败"));
					setDraft(null);
					setEditingId(null);
					load();
				}).catch((error) => setFailed(String(error))).finally(() => setSaving(false));
			};
			const discard = () => {
				setDraft(null);
				setEditingId(null);
				setFailed(null);
			};
			const registered = status?.registered ?? [];
			const statusLine = status === null ? "状态加载中..." : !status.supported ? `当前平台 ${status.platform} 不受支持：DSH 默认 bash 工具已可用，本插件仅 Windows 生效` : registered.length === 0 ? "当前没有注册任何 shell 工具（DSH 内置 shell 工具仍然可用）" : `已注册：${registered.join("、")}`;
			const errorLine = status?.registerError !== void 0 && status.registerError.length > 0 ? status.registerError : null;
			/** 列表行显示的条目名：工具名留空时由可执行文件名推导。 */
			const displayName = (entry) => {
				const explicit = entry.name.trim();
				if (explicit.length > 0) return explicit;
				const derived = deriveName(entry.path.trim());
				return derived.length > 0 ? derived : "未命名";
			};
			/** 折叠行上的问题提示（悬停可见）：客户端校验优先，其次是运行时状态。 */
			const entryWarning = (entry, index) => {
				const problem = problems[index];
				if (problem !== void 0) return problem;
				if (dirty || !entry.enabled) return void 0;
				const runtime = status?.entries.find((item) => item.id === entry.id);
				if (runtime === void 0) return void 0;
				if (runtime.error !== void 0) return runtime.error;
				if (!runtime.registered) return "运行时未生效：未找到可执行文件";
			};
			/** 折叠态条目行：只显示名称、启用、默认，以及进入「配置」界面的入口。 */
			const entryRow = (entry, index) => {
				const warning = entryWarning(entry, index);
				const explicitName = entry.name.trim().length > 0;
				return (0, react.createElement)("div", {
					key: entry.id,
					style: rowStyle
				}, (0, react.createElement)("span", {
					key: "name",
					style: explicitName ? rowNameStyle : rowNameDerivedStyle,
					title: explicitName ? entry.name : "名称由可执行文件路径推导，点「配置」可修改"
				}, displayName(entry)), warning !== void 0 ? (0, react.createElement)("span", {
					key: "warning",
					style: warnBadgeStyle,
					title: warning
				}, "!") : null, (0, react.createElement)("label", {
					key: "enabled",
					style: switchLabelStyle
				}, (0, react.createElement)("input", {
					type: "checkbox",
					checked: entry.enabled,
					disabled: saving,
					onChange: (event) => update(index, { enabled: event.target.checked })
				}), (0, react.createElement)("span", null, "启用")), (0, react.createElement)("label", {
					key: "primary",
					style: switchLabelStyle,
					title: "多个 shell 启用时，引导提示词优先推荐它"
				}, (0, react.createElement)("input", {
					type: "radio",
					name: "shell-policy-primary",
					checked: entry.primary,
					disabled: saving || !entry.enabled,
					onChange: () => setPrimary(index)
				}), (0, react.createElement)("span", null, "默认")), (0, react.createElement)("button", {
					key: "config",
					type: "button",
					style: ghostStyle,
					disabled: saving,
					title: "工具名、可执行文件路径、工具提示词、沙箱完全权限与删除",
					onClick: () => setEditingId(entry.id)
				}, "配置"));
			};
			/** 单个条目单独的配置界面：名称、路径（含探测）、提示词、沙箱权限与删除。 */
			const entryDetail = (entry, index) => {
				const runtime = status?.entries.find((item) => item.id === entry.id);
				const notice = entry.notice !== void 0 ? (0, react.createElement)("div", {
					key: "notice",
					style: fieldHintStyle
				}, entry.notice) : null;
				const problem = problems[index] !== void 0 ? (0, react.createElement)("div", {
					key: "problem",
					style: {
						...fieldHintStyle,
						color: "var(--dsw-alias-label-error)"
					}
				}, problems[index]) : null;
				const runtimeLine = !dirty && runtime !== void 0 && entry.enabled ? (0, react.createElement)("div", {
					key: "runtime",
					style: runtime.error !== void 0 ? {
						...fieldHintStyle,
						color: "var(--dsw-alias-label-error)"
					} : fieldHintStyle
				}, runtime.error !== void 0 ? `运行时未生效：${runtime.error}` : runtime.registered ? `运行时已生效：${runtime.resolvedPath}` : "运行时未生效：未找到可执行文件") : null;
				return (0, react.createElement)("div", {
					key: entry.id,
					style: entryStyle
				}, (0, react.createElement)("div", {
					key: "head",
					style: detailHeadStyle
				}, (0, react.createElement)("button", {
					key: "back",
					type: "button",
					style: ghostStyle,
					disabled: saving,
					onClick: () => setEditingId(null)
				}, "‹ 返回列表"), (0, react.createElement)("span", {
					key: "title",
					style: detailTitleStyle,
					title: displayName(entry)
				}, `配置：${displayName(entry)}`), (0, react.createElement)("span", {
					key: "spacer",
					style: { flex: "1" }
				}), (0, react.createElement)("button", {
					key: "remove",
					type: "button",
					style: ghostStyle,
					disabled: saving || entries.length <= 1,
					onClick: () => removeEntry(index)
				}, "删除")), (0, react.createElement)("div", {
					key: "name",
					style: fieldRowStyle
				}, (0, react.createElement)("span", { style: fieldLabelStyle }, "工具名"), (0, react.createElement)("input", {
					type: "text",
					style: inputStyle,
					value: entry.name,
					placeholder: "留空按可执行文件名推导（pwsh 会改名为 powershell）",
					disabled: saving,
					onChange: (event) => update(index, { name: event.target.value })
				}), (0, react.createElement)("span", { style: fieldHintStyle }, `模型看到的工具名：${effectiveName(entry)}`)), (0, react.createElement)("div", {
					key: "path",
					style: fieldRowStyle
				}, (0, react.createElement)("span", { style: fieldLabelStyle }, "可执行文件路径"), (0, react.createElement)("div", { style: inlineRowStyle }, (0, react.createElement)("input", {
					type: "text",
					style: pathInputStyle,
					value: entry.path,
					placeholder: "留空自动探测（Git / MSYS2 / Cygwin / PowerShell / PATH）",
					disabled: saving,
					onChange: (event) => update(index, { path: event.target.value })
				}), (0, react.createElement)("button", {
					type: "button",
					style: ghostStyle,
					disabled: saving,
					onClick: () => {
						probe(index, entry);
					}
				}, "探测"))), (0, react.createElement)("div", {
					key: "description",
					style: fieldRowStyle
				}, (0, react.createElement)("span", { style: fieldLabelStyle }, "工具提示词"), (0, react.createElement)("textarea", {
					style: textareaStyle,
					value: entry.description,
					rows: 3,
					placeholder: "留空使用默认说明（含 fresh shell、workdir、exit code 约定）",
					disabled: saving,
					onChange: (event) => update(index, { description: event.target.value })
				})), (0, react.createElement)("label", {
					key: "fullAccess",
					style: wrapLabelStyle
				}, (0, react.createElement)("input", {
					type: "checkbox",
					checked: entry.fullAccess,
					disabled: saving,
					onChange: (event) => update(index, { fullAccess: event.target.checked })
				}), (0, react.createElement)("span", null, "沙箱完全权限（跳过文件沙箱，执行不再逐次审批）")), runtimeLine, notice, problem);
			};
			const editingEntry = editingId === null ? null : entries.find((item) => item.id === editingId) ?? null;
			const editingIndex = editingEntry === null ? -1 : entries.indexOf(editingEntry);
			const controls = [
				errorLine !== null ? (0, react.createElement)("div", {
					key: "status",
					style: errorStatusStyle
				}, errorLine) : (0, react.createElement)("div", {
					key: "status",
					style: statusStyle
				}, statusLine, status?.migrated === true ? (0, react.createElement)("span", null, "（当前条目由旧配置迁移，保存后写入配置）") : null),
				...editingEntry !== null && editingIndex >= 0 ? [entryDetail(editingEntry, editingIndex)] : entries.map(entryRow),
				entries.length === 0 ? (0, react.createElement)("div", {
					key: "empty",
					style: statusStyle
				}, "还没有条目。点击「添加 shell」新增一个（例如 git-bash 或 PowerShell）。") : null,
				(0, react.createElement)("div", {
					key: "footer",
					style: footerStyle
				}, failed !== null ? (0, react.createElement)("p", {
					style: failedStyle,
					role: "status"
				}, `保存失败：${failed}`) : null, (0, react.createElement)("span", {
					key: "spacer",
					style: { flex: "1" }
				}), (0, react.createElement)("button", {
					key: "add",
					type: "button",
					style: {
						...addStyle,
						...saving || entries.length >= MAX_ENTRIES ? disabledStyle : {}
					},
					disabled: saving || entries.length >= MAX_ENTRIES,
					onClick: addEntry
				}, "添加 shell"), (0, react.createElement)("button", {
					key: "discard",
					type: "button",
					style: {
						...discardStyle,
						...!dirty || saving ? disabledStyle : {}
					},
					disabled: !dirty || saving,
					onClick: discard
				}, "放弃"), (0, react.createElement)("button", {
					key: "save",
					type: "button",
					style: {
						...saveStyle,
						...blocked ? disabledStyle : {}
					},
					disabled: blocked,
					onClick: save
				}, saving ? "保存中..." : "保存"))
			];
			if (view === "summary") return (0, react.createElement)("span", null, errorLine ?? statusLine);
			if (view === "page") return (0, react.createElement)("div", { style: pageStyle }, ...controls);
			return (0, react.createElement)("li", { style: {
				...cardStyle,
				...open ? cardOpenStyle : {}
			} }, (0, react.createElement)("button", {
				type: "button",
				style: headerStyle,
				"aria-expanded": open,
				"aria-label": `${open ? "收起设置" : "展开设置"}: Shell 工具`,
				onClick: () => setOpen(!open)
			}, (0, react.createElement)("span", { style: headTextStyle }, (0, react.createElement)("span", { style: nameStyle }, "Shell 工具"), (0, react.createElement)("span", { style: descriptionStyle }, "配置 agent 可用的 shell 工具：启用/停用、路径、工具提示词与沙箱权限。切换后下一次请求生效。")), dirty ? (0, react.createElement)("span", { style: pendingStyle }, "未保存") : null, (0, react.createElement)("span", { style: {
				...chevronStyle,
				...open ? chevronOpenStyle : {}
			} }, (0, react.createElement)(ChevronIcon))), open ? (0, react.createElement)("div", { style: bodyStyle }, ...controls) : null);
		}
		function apply(ctx) {
			const remote = ctx.remote;
			ctx.effect(() => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-windows-shell-policy",
				label: () => "Shell 工具",
				inject: () => ({ remote })
			}, ShellPolicyCard)), "dsh-windows-shell-policy: bundle config page");
			ctx.effect(() => ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: "shell-policy",
				key: "shell-policy",
				order: 5,
				label: () => "Shell 工具",
				inject: () => ({ remote })
			}, ShellPolicyCard)), "dsh-windows-shell-policy: legacy settings card");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map