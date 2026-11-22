# AGASTHY plugin for Claude Code, Codex and Cursor

One install gives your agent:

- the **AGASTHY skill**: when to ask AGASTHY and how to read its answers;
- the **AGASTHY MCP server** (`agasthy mcp`): nine read-only tools for repositories, packages, impact analysis, coding agents, processes and ports, token usage and system load.

Everything is read-only. Changes stay in the AGASTHY app, behind a dry-run review.

## Install

First put the `agasthy` command-line tool on your PATH (see [integrations/mcp](../../integrations/mcp/README.md#1-install-the-agasthy-tool)) and install the [AGASTHY app](https://github.com/HMAKT99/Agasthy/releases/latest) to scan your machine.

**Claude Code**

```text
/plugin marketplace add HMAKT99/Agasthy
/plugin install agasthy@agasthy
```

**Codex**

```bash
codex plugin marketplace add HMAKT99/Agasthy
codex plugin add agasthy@agasthy
```

**Cursor**

Cursor installs plugins from its marketplace or from a team marketplace. This repository is a Cursor plugin marketplace (`.cursor-plugin/marketplace.json`), so:

- **Teams and Enterprise:** an admin adds it under Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace → Import from Repo, with `https://github.com/HMAKT99/Agasthy`. AGASTHY then appears under Customize for everyone on the team.
- **On your own:** copy this folder to `~/.cursor/plugins/local/agasthy`, then run **Developer: Reload Window**.
- **MCP server only:** add it to `~/.cursor/mcp.json` as shown in [integrations/mcp](../../integrations/mcp/README.md).

Cursor usually does not inherit your shell's PATH. If the AGASTHY tools do not appear, change `"command": "agasthy"` in `.mcp.json` to the full path, for example `/Users/you/.local/bin/agasthy`.

The skill here is a copy of [`skills/agasthy/SKILL.md`](../../skills/agasthy/SKILL.md); CI keeps them identical.
