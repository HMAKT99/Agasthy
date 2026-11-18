import type { Edge, Entity, EntityKind, SessionUsage } from "@agasthy/shared-types";

/**
 * The Agent Map: the machine drawn from the agents' side. Projects sit in the
 * middle, then the instruction and config files in them, then the agents
 * that read those files, then the MCP servers and local models they use. A
 * boundary marks the edge of the machine; cloud providers and remote MCP
 * servers sit outside it. Everything here is derived from scanned entities,
 * their relationships and agents' own token logs.
 */

export type MapKind = "repository" | "ai_config_file" | "ai_tool" | "mcp_server" | "local_model" | "ai_provider";

export interface MapNode {
  id: string;
  kind: MapKind;
  name: string;
  /** Short label for the map. */
  label: string;
  path: string | null;
  version: string | null;
  /** Lies outside the machine: a cloud provider or a remote MCP server. */
  outside: boolean;
  // Kind-specific facts, normalised from entity attributes.
  vendor?: string;
  category?: string;
  installed?: boolean;
  toolId?: string;
  transport?: string;
  host?: string | null;
  command?: string | null;
  providerLevel?: string;
  /** For files: the project that contains it, if any. */
  project?: string | null;
}

export type LinkKind = "contains" | "configures_tool" | "declares_mcp_server" | "uses_mcp_server" | "uses_provider" | "serves_model";

export interface MapLink {
  id: string;
  kind: LinkKind;
  from: string;
  to: string;
  confidence: Edge["confidence"];
}

export interface Work {
  repo: string;
  agent: string;
  /** All tokens, including prompt cache reads and writes. */
  tokens: number;
  /** Input plus output, without cache. */
  fresh: number;
  sessions: number;
  lastAt: number | null;
}

export interface RuntimeNeed {
  repo: string;
  runtime: string;
  version: string | null;
}

export interface AgentMap {
  nodes: Map<string, MapNode>;
  links: MapLink[];
  work: Work[];
  runtimes: RuntimeNeed[];
}

export const MAP_KINDS: MapKind[] = ["repository", "ai_config_file", "ai_tool", "mcp_server", "local_model", "ai_provider"];
export const LINK_KINDS: LinkKind[] = ["contains", "configures_tool", "declares_mcp_server", "uses_mcp_server", "uses_provider", "serves_model"];

const attr = (e: Entity): Record<string, unknown> =>
  e.attributes && typeof e.attributes === "object" && !Array.isArray(e.attributes) ? (e.attributes as Record<string, unknown>) : {};
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Paths compared the same way on every OS: forward slashes, no trailing slash, case-insensitive. */
export const normPath = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

const baseName = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;

function toNode(e: Entity): MapNode | null {
  if (!MAP_KINDS.includes(e.kind as MapKind)) return null;
  const a = attr(e);
  const kind = e.kind as MapKind;
  const n: MapNode = { id: e.id, kind, name: e.name, label: e.name, path: e.path, version: e.version, outside: false };
  switch (kind) {
    case "ai_tool":
      n.vendor = str(a.vendor);
      n.category = str(a.category);
      n.installed = a.installed !== false;
      n.toolId = str(a.tool);
      n.label = e.name.replace(/ \(desktop app\)$/, "");
      break;
    case "mcp_server": {
      const url = str(a.url);
      const command = str(a.command);
      const args = Array.isArray(a.args) ? a.args.filter((x): x is string => typeof x === "string") : [];
      n.transport = str(a.transport) ?? "unknown";
      n.host = hostOf(url);
      n.command = command ? [baseName(command), ...args.map((x) => (/[\\/]/.test(x) ? baseName(x) : x))].join(" ") : null;
      n.outside = n.transport === "http" || n.transport === "sse" || Boolean(url);
      break;
    }
    case "ai_provider":
      n.providerLevel = str(a.highest);
      n.outside = str(a.kind) !== "local";
      break;
    case "ai_config_file": {
      n.project = str(a.project) ?? null;
      const p = (e.path ?? e.id.replace(/^ai_file:/, "")).replace(/\\/g, "/");
      n.path = e.path ?? p;
      n.label = p.split("/").slice(-2).join("/");
      break;
    }
  }
  return n;
}

const sum = (t: SessionUsage["tokens"]) => t.input + t.output + t.cache_read + t.cache_write;

/** Which agent entity a usage log belongs to (usage agent names are not tool ids). */
export function agentForUsage(agent: string, tools: MapNode[]): MapNode | undefined {
  const candidates: Record<string, string[]> = {
    "claude-code": ["claude-code"],
    codex: ["codex-cli", "codex-app"],
    "copilot-cli": ["copilot-cli", "github-copilot-cli"],
  };
  const ids = [...(candidates[agent] ?? []), agent];
  const matching = ids.map((id) => tools.find((t) => t.toolId === id)).filter((t): t is MapNode => Boolean(t));
  return matching.find((t) => t.installed) ?? matching[0];
}

/** The deepest scanned project whose folder holds `cwd`. */
export function projectForPath(cwd: string, repos: MapNode[]): MapNode | undefined {
  const c = normPath(cwd);
  let best: MapNode | undefined;
  let bestLen = -1;
  for (const r of repos) {
    if (!r.path) continue;
    const p = normPath(r.path);
    if ((c === p || c.startsWith(p + "/")) && p.length > bestLen) {
      best = r;
      bestLen = p.length;
    }
  }
  return best;
}

export function buildAgentMap(input: {
  entities: Entity[];
  edges: Edge[];
  sessions: SessionUsage[];
  /** `requires_runtime` edges and the runtimes they point at, for briefings. */
  runtimeEdges?: Edge[];
  runtimes?: Entity[];
}): AgentMap {
  const nodes = new Map<string, MapNode>();
  for (const e of input.entities) {
    const n = toNode(e);
    if (n) nodes.set(n.id, n);
  }
  const links: MapLink[] = [];
  const seen = new Set<string>();
  for (const e of input.edges) {
    if (!LINK_KINDS.includes(e.kind as LinkKind) || !nodes.has(e.from_id) || !nodes.has(e.to_id) || e.from_id === e.to_id) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    links.push({ id: e.id, kind: e.kind as LinkKind, from: e.from_id, to: e.to_id, confidence: e.confidence });
  }
  // A file's project comes from the scan's `contains` edge when there is one.
  for (const l of links) if (l.kind === "contains") nodes.get(l.to)!.project = l.from;
  for (const n of nodes.values()) {
    if (n.kind === "ai_config_file" && n.project && !nodes.has(n.project)) {
      const repo = projectForPath(n.project, [...nodes.values()].filter((x) => x.kind === "repository"));
      n.project = repo?.id ?? null;
    }
  }

  const tools = [...nodes.values()].filter((n) => n.kind === "ai_tool");
  const repos = [...nodes.values()].filter((n) => n.kind === "repository");
  const work = new Map<string, Work>();
  for (const s of input.sessions) {
    if (!s.cwd) continue;
    const agent = agentForUsage(s.agent, tools);
    const repo = projectForPath(s.cwd, repos);
    if (!agent || !repo) continue;
    const key = `${repo.id}|${agent.id}`;
    const w = work.get(key) ?? { repo: repo.id, agent: agent.id, tokens: 0, fresh: 0, sessions: 0, lastAt: null };
    w.tokens += sum(s.tokens);
    w.fresh += s.tokens.input + s.tokens.output;
    w.sessions += 1;
    if (s.last_at != null && (w.lastAt == null || s.last_at > w.lastAt)) w.lastAt = s.last_at;
    work.set(key, w);
  }

  const runtimeById = new Map((input.runtimes ?? []).map((r) => [r.id, r]));
  const runtimes: RuntimeNeed[] = [];
  for (const e of input.runtimeEdges ?? []) {
    const r = runtimeById.get(e.to_id);
    if (e.kind === "requires_runtime" && r && nodes.has(e.from_id)) runtimes.push({ repo: e.from_id, runtime: r.name, version: r.version });
  }

  return { nodes, links, work: [...work.values()].filter((w) => w.tokens > 0).sort((a, b) => b.tokens - a.tokens), runtimes };
}

// ----- queries over the map -----

export const out = (m: AgentMap, id: string, kind: LinkKind) => m.links.filter((l) => l.from === id && l.kind === kind).map((l) => m.nodes.get(l.to)!);
export const inc = (m: AgentMap, id: string, kind: LinkKind) => m.links.filter((l) => l.to === id && l.kind === kind).map((l) => m.nodes.get(l.from)!);

/** Everything directly involved with `id`, from the point of view of what it is. */
export function reach(m: AgentMap, id: string): Set<string> {
  const n = m.nodes.get(id);
  const s = new Set<string>([id]);
  if (!n) return s;
  const add = (x: MapNode | undefined) => x && s.add(x.id);
  if (n.kind === "ai_tool") {
    for (const f of inc(m, id, "configures_tool")) {
      add(f);
      if (f.project) add(m.nodes.get(f.project));
    }
    out(m, id, "uses_mcp_server").forEach(add);
    out(m, id, "uses_provider").forEach(add);
    out(m, id, "serves_model").forEach(add);
    m.work.filter((w) => w.agent === id).forEach((w) => add(m.nodes.get(w.repo)));
  } else if (n.kind === "repository") {
    for (const f of out(m, id, "contains")) {
      add(f);
      out(m, f.id, "configures_tool").forEach(add);
      out(m, f.id, "declares_mcp_server").forEach(add);
    }
    m.work.filter((w) => w.repo === id).forEach((w) => add(m.nodes.get(w.agent)));
  } else if (n.kind === "ai_config_file") {
    out(m, id, "configures_tool").forEach(add);
    out(m, id, "declares_mcp_server").forEach(add);
    if (n.project) add(m.nodes.get(n.project));
  } else if (n.kind === "mcp_server") {
    inc(m, id, "uses_mcp_server").forEach(add);
    inc(m, id, "declares_mcp_server").forEach(add);
  } else if (n.kind === "ai_provider") {
    inc(m, id, "uses_provider").forEach(add);
  } else if (n.kind === "local_model") {
    inc(m, id, "serves_model").forEach(add);
  }
  return s;
}

/** Links that cross the edge of the machine: an agent talking to a cloud provider or a remote MCP server. */
export function leaving(m: AgentMap): MapLink[] {
  return m.links.filter((l) => (l.kind === "uses_provider" || l.kind === "uses_mcp_server") && m.nodes.get(l.to)!.outside);
}

// ----- filtering -----

export interface MapFilter {
  /** Agents to show; empty means all. */
  agents: string[];
  /** Hide agents whose program was not found (only settings remain). */
  installedOnly: boolean;
  /** Layers to show. Agents are always shown. */
  layers: { projects: boolean; files: boolean; mcp: boolean; providers: boolean };
  /** Show only what `around` is involved with. */
  around: string | null;
}

export const DEFAULT_FILTER: MapFilter = {
  agents: [],
  installedOnly: false,
  layers: { projects: true, files: true, mcp: true, providers: true },
  around: null,
};

/** The ids to draw under a filter. Things left unconnected by a filter are dropped, so the map stays readable. */
export function visibleIds(m: AgentMap, f: MapFilter): Set<string> {
  const agentOk = (n: MapNode) => (!f.installedOnly || n.installed !== false) && (f.agents.length === 0 || f.agents.includes(n.id));
  const agents = new Set([...m.nodes.values()].filter((n) => n.kind === "ai_tool" && agentOk(n)).map((n) => n.id));
  const layerOk = (n: MapNode) =>
    n.kind === "ai_tool" ||
    (n.kind === "repository" && f.layers.projects) ||
    (n.kind === "ai_config_file" && f.layers.files) ||
    ((n.kind === "mcp_server" || n.kind === "local_model") && f.layers.mcp) ||
    (n.kind === "ai_provider" && f.layers.providers);
  const v = new Set<string>(agents);
  // Keep a non-agent thing only when it connects to a shown agent, directly or through a file.
  for (const n of m.nodes.values()) {
    if (n.kind === "ai_tool" || !layerOk(n)) continue;
    const touches = [...reach(m, n.id)].some((x) => agents.has(x));
    if (touches) v.add(n.id);
  }
  if (f.around && m.nodes.has(f.around)) {
    const r = reach(m, f.around);
    for (const id of [...v]) if (!r.has(id)) v.delete(id);
  }
  return v;
}

// ----- layout -----

export const RING = { repo: 0.15, file: 0.36, agent: 0.62, inner: 0.75, edge: 0.83, out: 0.94 };

export interface Placed {
  id: string;
  x: number;
  y: number;
  angle: number;
}

const meanAngle = (as: number[]): number | null =>
  as.length ? Math.atan2(as.reduce((s, a) => s + Math.sin(a), 0), as.reduce((s, a) => s + Math.cos(a), 0)) : null;

/**
 * Spread items around a ring, near the angles they want, at least `gap`
 * apart. When none of them wants an angle, they share the whole ring evenly,
 * starting at `start`. A crowded ring gets even slots in the order the items
 * want. `pinned` angles (things on a neighbouring ring) are kept clear of but
 * never moved.
 */
function spread(ids: string[], want: Map<string, number | null>, gap: number, start = -Math.PI / 2, pinned: number[] = [], pinGap = gap): Map<string, number> {
  const TAU = 2 * Math.PI;
  const total = ids.length + pinned.length;
  const g = Math.min(gap, (TAU / Math.max(total, 1)) * 0.95);
  const free = ids.filter((id) => want.get(id) == null);
  const a = new Map<string, number>();
  if (free.length === ids.length && !pinned.length) {
    [...ids].sort().forEach((id, i) => a.set(id, start + (i * TAU) / ids.length));
    return a;
  }
  ids.forEach((id) => {
    const w = want.get(id);
    if (w != null) a.set(id, w);
  });
  free.forEach((id, i) => a.set(id, Math.PI / 2 + (i - (free.length - 1) / 2) * g));
  const norm = (x: number) => ((x % TAU) + TAU) % TAU;
  if (!pinned.length && ids.length * gap >= TAU * 0.95) {
    const order = [...ids].sort((x, y) => norm(a.get(x)!) - norm(a.get(y)!) || x.localeCompare(y));
    const step = TAU / ids.length;
    const rot = meanAngle(order.map((id, i) => a.get(id)! - i * step)) ?? start;
    order.forEach((id, i) => a.set(id, rot + i * step));
    return a;
  }
  const pins = pinned.map((_, i) => `\u0000pin${i}`);
  pins.forEach((p, i) => a.set(p, pinned[i]));
  const isPin = (id: string) => id.startsWith("\u0000pin");
  for (const id of [...ids, ...pins]) a.set(id, norm(a.get(id)!));
  const all = [...ids, ...pins];
  for (let pass = 0; pass < 200; pass++) {
    const order = [...all].sort((x, y) => a.get(x)! - a.get(y)! || x.localeCompare(y));
    let moved = false;
    for (let i = 0; i < order.length && order.length > 1; i++) {
      const cur = order[i];
      const next = order[(i + 1) % order.length];
      let d = a.get(next)! - a.get(cur)!;
      if (i === order.length - 1) d += TAU;
      const minGap = isPin(cur) || isPin(next) ? Math.max(g, Math.min(pinGap, (TAU / Math.max(total, 1)) * 1.5)) : g;
      if (d >= minGap - 1e-9) continue;
      const need = minGap - d;
      if (isPin(cur) && isPin(next)) continue;
      if (isPin(cur)) a.set(next, norm(a.get(next)! + need));
      else if (isPin(next)) a.set(cur, norm(a.get(cur)! - need));
      else {
        a.set(cur, norm(a.get(cur)! - need / 2));
        a.set(next, norm(a.get(next)! + need / 2));
      }
      moved = true;
    }
    if (!moved) break;
  }
  pins.forEach((p) => a.delete(p));
  return a;
}

/**
 * Place the visible nodes on rings around (cx, cy) with outer radius `r`.
 * Agents are spaced evenly; everything else settles near the agents it
 * connects to, so related things sit together.
 */
export function layout(m: AgentMap, visible: Set<string>, cx: number, cy: number, r: number): Map<string, Placed> {
  const list = (kinds: MapKind[], pred: (n: MapNode) => boolean = () => true) =>
    [...m.nodes.values()].filter((n) => visible.has(n.id) && kinds.includes(n.kind) && pred(n)).map((n) => n.id);
  const angle = new Map<string, number>();
  const agents = list(["ai_tool"]).sort((a, b) => {
    const x = m.nodes.get(a)!;
    const y = m.nodes.get(b)!;
    return (x.vendor ?? "").localeCompare(y.vendor ?? "") || x.name.localeCompare(y.name);
  });
  // Half a step off the top, so no agent's label sits on the boundary's caption.
  const step = (2 * Math.PI) / Math.max(agents.length, 1);
  agents.forEach((id, i) => angle.set(id, -Math.PI / 2 + (agents.length > 1 ? step / 2 : 0) + i * step));
  // With one agent everything would lean the same way and pile up, so each ring shares the whole circle instead.
  const toward = (ids: string[]) => (agents.length < 2 ? null : meanAngle(ids.filter((x) => angle.has(x)).map((x) => angle.get(x)!)));

  const files = list(["ai_config_file"]);
  const fileWant = new Map(files.map((id) => [id, toward(out(m, id, "configures_tool").map((n) => n.id))]));
  spread(files, fileWant, 0.2, -Math.PI / 2 + 0.3).forEach((a, id) => angle.set(id, a));

  // Local MCP servers, local models and local providers (such as Ollama) sit inside the edge.
  const inner = list(["mcp_server", "local_model", "ai_provider"], (n) => !n.outside);
  const innerWant = new Map(
    inner.map((id) => [
      id,
      toward([...inc(m, id, "uses_mcp_server"), ...inc(m, id, "serves_model"), ...inc(m, id, "uses_provider")].map((n) => n.id)),
    ]),
  );
  spread(inner, innerWant, 0.15, -Math.PI / 2 + 0.6, agents.length > 1 ? agents.map((id) => angle.get(id)!) : [], 0.26).forEach((a, id) => angle.set(id, a));

  const outer = list(["mcp_server", "ai_provider"], (n) => n.outside);
  const outerWant = new Map(outer.map((id) => [id, toward([...inc(m, id, "uses_mcp_server"), ...inc(m, id, "uses_provider")].map((n) => n.id))]));
  spread(outer, outerWant, 0.15, -Math.PI / 2 + 0.9).forEach((a, id) => angle.set(id, a));

  const repos = list(["repository"]);
  const repoWant = new Map(
    repos.map((id) => [
      id,
      toward([...out(m, id, "contains").map((f) => f.id), ...m.work.filter((w) => w.repo === id).map((w) => w.agent)]),
    ]),
  );
  spread(repos, repoWant, repos.length > 1 ? (2 * Math.PI) / repos.length : 1).forEach((a, id) => angle.set(id, a));

  // Many projects need a wider middle ring to keep their names apart.
  const repoRing = Math.min(0.27, Math.max(RING.repo, 0.12 + 0.02 * repos.length));
  const ringOf = (n: MapNode) =>
    n.kind === "repository" ? repoRing : n.kind === "ai_config_file" ? RING.file : n.kind === "ai_tool" ? RING.agent : n.outside ? RING.out : RING.inner;
  const placed = new Map<string, Placed>();
  for (const id of visible) {
    const n = m.nodes.get(id);
    const a = angle.get(id);
    if (!n || a == null) continue;
    // A single project sits in the middle.
    const rr = n.kind === "repository" && repos.length === 1 ? 0 : ringOf(n) * r;
    placed.set(id, { id, angle: a, x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return placed;
}

// ----- briefing -----

export function formatTokens(t: number): string {
  if (t >= 1e9) return `${(t / 1e9).toFixed(1)}B`;
  if (t >= 1e6) return `${(t / 1e6).toFixed(t >= 1e8 ? 0 : 1)}M`;
  if (t >= 1e3) return `${Math.round(t / 1e3)}K`;
  return String(t);
}

/** The project an agent's briefing is about by default: where it worked most, else where it is set up. */
export function defaultProject(m: AgentMap, agent: string): string | null {
  const w = m.work.find((x) => x.agent === agent);
  if (w) return w.repo;
  for (const f of inc(m, agent, "configures_tool")) if (f.project && m.nodes.has(f.project)) return f.project;
  return null;
}

/**
 * What an agent would be told at the start of a session in a project:
 * runtimes, instructions it reads, MCP servers it can call (and which of
 * those leave the machine), and other agents set up there.
 */
export function briefing(m: AgentMap, agentId: string, repoId: string): string {
  const a = m.nodes.get(agentId);
  const p = m.nodes.get(repoId);
  if (!a || !p) return "";
  const lines = [`# Briefing: ${a.name} in ${p.name}`, "", `Project: ${p.path ?? p.name}`];
  const rts = m.runtimes.filter((r) => r.repo === repoId);
  if (rts.length) {
    const by = new Map<string, (string | null)[]>();
    for (const r of rts) by.set(r.runtime, [...(by.get(r.runtime) ?? []), r.version]);
    lines.push("", "Runtimes this project asks for:");
    for (const [name, vs] of by) {
      const versions = vs.filter(Boolean).join(", ");
      lines.push(`- ${name}${versions ? ` ${versions}` : ""}${vs.length > 1 ? `  (${vs.length} copies installed; check which one is active)` : ""}`);
    }
  }
  const files = inc(m, agentId, "configures_tool");
  const here = files.filter((f) => f.project === repoId);
  const global = files.filter((f) => !f.project);
  lines.push("", "Instructions you read here:");
  if (!here.length && !global.length) lines.push("- none found");
  for (const f of here) lines.push(`- ${f.path}`);
  for (const f of global) lines.push(`- ${f.path}  (applies everywhere)`);
  const mcps = out(m, agentId, "uses_mcp_server");
  lines.push("", "MCP servers you can call:");
  if (!mcps.length) lines.push("- none configured");
  for (const s of mcps)
    lines.push(`- ${s.name}: ${s.outside ? `remote, ${s.host ?? "unknown host"}  (data leaves this machine)` : `local${s.command ? `, ${s.command}` : ""}`}`);
  const others = new Set<string>();
  for (const f of out(m, repoId, "contains")) for (const t of out(m, f.id, "configures_tool")) if (t.id !== agentId) others.add(t.name);
  if (others.size) lines.push("", `Also set up in this project: ${[...others].join(", ")}`);
  const w = m.work.find((x) => x.repo === repoId && x.agent === agentId);
  if (w) lines.push("", `Your work here: ${formatTokens(w.tokens)} tokens over ${w.sessions} session${w.sessions === 1 ? "" : "s"}`);
  return lines.join("\n");
}

export const KIND_TITLE: Record<MapKind, string> = {
  repository: "Project",
  ai_config_file: "Instruction or config file",
  ai_tool: "Agent",
  mcp_server: "MCP server",
  local_model: "Local model",
  ai_provider: "Model provider",
};

export const isMapKind = (k: EntityKind): k is MapKind => (MAP_KINDS as EntityKind[]).includes(k);
