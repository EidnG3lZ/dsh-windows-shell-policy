# dsh-windows-shell-policy — Windows Default Shell Policy Plugin

[中文](README.md) | English

![Default Shell config card](docs/screenshots/shell-policy-card.png)

[![npm version](https://img.shields.io/npm/v/dsh-windows-shell-policy)](https://www.npmjs.com/package/dsh-windows-shell-policy)
[![npm downloads](https://img.shields.io/npm/dw/dsh-windows-shell-policy)](https://www.npmjs.com/package/dsh-windows-shell-policy)
[![GitHub release](https://img.shields.io/github/v/release/LAN-TINA-WS/dsh-windows-shell-policy)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest)
[![GitHub downloads](https://img.shields.io/github/downloads/LAN-TINA-WS/dsh-windows-shell-policy/total)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases)
[![GitHub stars](https://img.shields.io/github/stars/LAN-TINA-WS/dsh-windows-shell-policy)](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy)
[![license](https://img.shields.io/github/license/LAN-TINA-WS/dsh-windows-shell-policy)](LICENSE)

## dsh-windows-shell-policy

A **Windows default shell policy plugin** for DeepSeek Harness. DSH enables PowerShell (pwsh) by default on Windows, but bash dominates LLM training corpora, so agents make significantly more errors running POSIX commands through pwsh. This plugin probes for git-bash/MSYS2/Cygwin, adds a collapsible "Default Shell" card under Settings → Plugins → Plugin config to switch between bash and pwsh, dynamically registers the bash tool, and trims the prompt tool surface so the agent faces exactly one shell tool.

> [Latest Release](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest) · [dsh-plugin ecosystem](https://github.com/topics/dsh-plugin) · [Feedback](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/issues/1)

## Showcase

![bash terminal card](docs/screenshots/bash-terminal-card.png)

| Capability | Description |
| --- | --- |
| bash probing | Explicit `bashPath` → common Git install paths (Program Files / x86) → MSYS2 / Cygwin → PATH |
| Config card | Collapsible "Default Shell" card (same chrome as the official Terminal / Agent loop / Web search cards) showing probe status and the effective shell; auto / bash / pwsh radio choice with staged edit + save/discard |
| Policy | `auto` uses bash when found, else pwsh; explicit `bash` / `pwsh` forces that shell; takes effect on the next request |
| bash tool | Dynamically registered when effective=bash (git-bash execution over the subprocess seam, timeout / output truncation / exit-code markers), rendered as a terminal card (click to inspect command, cwd, output and exit status — identical to the official shell tools) |
| Prompt trimming | `system-prompt/assemble` hides pwsh or bash per policy, so the agent's tool surface keeps exactly one shell tool |
| Persistence | `preferred` is stored in the settings document `shell-policy` section and survives restarts |
| Clean uninstall | `dsh plugin --profile web remove` or `dev_uninject_plugin` restores everything (tool unregistered, prompt restored, junction removed) |

## Quick Install

**GitHub direct install (recommended, fastest in CN, no npm wait)**:

```sh
dsh plugin --profile web add github:LAN-TINA-WS/dsh-windows-shell-policy
# restart dsh web, open Settings → Plugins → Plugin config
```

**npm install (one command)**:

```sh
dsh plugin --profile web add dsh-windows-shell-policy
```

**Release ZIP install**:

1. Download `dsh-windows-shell-policy-v*.zip` from [Releases](https://github.com/LAN-TINA-WS/dsh-windows-shell-policy/releases/latest) and unzip
2. `dsh plugin --profile web add link:<unzipped dir>`
3. Restart `dsh web`, open Settings → Plugins → Plugin config

**Injector install (no restart, dev environments)**:

```sh
DSH_CHECKOUT=<checkout> bash scripts/build.sh   # produces lib/index.js + lib/client.js
dev_inject_plugin <this dir>                   # host+UI take effect immediately
```

## Configuration Guide

Expand the "Default Shell" card under Settings → Plugins → Plugin config:

| Option | Behavior |
| --- | --- |
| auto | Use bash when git-bash is found, else fall back to pwsh (works out of the box) |
| bash | Force git-bash (falls back to pwsh with a notice when no bash is found) |
| pwsh | Force PowerShell (DSH default behavior) |

Changes take effect on the next request after saving; `preferred` persists in the settings document `shell-policy` section across restarts. An explicit bash path can be set via `shell-policy.bashPath` in settings.yaml (card editing is on the roadmap).

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

Repo layout: `src/` (host + client sources), `scripts/` (build), `docs/` (docs and screenshots), `cordis.patch.yml` (bundle patch assembly).
