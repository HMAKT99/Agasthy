# AGASTHY MCP server

`agasthy mcp` runs AGASTHY as a **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server, so any MCP client (Claude Desktop, Claude Code, Cursor, VS Code, Codex, Windsurf and others) can ask about your machine with real data.

| Tool | Answers |
| --- | --- |
| `status` | How fresh the scanned data is |
| `find` | Search repositories, apps, runtimes, packages, tools, MCP servers, AI config files |
| `entity` | One item with its evidence and relationships, such as a repository's uncommitted work |
| `impact` | What breaks if a package, runtime or tool were removed, with risk, plan and recovery |
| `shared_dependencies` | Dependencies most of your projects share |
| `agents` | Live coding-agent sessions and what they left running |
| `processes` | Processes, the ports they listen on and their projects ("what is on port 3000?") |
| `token_usage` | Tokens and estimated cost per agent, session, day, project and model |
| `telemetry` | Memory, CPU, load and disk right now |

**Read-only by design.** Every tool is marked `readOnlyHint`. The server opens the AGASTHY app's database read-only, reads process tables and agents' local logs (token counters only, never message text), and never starts, stops, installs, deletes or writes anything. Nothing leaves your machine except what your MCP client sends to its model. Changes stay in the AGASTHY app, behind a dry-run review.

## 1. Install the `agasthy` tool

With Homebrew (macOS Apple silicon, Linux x64):

```bash
brew install hmakt99/tap/agasthy-cli
```

The path is then `$(brew --prefix)/bin/agasthy` (`/opt/homebrew/bin/agasthy` on Apple silicon). Or download `agasthy-cli-<system>` from the [latest release](https://github.com/HMAKT99/Agasthy/releases/latest), check it against the `.sha256` file next to it, and unpack it. On macOS (Apple silicon):

```bash
cd /tmp && curl -fsSLO https://github.com/HMAKT99/Agasthy/releases/latest/download/agasthy-cli-macos-universal.tar.gz \
  && curl -fsSLO https://github.com/HMAKT99/Agasthy/releases/latest/download/agasthy-cli-macos-universal.tar.gz.sha256 \
  && shasum -a 256 -c agasthy-cli-macos-universal.tar.gz.sha256 \
  && mkdir -p ~/.local/bin && tar -C ~/.local/bin -xzf agasthy-cli-macos-universal.tar.gz \
  && ~/.local/bin/agasthy --version
```

Linux: `agasthy-cli-linux-x86_64.tar.gz` (use `sha256sum -c`). Windows: `agasthy-cli-windows-x86_64.zip` (check with `Get-FileHash`).

Most tools read what the [AGASTHY app](https://github.com/HMAKT99/Agasthy/releases/latest) has scanned, so install it and run a scan. `agents`, `processes`, `token_usage` and `telemetry` work without it.

## 2. Add it to your client

Use the full path to `agasthy` if your client does not inherit your shell's PATH (Claude Desktop and Cursor usually do not), for example `/Users/you/.local/bin/agasthy`.

**Claude Code**

```bash
claude mcp add agasthy -- ~/.local/bin/agasthy mcp
```

**Claude Desktop**: Settings → Developer → Edit Config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agasthy": { "command": "/Users/you/.local/bin/agasthy", "args": ["mcp"] }
  }
}
```

**Cursor**: `~/.cursor/mcp.json`, same `mcpServers` shape as above.

**VS Code**: `.vscode/mcp.json` in a workspace, or the user `mcp.json`:

```json
{
  "servers": {
    "agasthy": { "type": "stdio", "command": "/Users/you/.local/bin/agasthy", "args": ["mcp"] }
  }
}
```

**Codex CLI**: `~/.codex/config.toml`:

```toml
[mcp_servers.agasthy]
command = "/Users/you/.local/bin/agasthy"
args = ["mcp"]
```

To read a different AGASTHY database, add `"--db", "/path/to/agasthy.db"` after `"mcp"`.

## Try it

Ask your agent:

- "Which of my projects have uncommitted work?"
- "What's running on port 5173, and which project is it from?"
- "How much did my coding agents spend in tokens this week?"
- "Did any agent leave dev servers running?"
- "Is it safe to uninstall openssl@3?"

## Check it by hand

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"me","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"status","arguments":{}}}' | agasthy mcp
```

Or with the MCP Inspector: `npx @modelcontextprotocol/inspector agasthy mcp`.
