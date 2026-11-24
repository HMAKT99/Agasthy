# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.11] - 2026-11-24

- **Qwen Code, Gemini CLI and Amp installed with npm are now recognised.** A global npm install or `npx` starts these agents as `node …/bin/qwen`, a path without the package name, so their sessions and the processes they left running were missed. AGASTHY now also matches the script a Node, Bun, Deno or Python launcher runs. Checked against a live Qwen Code 0.28.4 session.
- **Cursor plugin:** the same read-only skill and MCP server as the Claude Code and Codex plugins, in `plugins/agasthy/.cursor-plugin`. Teams can add this repository as a Cursor team marketplace, or anyone can copy the folder to `~/.cursor/plugins/local/agasthy`.
- **Security updates:** `url` 2.5.9 (RUSTSEC-2026-0592) and `cookie` 0.18.3 (RUSTSEC-2026-0594). AGASTHY wasn't exposed to either issue; the updates keep dependency audits clean.

## [0.1.10] - 2026-11-19

- **Arch Linux (pacman), for Omarchy, Manjaro and other Arch-based systems:** packages are read from the local pacman database (`pacman -Qi`, read-only, no network), with descriptions, licences, which ones you installed yourself, and dependencies. Dependencies on virtual names and libraries (`sh`, `libreadline.so`) are resolved to the package that provides them, so "what breaks if I remove it" works for pacman packages. AUR helpers `yay` and `paru` are recognised as tools. Not yet tested on Arch itself; reports welcome.

## [0.1.9] - 2026-11-19

- **You can move the window on macOS** by dragging the top of the sidebar or any page header. Until now the app lacked the permission to start a drag, so the window stayed put. Thanks to @FlorencioJP (#1).
- **One-line install for macOS and Linux:** `curl -fsSL https://raw.githubusercontent.com/HMAKT99/Agasthy/main/install.sh | sh`. It checks every download against its published SHA-256, needs no admin rights, and installs without macOS's "could not verify" prompt. `--cli` also installs the command-line tool, and `--cli-only` installs just that.
- **Clearer first-launch help** in the README and release notes for anyone installing from the files.
- **First run:** a new install opens with "Let AGASTHY look at this machine" at the top of the Overview. One click scans installed software, packages and the AI setup (agents, MCP servers, instruction files), and project folders too if you've added any, so the Agent Map and AI pages fill in straight away.
- **Linux on ARM64 (preview):** releases include `AGASTHY_<version>_aarch64.AppImage`, `agasthy_<version>_arm64.deb` and `agasthy-cli-linux-aarch64.tar.gz` for Raspberry Pi, ARM servers and ARM laptops, with in-app updates.
- **Intel Macs:** releases ship one universal app (`AGASTHY-<version>-macos-universal.dmg`) and a universal command-line tool, for Apple silicon and Intel. Homebrew no longer limits AGASTHY to Apple silicon, and Intel installs receive in-app updates. The Apple silicon file names stay for existing links.
- **Windows on ARM:** `install.ps1` installs the x64 command-line tool, which runs under Windows' built-in emulation, instead of refusing.

## [0.1.8] - 2026-11-18

- **Updates when a copy can't update itself:** if the start-up check fails for a reason other than the network (for example the app runs from the mounted DMG, a deleted folder or a read-only location), a banner now says so and opens the download page. Network failures stay quiet.
- **"Later" on the update banner now hides it.** It did nothing before.
- **Agent Map layout:** many projects no longer pile up in the middle; local MCP servers and models keep clear of agent labels; agents at the top are labelled above their dot; project names sit beside their dot.

## [0.1.7] - 2026-11-18

- **Machine Graph is now the Agent Map:** your machine drawn from the agents' side. Projects in the middle, then the instruction and config files in them, the agents that read those files, and the MCP servers, models and providers they use. A boundary marks the edge of the machine, and connections that cross it (cloud providers, remote MCP servers) are drawn in orange.
  - Click anything to see what it reads, calls, sends data to and where it worked; double-click to show only what it involves.
  - Work bands show where each agent spent tokens (7, 30 or 90 days), from the agents' own logs.
  - Filters for agents (including "installed only") and layers, a "what leaves the machine" lens, search, zoom and pan.
  - Each agent gets a briefing for a chosen project: runtimes, instructions it reads, MCP servers it can call and which of them leave the machine. Copy it into a session.
  - "All connections" opens the previous node graph around any item, with depth and kind filters and runtime impact.
- **GitHub Copilot plugin:** an Agent Plugins 1.0 manifest (`plugins/agasthy/plugin.json`, `mcp.json`) so Copilot can install the skill and MCP server.
- **Release channels:** publishing a release now also publishes it to the official MCP Registry and updates the Homebrew tap.
- **Docs:** a Chinese README (`README.zh-CN.md`), and a one-command way to try the CLI without the desktop app.

## [0.1.6] - 2026-11-17

- **Windows fixes from the first real-PC test:**
  - No more false "swapping heavily" insight. Windows reports memory committed beyond RAM as "swap", which is normal; it is now labelled as such and no longer raises an alert.
  - Low-disk insights, the tray menu and the Overview disk card use the disk that holds your user folder (`C:\`), not only `/`.
  - Live agent sessions started with Node on Windows (`node.exe`, backslash paths) are recognised: Claude Code, Codex, Gemini CLI and GitHub Copilot CLI.
  - "Show in File Explorer" instead of "Reveal in Finder", and no "macOS" labels on other systems.
- **Token usage for GitHub Copilot CLI**, from its local session logs (`~/.copilot/session-state`, or `$COPILOT_HOME`). Finished sessions only: Copilot writes its totals when a session ends.
- **Claude Desktop extension in every release:** `agasthy-mcp-<version>.mcpb`, with the macOS, Windows and Linux binaries.
- **README:** direct download buttons for each system, updated automatically when a release is published.

## [0.1.5] - 2026-11-17

- **MCP server:** `agasthy mcp` serves nine read-only tools (status, find, entity, impact, shared_dependencies, agents, processes, token_usage, telemetry) over stdio for Claude Desktop, Claude Code, Cursor, VS Code, Codex and any MCP client. Setup: `integrations/mcp`.
- **One-step agent install:** a Claude Code and Codex plugin (skill + MCP server) from this repo's marketplace (`/plugin marketplace add HMAKT99/Agasthy`); the skill now lives in `skills/agasthy` so `npx skills add HMAKT99/Agasthy` finds it; `llms.txt` tells any agent how to install and use AGASTHY.
- The command line and the MCP server share one set of queries, so they always give the same answers.

## [0.1.4] - 2026-11-17

- **AGASTHY skill for coding agents** (`integrations/agent-skill`): OpenClaw, Hermes, Claude Code and other Agent Skills readers can answer questions about your machine from AGASTHY's data. Read-only; changes stay with you.
- **Command-line tool in every release** (`agasthy-cli-…` for macOS, Windows and Linux), with new commands: `status`, `find`, `entity` and `agents`. Query commands read the app's database read-only by default, so agents use what the app already scanned; `impact` and `shared` no longer need `--db`. `--version`; options work before or after the command.
- **Release checks** now download and run the released command-line tool on all three systems.

## [0.1.3] - 2026-11-16

- **macOS:** the whole app bundle is now ad-hoc signed. 0.1.2 downloaded through a browser could be reported as "damaged"; 0.1.3 gets the normal "cannot verify the developer" prompt (allow it once in System Settings → Privacy & Security).
- **Linux preview:** AppImage and `.deb` with each release, with in-app updates for the AppImage.
- **End-to-end smoke test** (`.github/workflows/smoke.yml`): installs and launches each release on real macOS, Windows and Linux machines, and runs discovery on all three.
- Demo video tooling: patched `zod` dependency.

## [0.1.2] - 2026-11-16

- **Windows preview:** an x64 installer is published with each release (unsigned; SmartScreen asks once). Installed copies update through the same signed updater.
- **Report a problem:** a redacted, editable summary for GitHub issues, from Settings → About or the error screen.
- **Export CSV** on Token Usage: tokens and estimated cost per day, agent, project folder and model.
- Storage & Cleanup no longer misses build folders in a project when `.git` is listed first in the folder.

First public release (Apple silicon, macOS 12+). Everything below is included.

- Release builds no longer try to code-sign with an empty identity when no Apple account is configured.
- Rust toolchain pinned (1.94.1) so local, CI and release builds match.

### Added (release readiness)
- In-app updates from GitHub Releases: signature-verified, installed only after confirmation, start-up check can be turned off.
- Release workflow (`.github/workflows/release.yml`) producing a draft GitHub release with the DMG and updater manifest.
- Background tasks recover from internal errors instead of stopping; shared state locks are recovered after a failure.
- A page that fails to render shows an error with "Try again" instead of a blank window.
- Local diagnostics log (`logs/agasthy.log`, rotated, home folder shown as `~`, never uploaded); Settings → About links to it.
- `pnpm release:mac`: builds a DMG, signs and notarizes it when Apple Developer credentials are set, and writes a SHA-256 checksum.

### Added (Agent Control Center)
- Agents page: live coding-agent sessions (Claude Code, Codex, Gemini CLI, Cursor Agent, Copilot CLI, Aider, OpenCode, Goose, Amp, Qwen Code, Hermes Agent, OpenClaw, Crush, Kilo Code), plus any process that starts MCP servers, with each session's process tree, memory, CPU, ports, MCP and dev servers, and host app.
- Processes left running after an agent exited, attributed to the session that started them; one reviewed action stops them (new `terminate_processes` action, SIGTERM only).
- Git worktrees in scanned repositories, with the tool that created them, uncommitted changes and agents working in them.
- Token Usage page: tokens, requests and estimated cost per day, session, project folder and model, from Claude Code and Codex logs and Hermes Agent's database (counters only). `agasthy usage` CLI command.
- Operator: "What are my coding agents doing?" and "Clean up after my agents".

### Added (Phase 6)
- AI Operator page: a built-in mode that answers common questions with no model, and an optional model mode with a tool-calling loop over typed, read-only tools.
- Providers: Ollama, LM Studio, vLLM, LocalAI, OpenAI, Google Gemini, OpenRouter and custom OpenAI-compatible endpoints, and Anthropic (Messages API). Keys stored in the OS credential store; cloud models need an explicit opt-in.
- Proposals from the Operator (stop a process, quarantine cleanup candidates, prune Docker) open the existing dry-run review; the Operator cannot execute anything.
- Settings → AI model panel; operator questions recorded in the audit log with where data was sent.
- Windows adapter: registry application inventory, Scoop and Chocolatey 2.x packages, listening ports via `netstat`. Linux adapter: `.desktop` applications, Flatpak and Snap packages. Both unit-tested; reported as "unvalidated" until run on real hardware.

### Added (Phase 5)
- Impact Analysis: removal simulation for any entity, Homebrew dependents from installed runtime dependencies, runtime and project impact.
- Safe Update Lab: Git worktree labs with approved install/test steps and guarded apply.
- Snapshots: capture, compare, reconstruction plans.
- Security: outdated Homebrew packages, unknown-origin tools, opt-in OSV.dev advisories.
- CLI: `agasthy impact <id>` now covers any entity; `agasthy security` (local checks).

### Added (Phase 4)
- Typed action engine (`agasthy-actions`) with dry-run plans, single-use confirmations, re-validation, verification and audit.
- Processes screen: live process table with ports, project links and protection reasons; stop and force quit with review.
- Storage & Cleanup screen: disk analysis, Git-verified project artifacts and developer caches, restorable quarantine, Docker usage and prune.
- CLI: `agasthy processes`, `agasthy disk` (read-only).

### Added (Phase 3)
- AI ecosystem discovery: assistants, desktop AI apps and local inference engines with on-disk evidence; providers with evidence levels; local models; MCP servers; AI instruction, agent, skill, command, settings and MCP files.
- Duplicate, overlap, orphan, `@import` and potential-conflict analysis for AI instruction files.
- Secret redaction for stored instruction text and MCP arguments; credential files checked for existence only.
- AI Ecosystem screen with question shortcuts; AI view in the Machine Graph; `agasthy ai` CLI command.

### Added (Phase 2)
- Project dependency discovery from manifests and lockfiles across npm, Cargo, PyPI and Go, including nested packages in monorepos.
- Runtime requirement discovery and `requires_runtime` links to the runtime copies on PATH.
- `agasthy-graph` crate: neighbourhood and overview graph views, most-shared dependencies, runtime impact analysis with a version-constraint evaluator.
- Machine Graph screen; a Project dependencies tab in Discovery; impact analysis in runtime details; "Scan everything" runs scans in dependency order.
- Schema v2 migration: relationships carry attributes (declarations, constraints, resolved versions).
- CLI: `agasthy impact <runtime-id> --db FILE`, `agasthy shared --db FILE`.

### Added (Phase 1)
- Monorepo foundation: Rust workspace, Tauri 2 desktop shell, React 19 UI, shared TypeScript types generated from Rust.
- SQLite store with migrations, FTS5 search, evidence and confidence for every entity and relationship, and an append-only audit log.
- macOS platform adapter; Windows and Linux adapter skeletons.
- Guarded command runner (allowlist, no shell, timeouts, output caps).
- Git repository discovery in user-chosen folders: branch, HEAD, working tree, remotes (credentials redacted), GitHub origin, duplicate clones, languages, frameworks, licence, size.
- Application discovery (macOS bundles), catalogued CLI tools and runtimes with versions and active/shadowed resolution, install-source hints.
- Package inventories: Homebrew, npm, pnpm, uv, pip, cargo; links between binaries, packages, applications and upstream projects.
- Live telemetry: CPU, memory, swap, disks, load, processes, GPU model.
- Overview, Discovery, Settings and Privacy screens.
- `agasthy` headless CLI.
- CI and security workflows (not yet run on GitHub).
