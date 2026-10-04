# dsh-windows-shell-policy — Windows Multi-Shell Policy Plugin

[中文](README.md) | English

![Shell tools config panel](docs/screenshots/shell-policy-card.png)

[![npm version](https://img.shields.io/npm/v/dsh-windows-shell-policy)](https://www.npmjs.com/package/dsh-windows-shell-policy)
[![npm downloads](https://img.shields.io/npm/dw/dsh-windows-shell-policy)](https://www.npmjs.com/package/dsh-windows-shell-policy)
[![GitHub release](https://img.shields.io/github/v/release/LAN-TINA-WS/dsh-windows-shell-policy)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest)
[![GitHub downloads](https://img.shields.io/github/downloads/LAN-TINA-WS/dsh-windows-shell-policy/total)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases)
[![GitHub stars](https://img.shields.io/github/stars/LAN-TINA-WS/dsh-windows-shell-policy)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy)
[![license](https://img.shields.io/github/license/LAN-TINA-WS/dsh-windows-shell-policy)](LICENSE)

## dsh-windows-shell-policy

A **Windows multi-shell policy plugin** for DeepSeek Harness. DSH ships only PowerShell on Windows by default (the official `pwsh` tool), while bash dominates LLM training corpora, so agents make significantly more errors running POSIX commands. This plugin turns "which shell" into a list of **add/remove shell entries**: each entry can be enabled independently, gets an explicit or auto-probed executable path, carries a custom model-facing tool description, and can opt into **full sandbox access** — so git-bash and other compatibility-layer shells stop asking for approval on every command. Every enabled, usable entry registers as its own shell tool, and multiple shells can be enabled at once.

> [Latest Release](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest) · [dsh-plugin ecosystem](https://github.com/topics/dsh-plugin) · [Feedback](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/issues/1)

## Showcase

![shell terminal card](docs/screenshots/bash-terminal-card.png)

| Capability | Description |
| --- | --- |
| Multiple shell entries | Add/remove entries freely (up to 16); every enabled, usable entry registers as its own shell tool, and several can run at once |
| Auto probing | With an empty path, probe by family: Git for Windows (system / user / `usr\bin`), MSYS2, Cygwin, PowerShell 7, Windows PowerShell 5.1, PATH; each entry also has a Detect button |
| Tool prompt | Per-entry model-facing tool description; empty falls back to the default template (fresh shell, `workdir`, exit-code conventions) |
| Full sandbox access | Per-entry switch: skips the file-sandbox `confine` (equivalent to `danger-full-access`), so commands never prompt per call, and the tool no longer advertises `sandbox_permissions`/`justification` |
| Default entry | A radio marks the preferred shell when several are enabled; the guidance prompt recommends it |
| Prompt trimming | As soon as any entry registers, DSH's built-in `bash`/`pwsh` are hidden in `system-prompt/assemble`; with every entry disabled the stock DSH tool surface returns |
| Per-entry errors | A missing executable, a name taken by a built-in tool or another plugin, duplicate names among enabled entries, or a failed registration only affect that entry — the panel shows why and the rest keep working |
| Terminal card | Matches the official shell tools: click a call in the conversation to inspect command, cwd, output and exit-status marker |
| Persistence | Entries are stored in this plugin's profile entry config (`shells` array) and survive restarts; legacy `preferred`/`bashPath` are migrated to equivalent entries on first load |
| Clean uninstall | `dsh plugin --profile web remove` or `dev_uninject_plugin` restores everything |

## Quick Install

**GitHub direct install (recommended, fastest in CN, no npm wait)**:

```sh
dsh plugin --profile web add github:LAN-TINA-WS/dsh-windows-shell-policy
# restart dsh web, open the Plugins page → this plugin's detail page → the "Shell tools" panel
```

**npm install (one command)**:

```sh
dsh plugin --profile web add dsh-windows-shell-policy
```

**Release ZIP install**:

1. Download `dsh-windows-shell-policy-v*.zip` from [Releases](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest) and unzip
2. `dsh plugin --profile web add link:<unzipped dir>`
3. Restart `dsh web`, open the Plugins page → this plugin's detail page → the "Shell tools" panel

**Injector install (no restart, dev environments)**:

```sh
DSH_CHECKOUT=<checkout> bash scripts/build.sh   # produces lib/index.js + lib/client.js
dev_inject_plugin <this dir>                   # host+UI take effect immediately
```

## Configuration Guide

Open this plugin's detail page on the Plugins page; the "Shell tools" panel is the entry list:

| Control | Behavior |
| --- | --- |
| Enabled | Switch; only enabled entries register as shell tools |
| Tool name | The model-facing tool name. Empty derives it from the executable name (`pwsh.exe` becomes `powershell` because DSH's built-in tool already owns `pwsh`); it must be unique among enabled entries, and `run_code` is reserved |
| Default | Radio; the guidance prompt recommends it when several shells are enabled |
| Executable path | Empty auto-probes; the Detect button fills the first matching candidate for the current name/family |
| Tool prompt | Model-facing tool description; empty uses the default template |
| Full sandbox access | Skips the file-sandbox `confine` (equivalent to `danger-full-access`); commands never prompt per call |
| Add shell / Remove | Add or remove entries (max 16, at least one kept) |
| Save / Discard | Staged editing; client-side validation before saving (duplicates, `run_code`, absolute path) and one whole-list write |

- Entries take effect on the next request after saving; the guidance text is snapshotted per session, so only a new session sees new text.
- Configuration lives in this plugin's profile entry config (the `shells` array) and survives restarts; legacy `preferred` (auto/bash/pwsh) and `bashPath` are mapped to equivalent entries while `shells` is empty and persisted on first save.
- Entries also skip `confine` when the file policy is already `danger-full-access`; this plugin is Windows-only — on Linux/macOS it registers no tools and trims nothing.

## Feedback

Issues, feature requests, usage experience: file at [issue #1 (feedback welcome)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/issues/1).

## Contributors

| Contributor | Contribution |
| --- | --- |
| [LAN-TINA-WS](https://github.com/LAN-TINA-WS) | Author and maintainer |

## License

This project is licensed under the [MIT License](LICENSE).

## Developer Docs

Craft notes (authoring conventions, DSH capability lists, composition promotion log) live in [docs/](docs/):

| Doc | Content |
| --- | --- |
| [conventions.md](docs/conventions.md) | Plugin authoring conventions and failure quick-reference |
| [capabilities-host.md](docs/capabilities-host.md) | DSH Host services/events used by this plugin |
| [capabilities-client.md](docs/capabilities-client.md) | DSH Client slots/services used by this plugin |
| [roadmap-composition.md](docs/roadmap-composition.md) | Composition promotion log |

Repo layout: `src/` (host + client sources), `tests/` (fake-ctx integration test), `scripts/` (build), `docs/` (docs and screenshots), `cordis.patch.yml` (bundle patch assembly).
