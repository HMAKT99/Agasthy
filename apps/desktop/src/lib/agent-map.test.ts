import type { Edge, Entity, EntityKind, SessionUsage } from "@agasthy/shared-types";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER,
  agentForUsage,
  briefing,
  buildAgentMap,
  defaultProject,
  layout,
  leaving,
  projectForPath,
  reach,
  visibleIds,
} from "./agent-map";

const ent = (id: string, kind: EntityKind, name: string, attributes: Record<string, unknown> = {}, path: string | null = null, version: string | null = null): Entity => ({
  id,
  kind,
  name,
  path,
  version,
  source: "test",
  attributes: attributes as Entity["attributes"],
  first_seen: 0,
  last_seen: 0,
});
const edge = (from: string, to: string, kind: Edge["kind"], confidence: Edge["confidence"] = "strong"): Edge => ({
  id: `${kind}:${from}->${to}`,
  kind,
  from_id: from,
  to_id: to,
  confidence,
  attributes: null,
});
const session = (agent: string, cwd: string, total: number): SessionUsage => ({
  agent,
  session_id: `${agent}-${cwd}-${total}`,
  cwd,
  first_at: 1,
  last_at: 2,
  tokens: { input: total / 4, output: total / 4, cache_read: total / 2, cache_write: 0, requests: 1 },
  models: [],
  estimated_cost_usd: null,
  cost_partial: false,
});

const entities: Entity[] = [
  ent("repository:/u/app", "repository", "app", {}, "/u/app"),
  ent("repository:/u/app/sub", "repository", "sub", {}, "/u/app/sub"),
  ent("repository:/u/lonely", "repository", "lonely", {}, "/u/lonely"),
  ent("ai_tool:claude-code", "ai_tool", "Claude Code", { tool: "claude-code", vendor: "Anthropic", category: "cli", installed: true }),
  ent("ai_tool:codex-cli", "ai_tool", "OpenAI Codex CLI", { tool: "codex-cli", vendor: "OpenAI", category: "cli", installed: false }),
  ent("ai_tool:codex-app", "ai_tool", "Codex (desktop app)", { tool: "codex-app", vendor: "OpenAI", category: "desktop_app", installed: true }),
  ent("ai_file:/u/app/CLAUDE.md", "ai_config_file", "CLAUDE.md", { project: "/u/app" }, "/u/app/CLAUDE.md"),
  ent("ai_file:/home/.claude/CLAUDE.md", "ai_config_file", "CLAUDE.md", { project: null }, "/home/.claude/CLAUDE.md"),
  ent("ai_file:/u/app/AGENTS.md", "ai_config_file", "AGENTS.md", { project: "/u/app" }, "/u/app/AGENTS.md"),
  ent("mcp:local", "mcp_server", "dry-run", { transport: "stdio", command: "/usr/bin/node", args: ["/x/dryrun.mjs", "mcp"] }),
  ent("mcp:remote", "mcp_server", "hunt", { transport: "http", url: "https://mcp.example.com/mcp" }),
  ent("ai_provider:anthropic", "ai_provider", "Anthropic", { kind: "cloud", highest: "referenced" }),
  ent("ai_provider:ollama", "ai_provider", "Ollama", { kind: "local", highest: "running" }),
  ent("runtime:node", "runtime", "Node.js", {}, null, "24.9.0"),
];
const edges: Edge[] = [
  edge("repository:/u/app", "ai_file:/u/app/CLAUDE.md", "contains", "verified"),
  edge("repository:/u/app", "ai_file:/u/app/AGENTS.md", "contains", "verified"),
  edge("ai_file:/u/app/CLAUDE.md", "ai_tool:claude-code", "configures_tool"),
  edge("ai_file:/home/.claude/CLAUDE.md", "ai_tool:claude-code", "configures_tool"),
  edge("ai_file:/u/app/AGENTS.md", "ai_tool:codex-app", "configures_tool"),
  edge("ai_tool:claude-code", "mcp:local", "uses_mcp_server"),
  edge("ai_tool:claude-code", "mcp:remote", "uses_mcp_server"),
  edge("ai_tool:claude-code", "ai_provider:anthropic", "uses_provider"),
  edge("ai_tool:codex-app", "ai_provider:ollama", "uses_provider"),
  edge("repository:/u/app", "runtime:node", "requires_runtime", "verified"),
  // Not part of the map.
  edge("repository:/u/app", "dependency:npm:x", "depends_on", "verified"),
];
const sessions = [
  session("claude-code", "/u/app", 4000),
  session("claude-code", "/U/App/src", 1000),
  session("claude-code", "/u/app/sub", 400),
  session("codex", "/u/app", 800),
  session("claude-code", "/elsewhere", 9999),
];
const m = buildAgentMap({ entities, edges, sessions, runtimeEdges: edges.filter((e) => e.kind === "requires_runtime"), runtimes: entities.filter((e) => e.kind === "runtime") });

describe("buildAgentMap", () => {
  it("keeps only map kinds and map relationships", () => {
    expect(m.nodes.has("runtime:node")).toBe(false);
    expect(m.links.every((l) => l.kind !== ("depends_on" as string))).toBe(true);
    expect(m.links).toHaveLength(9);
  });

  it("marks what lies outside the machine", () => {
    expect(m.nodes.get("mcp:remote")?.outside).toBe(true);
    expect(m.nodes.get("mcp:remote")?.host).toBe("mcp.example.com");
    expect(m.nodes.get("mcp:local")?.outside).toBe(false);
    expect(m.nodes.get("mcp:local")?.command).toBe("node dryrun.mjs mcp");
    expect(m.nodes.get("ai_provider:anthropic")?.outside).toBe(true);
    expect(m.nodes.get("ai_provider:ollama")?.outside).toBe(false);
  });

  it("adds up work per project and agent, in the deepest matching project", () => {
    const by = Object.fromEntries(m.work.map((w) => [`${w.repo}|${w.agent}`, w]));
    expect(by["repository:/u/app|ai_tool:claude-code"].tokens).toBe(5000);
    expect(by["repository:/u/app|ai_tool:claude-code"].sessions).toBe(2);
    expect(by["repository:/u/app|ai_tool:claude-code"].fresh).toBe(2500);
    expect(by["repository:/u/app/sub|ai_tool:claude-code"].tokens).toBe(400);
    // Codex logs belong to the installed Codex.
    expect(by["repository:/u/app|ai_tool:codex-app"].tokens).toBe(800);
    expect(m.work.some((w) => w.repo.includes("elsewhere"))).toBe(false);
  });
});

describe("matching", () => {
  it("matches paths across OSes and prefers the deepest project", () => {
    const repos = [...m.nodes.values()].filter((n) => n.kind === "repository");
    expect(projectForPath("C:\\U\\APP\\sub\\x", [{ ...repos[0], path: "C:\\u\\app" }, { ...repos[1], path: "c:/u/app/sub" }])?.name).toBe("sub");
    expect(projectForPath("/u/application", repos)).toBeUndefined();
  });

  it("prefers the installed program for a usage log", () => {
    const tools = [...m.nodes.values()].filter((n) => n.kind === "ai_tool");
    expect(agentForUsage("codex", tools)?.id).toBe("ai_tool:codex-app");
    expect(agentForUsage("unknown-agent", tools)).toBeUndefined();
  });
});

describe("reach and leaving", () => {
  it("collects what an agent reads, calls, sends to and works in", () => {
    const r = reach(m, "ai_tool:claude-code");
    for (const id of ["ai_file:/u/app/CLAUDE.md", "ai_file:/home/.claude/CLAUDE.md", "repository:/u/app", "mcp:local", "mcp:remote", "ai_provider:anthropic", "repository:/u/app/sub"])
      expect(r.has(id), id).toBe(true);
    expect(r.has("ai_tool:codex-app")).toBe(false);
  });

  it("lists only links that cross the edge", () => {
    expect(leaving(m).map((l) => l.to).sort()).toEqual(["ai_provider:anthropic", "mcp:remote"]);
  });
});

describe("visibleIds", () => {
  it("shows everything connected to an agent by default, and drops unconnected projects", () => {
    const v = visibleIds(m, DEFAULT_FILTER);
    expect(v.has("repository:/u/lonely")).toBe(false);
    expect(v.has("repository:/u/app")).toBe(true);
    expect(v.has("ai_tool:codex-cli")).toBe(true);
  });

  it("filters by agent, installation, layer and focus", () => {
    const onlyCodex = visibleIds(m, { ...DEFAULT_FILTER, agents: ["ai_tool:codex-app"] });
    expect(onlyCodex.has("mcp:remote")).toBe(false);
    expect(onlyCodex.has("ai_provider:ollama")).toBe(true);
    expect(visibleIds(m, { ...DEFAULT_FILTER, installedOnly: true }).has("ai_tool:codex-cli")).toBe(false);
    const noFiles = visibleIds(m, { ...DEFAULT_FILTER, layers: { ...DEFAULT_FILTER.layers, files: false } });
    expect([...noFiles].some((id) => id.startsWith("ai_file:"))).toBe(false);
    const around = visibleIds(m, { ...DEFAULT_FILTER, around: "mcp:remote" });
    expect([...around].sort()).toEqual(["ai_tool:claude-code", "mcp:remote"]);
  });
});

describe("layout", () => {
  it("places every visible node, agents on one ring and outside things beyond it", () => {
    const v = visibleIds(m, DEFAULT_FILTER);
    const p = layout(m, v, 500, 500, 400);
    expect(p.size).toBe(v.size);
    const dist = (id: string) => Math.hypot(p.get(id)!.x - 500, p.get(id)!.y - 500);
    expect(Math.round(dist("ai_tool:claude-code"))).toBe(Math.round(dist("ai_tool:codex-app")));
    expect(dist("ai_provider:anthropic")).toBeGreaterThan(dist("mcp:local"));
    expect(dist("mcp:local")).toBeGreaterThan(dist("ai_tool:claude-code"));
    for (const q of p.values()) expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true);
  });
});

describe("layout with one agent", () => {
  it("spreads each ring around the whole circle instead of piling things up", () => {
    const v = visibleIds(m, { ...DEFAULT_FILTER, around: "ai_tool:claude-code" });
    const p = layout(m, v, 0, 0, 400);
    const files = [...v].filter((id) => id.startsWith("ai_file:")).map((id) => p.get(id)!);
    const xs = files.map((f) => Math.sign(Math.round(f.x)));
    // Two files: opposite sides of the ring.
    expect(new Set(xs).size).toBeGreaterThan(1);
  });
});

describe("briefing", () => {
  it("tells an agent what applies in a project", () => {
    expect(defaultProject(m, "ai_tool:claude-code")).toBe("repository:/u/app");
    const b = briefing(m, "ai_tool:claude-code", "repository:/u/app");
    expect(b).toContain("# Briefing: Claude Code in app");
    expect(b).toContain("- Node.js 24.9.0");
    expect(b).toContain("- /u/app/CLAUDE.md");
    expect(b).toContain("- /home/.claude/CLAUDE.md  (applies everywhere)");
    expect(b).toContain("- hunt: remote, mcp.example.com  (data leaves this machine)");
    expect(b).toContain("- dry-run: local, node dryrun.mjs mcp");
    expect(b).toContain("Also set up in this project: Codex (desktop app)");
    expect(b).toContain("5K tokens over 2 sessions");
  });
});
