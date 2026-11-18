/**
 * DEMO DATA — README screenshots and the GIF only.
 *
 * A fictional developer Mac ("demo-mbp", user "dev") with eight projects of a
 * fictional GitHub org ("acme-labs") and several coding agents working across
 * them. Every value is synthetic and deterministic, so screenshots are the same
 * on every run and contain no data from a real machine. Never bundled into the app.
 */
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildDemoExtras, type DemoExtras } from "./demo-entities";

export async function installDemoIpc(page: Page): Promise<void> {
  // Passed as plain JSON; typed again inside (Playwright's argument typing cannot handle this shape).
  // The sidebar shows the version being documented, not a stale one.
  const appVersion: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  const payload: unknown = JSON.parse(JSON.stringify({ ...buildDemoExtras(Date.now()), appVersion }));
  await page.addInitScript((arg: unknown) => {
    const extras = arg as DemoExtras & { appVersion: string };
    const now = Date.now();
    const H = 3_600_000;
    const D = 24 * H;
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    const avail = <T,>(value: T) => ({ status: "available", value });
    const home = "/Users/dev";
    const code = `${home}/code`;

    // ---------- projects ----------
    type P = { name: string; lang: string; fw: string[]; size: number; dirty: [number, number, number]; last: number; runtime: string };
    const projects: P[] = [
      { name: "acme-web", lang: "TypeScript", fw: ["Next.js", "React"], size: 2.4 * GB, dirty: [1, 6, 2], last: 0.2, runtime: "node" },
      { name: "payments-api", lang: "Go", fw: [], size: 0.6 * GB, dirty: [0, 2, 0], last: 1.5, runtime: "go" },
      { name: "ml-pipeline", lang: "Python", fw: ["FastAPI", "PyTorch"], size: 7.8 * GB, dirty: [0, 12, 4], last: 0.6, runtime: "python" },
      { name: "design-system", lang: "TypeScript", fw: ["React", "Storybook"], size: 1.9 * GB, dirty: [0, 0, 0], last: 3, runtime: "node" },
      { name: "rust-indexer", lang: "Rust", fw: [], size: 4.2 * GB, dirty: [0, 0, 0], last: 9, runtime: "rust" },
      { name: "mobile-app", lang: "TypeScript", fw: ["React Native", "Expo"], size: 3.1 * GB, dirty: [0, 0, 0], last: 41, runtime: "node" },
      { name: "docs-site", lang: "TypeScript", fw: ["Astro"], size: 0.4 * GB, dirty: [0, 1, 0], last: 2, runtime: "node" },
      { name: "infra", lang: "HCL", fw: ["Terraform"], size: 0.1 * GB, dirty: [0, 3, 1], last: 96, runtime: "" },
    ];
    const remoteRef = (name: string) => ({ host: "github.com", owner: "acme-labs", name, path: `acme-labs/${name}`, is_github: true, web_url: `https://github.com/acme-labs/${name}` });
    const repoEntity = (p: P, i: number) => ({
      id: `repository:${code}/${p.name}`,
      kind: "repository",
      name: p.name,
      path: `${code}/${p.name}`,
      version: (0x1a2b3c4d5e + i * 7919).toString(16).slice(0, 12),
      source: "git",
      attributes: {
        scan_root: code,
        git_dir_kind: "directory",
        head: avail({ branch: i === 2 ? "feature/eval-harness" : "main", detached: false, unborn: false, commit_sha: "9f2c1e7a" + i, last_commit_at: now - p.last * D }),
        working_tree: avail({ clean: p.dirty.every((n) => n === 0), staged: p.dirty[0], modified: p.dirty[1], untracked: p.dirty[2], conflicted: 0 }),
        local_branches: avail(3 + (i % 4)),
        remotes: [{ name: "origin", url: `https://github.com/acme-labs/${p.name}.git`, credentials_redacted: false, parsed: remoteRef(p.name) }],
        primary_remote: remoteRef(p.name),
        manifests: p.lang === "Go" ? ["go.mod"] : p.lang === "Python" ? ["pyproject.toml", "uv.lock"] : p.lang === "Rust" ? ["Cargo.toml", "Cargo.lock"] : ["package.json", "pnpm-lock.yaml"],
        languages: [{ language: p.lang, files: 120 + i * 37 }],
        primary_language: p.lang,
        frameworks: p.fw,
        license: { spdx: "Apache-2.0", source: "LICENSE" },
        size_bytes: avail(p.size),
        clones_of_same_remote: 1,
      },
      first_seen: now - 30 * D,
      last_seen: now,
    });
    const repos = projects.map(repoEntity);
    const proj = (name: string) => repos.find((r) => r.name === name)!;
    const link = (name: string) => ({ id: proj(name).id, name, via: "working directory" });

    // ---------- telemetry ----------
    const perCore = [38, 31, 27, 22, 19, 16, 14, 12, 9, 7, 6, 4];
    const telemetry = () => ({
      taken_at: Date.now(),
      host: { hostname: "demo-mbp", os_name: "macOS", os_version: "15.6", kernel_version: "24.6.0", cpu_arch: "arm64", uptime_secs: 6 * 86_400 + 4 * 3600 },
      cpu: avail({ usage_percent: 23.4, per_core_percent: perCore, brand: "Apple M3 Pro", logical_cores: 12, physical_cores: 12, frequency_mhz: 4056 }),
      memory: avail({ total_bytes: 36 * GB, used_bytes: 29.1 * GB, available_bytes: 6.9 * GB, swap_total_bytes: 4 * GB, swap_used_bytes: 2.6 * GB }),
      load_average: avail({ one: 4.12, five: 3.86, fifteen: 3.41 }),
      disks: avail([
        { name: "Macintosh HD", mount_point: "/", file_system: "apfs", total_bytes: 994 * GB, available_bytes: 61 * GB, removable: false, read_only: true, kind: "ssd", system_volume: false },
        { name: "Data", mount_point: "/System/Volumes/Data", file_system: "apfs", total_bytes: 994 * GB, available_bytes: 61 * GB, removable: false, read_only: false, kind: "ssd", system_volume: true },
      ]),
      process_count: avail(648),
      top_by_memory: avail([
        { pid: 4210, name: "Cursor Helper (Renderer)", cpu_percent: avail(6.1), memory_bytes: 1.32 * GB, exe: null },
        { pid: 8121, name: "claude", cpu_percent: avail(3.4), memory_bytes: 0.61 * GB, exe: null },
        { pid: 9307, name: "python3.12", cpu_percent: avail(41.0), memory_bytes: 0.58 * GB, exe: null },
        { pid: 8402, name: "claude", cpu_percent: avail(1.2), memory_bytes: 0.48 * GB, exe: null },
        { pid: 7781, name: "next-server", cpu_percent: avail(2.0), memory_bytes: 0.44 * GB, exe: null },
        { pid: 9011, name: "codex", cpu_percent: avail(0.9), memory_bytes: 0.35 * GB, exe: null },
        { pid: 6620, name: "Slack Helper", cpu_percent: avail(0.4), memory_bytes: 0.31 * GB, exe: null },
        { pid: 6012, name: "storybook", cpu_percent: avail(0.1), memory_bytes: 0.31 * GB, exe: null },
      ]),
      top_by_cpu: avail([
        { pid: 9307, name: "python3.12", cpu_percent: avail(41.0), memory_bytes: 0.58 * GB, exe: null },
        { pid: 4210, name: "Cursor Helper (Renderer)", cpu_percent: avail(6.1), memory_bytes: 1.32 * GB, exe: null },
        { pid: 8121, name: "claude", cpu_percent: avail(3.4), memory_bytes: 0.61 * GB, exe: null },
        { pid: 7781, name: "next-server", cpu_percent: avail(2.0), memory_bytes: 0.44 * GB, exe: null },
        { pid: 312, name: "WindowServer", cpu_percent: avail(1.8), memory_bytes: 0.21 * GB, exe: null },
        { pid: 8402, name: "claude", cpu_percent: avail(1.2), memory_bytes: 0.48 * GB, exe: null },
        { pid: 9011, name: "codex", cpu_percent: avail(0.9), memory_bytes: 0.35 * GB, exe: null },
        { pid: 6620, name: "Slack Helper", cpu_percent: avail(0.4), memory_bytes: 0.31 * GB, exe: null },
      ]),
      gpu_utilisation: { status: "unavailable", reason: "macOS does not expose GPU utilisation without administrator rights" },
    });

    const counts = [
      ["repository", 8], ["remote_project", 8], ["application", 64], ["binary", 41], ["runtime", 9], ["package", 186],
      ["package_manager", 6], ["dependency", 1243], ["ai_tool", 6], ["ai_provider", 3], ["mcp_server", 7], ["ai_config_file", 14], ["local_model", 3],
    ].map(([kind, count]) => ({ kind, count }));
    const scan = (id: number, kind: string, ago: number, found: number) => ({ id, kind, status: "completed", started_at: now - ago - 40_000, finished_at: now - ago, entities_found: found, entities_removed: 0, issues: [] });

    // ---------- agents ----------
    let pid = 7000;
    const sp = (name: string, role: string, memMB: number, cwd: string, ports: number[] = [], command = name, cpu = 0.6) => ({
      pid: ++pid, start_time: 1_700_000_000 + pid, parent_pid: null, name, command, role, memory_bytes: memMB * MB, cpu_percent: cpu,
      ports: ports.map((port) => ({ address: "127.0.0.1", port })), cwd, run_time_secs: 3 * 3600 + pid, protected: null,
    });
    const session = (agent: string, label: string, project: string | null, cwd: string, host: string, rootMB: number, children: ReturnType<typeof sp>[], recognised = true, upH = 3) => {
      const root = { ...sp(agent === "claude-code" ? "claude" : agent.split(":").pop()!, "agent", rootMB, cwd, [], agent, 2.1), run_time_secs: Math.round(upH * 3600) };
      const ports = children.flatMap((c) => c.ports);
      const count = (r: string) => children.filter((c) => c.role === r).length;
      return {
        id: `${agent}:${root.pid}:${root.start_time}`, agent, label, recognised, root, cwd, project: project ? link(project) : null, host, children,
        total_memory_bytes: root.memory_bytes + children.reduce((n, c) => n + c.memory_bytes, 0),
        total_cpu_percent: 2.1 + children.reduce((n, c) => n + c.cpu_percent, 0),
        ports, mcp_servers: count("mcp_server"), dev_servers: count("dev_server"), nested_agents: count("agent"),
      };
    };
    const P = (n: string) => `${code}/${n}`;
    const sessions = [
      session("claude-code", "Claude Code", "acme-web", P("acme-web"), "Terminal", 612, [
        sp("node", "mcp_server", 64, P("acme-web"), [], "npx -y @modelcontextprotocol/server-github"),
        sp("node", "mcp_server", 58, P("acme-web"), [], "npx @playwright/mcp@latest"),
        sp("next-server", "dev_server", 448, P("acme-web"), [3000], "next dev --turbo", 2.0),
        sp("zsh", "shell", 6, P("acme-web")),
        sp("caffeinate", "keep_awake", 1, P("acme-web")),
      ], true, 5.2),
      session("app:Cursor", "Cursor", null, `${home}`, "Cursor", 1350, [
        sp("Cursor Helper: mcp-process", "mcp_server", 41, home, [], "Cursor Helper: mcp-process"),
        sp("node", "mcp_server", 37, home, [], "npx -y @upstash/context7-mcp"),
      ], false, 26),
      session("claude-code", "Claude Code", "payments-api", P("payments-api"), "iTerm2", 486, [
        sp("node", "mcp_server", 61, P("payments-api"), [], "npx -y @modelcontextprotocol/server-github"),
        sp("go", "dev_server", 96, P("payments-api"), [8080], "go run ./cmd/api", 0.8),
      ], true, 2.1),
      session("codex", "Codex CLI", "ml-pipeline", P("ml-pipeline"), "Ghostty", 352, [
        sp("python3.12", "dev_server", 590, P("ml-pipeline"), [8000], "uvicorn app.main:app --reload", 41),
        sp("python3.12", "watcher", 72, P("ml-pipeline"), [], "pytest --watch tests/"),
      ], true, 1.4),
      session("gemini-cli", "Gemini CLI", "docs-site", P("docs-site"), "Terminal", 214, [sp("node", "dev_server", 132, P("docs-site"), [4321], "astro dev")], true, 0.7),
      session("hermes", "Hermes Agent", null, `${home}/agents/support-bot`, "tmux", 188, [sp("node", "mcp_server", 44, `${home}/agents/support-bot`, [], "npx -y @modelcontextprotocol/server-slack")], true, 52),
    ];
    const leftovers = [
      { process: { ...sp("storybook", "dev_server", 318, P("design-system"), [6006], "storybook dev -p 6006"), run_time_secs: 4 * 3600 }, origin: "seen_in_session", agent_label: "Codex CLI", session_cwd: P("design-system"), project: link("design-system"), agent_exited_at: now - 47 * 60_000 },
      { process: { ...sp("node", "dev_server", 226, P("design-system"), [5173], "vite"), run_time_secs: 3 * 3600 }, origin: "seen_in_session", agent_label: "Claude Code", session_cwd: P("design-system"), project: link("design-system"), agent_exited_at: now - 2 * H },
      { process: { ...sp("node", "mcp_server", 52, P("rust-indexer"), [], "npx -y @modelcontextprotocol/server-filesystem"), run_time_secs: 9 * 3600 }, origin: "seen_in_session", agent_label: "Claude Code", session_cwd: P("rust-indexer"), project: link("rust-indexer"), agent_exited_at: now - 6 * H },
    ];
    const agentReport = () => ({
      taken_at: Date.now(),
      tracking_since: now - 9 * H,
      port_data_available: true,
      total_memory_bytes: sessions.reduce((n, s) => n + s.total_memory_bytes, 0),
      sessions,
      leftovers,
    });

    // ---------- token usage (30 days, deterministic) ----------
    const curve = [0.31, 0.42, 0.18, 0.12, 0.55, 0.61, 0.48, 0.39, 0.22, 0.15, 0.66, 0.72, 0.58, 0.44, 0.29, 0.2, 0.74, 0.81, 0.63, 0.52, 0.34, 0.27, 0.86, 0.92, 0.71, 0.64, 0.41, 0.33, 0.97, 1.0];
    const mix: [string, string, string, number][] = [
      ["claude-code", P("acme-web"), "claude-opus-5-5", 0.34],
      ["claude-code", P("payments-api"), "claude-sonnet-5-5", 0.19],
      ["codex", P("ml-pipeline"), "gpt-6-luna", 0.17],
      ["claude-code", P("design-system"), "claude-sonnet-5-5", 0.11],
      ["claude-code", P("rust-indexer"), "claude-opus-5-5", 0.09],
      ["hermes", `${home}/agents/support-bot`, "claude-haiku-5-5", 0.06],
      ["claude-code", P("docs-site"), "claude-haiku-5-5", 0.04],
    ];
    const price: Record<string, [number, number, number]> = { "claude-opus-5-5": [4, 20, 0.2], "claude-sonnet-5-5": [2, 10, 0.1], "claude-haiku-5-5": [0.1, 0.5, 0.01] };
    const cost = (m: string, t: { input: number; output: number; cache_write: number; cache_read: number }) => {
      const p = price[m];
      return p ? (t.input * p[0] + t.output * p[1] + t.cache_write * p[0] * 1.25 + t.cache_read * p[2]) / 1e6 : null;
    };
    const days: unknown[] = [];
    const usageSessions = new Map<string, { agent: string; cwd: string; model: string; tokens: { input: number; output: number; cache_write: number; cache_read: number; requests: number }; first: number; last: number }>();
    curve.forEach((c, i) => {
      const dayMs = now - (29 - i) * D;
      const day = new Date(dayMs).toISOString().slice(0, 10);
      const total = 30e6 + c * 260e6;
      for (const [agent, cwd, model, share] of mix) {
        const t = total * share;
        const tokens = { input: Math.round(t * 0.004), output: Math.round(t * 0.009), cache_write: Math.round(t * 0.05), cache_read: Math.round(t * 0.937), requests: Math.round(t / 360_000) };
        days.push({ day, agent, cwd, model, tokens, estimated_cost_usd: cost(model, tokens) });
        const key = `${agent}|${cwd}|${Math.floor(i / 6)}`;
        const s = usageSessions.get(key) ?? { agent, cwd, model, tokens: { input: 0, output: 0, cache_write: 0, cache_read: 0, requests: 0 }, first: dayMs, last: dayMs };
        for (const k of Object.keys(tokens) as (keyof typeof tokens)[]) s.tokens[k] += tokens[k];
        s.last = Math.min(dayMs + 5 * H, now - (agent === "claude-code" && cwd.endsWith("acme-web") ? 60_000 : 20 * 60_000));
        usageSessions.set(key, s);
      }
    });
    const usageReport = (windowDays = 30) => {
      const cutoff = new Date(now - (windowDays - 1) * D).toISOString().slice(0, 10);
      return {
        window_days: windowDays,
        files_read: 61,
        problems: [],
        sources: [
          { agent: "claude-code", path: `${home}/.claude/projects`, found: true },
          { agent: "codex", path: `${home}/.codex/sessions`, found: true },
          { agent: "hermes", path: `${home}/.hermes/state.db`, found: true },
        ],
        days: (days as { day: string }[]).filter((d) => d.day >= cutoff),
        sessions: [...usageSessions.entries()]
          .map(([key, s]) => {
            const c = cost(s.model, s.tokens);
            return { agent: s.agent, session_id: key, cwd: s.cwd, first_at: s.first, last_at: s.last, tokens: s.tokens, models: [{ model: s.model, tokens: s.tokens, estimated_cost_usd: c }], estimated_cost_usd: c, cost_partial: false };
          })
          .sort((a, b) => b.last_at - a.last_at),
      };
    };

    // ---------- insights ----------
    const insights = {
      generated_at: now,
      insights: [
        { id: "agent-leftovers", severity: "warning", area: "Agents", title: "3 processes left running by exited agents", detail: "Storybook (:6006) and Vite (:5173) in design-system and a filesystem MCP server, holding 596 MB and two ports.", action: { kind: "review", label: "Review stopping them", request: { type: "terminate_processes", targets: leftovers.map((l) => ({ pid: l.process.pid, start_time: l.process.start_time })) } } },
        { id: "memory", severity: "warning", area: "Memory", title: "Memory is nearly full", detail: "6.9 GB of 36.0 GB available, 2.6 GB swap in use. Coding-agent sessions hold 4.7 GB.", action: { kind: "open", route: "/agents", label: "See agent sessions" } },
        { id: "tokens-today", severity: "warning", area: "Tokens", title: "Token use today is 2.1× your recent daily average", detail: "290.0M tokens today (≈$107 at API list prices, plus models without price data); 7-day average 138.2M.", action: { kind: "open", route: "/usage", label: "Open Token Usage" } },
        { id: "security", severity: "warning", area: "Security", title: "2 critical or high security findings", detail: "Known vulnerabilities in installed packages or project dependencies.", action: { kind: "open", route: "/security", label: "Review findings" } },
        { id: "idle-uncommitted", severity: "info", area: "Repositories", title: "2 repositories with uncommitted work untouched for 30+ days", detail: "mobile-app, infra. Commit or stash it before cleaning up or switching machines.", action: { kind: "open", route: "/discovery", label: "Open repositories" } },
        { id: "ai-hygiene", severity: "info", area: "AI setup", title: "AI configuration could be tidied", detail: "2 instruction files no installed tool reads; 1 MCP server configured in more than one place.", action: { kind: "open", route: "/ai", label: "Open AI Ecosystem" } },
      ],
    };

    // ---------- disk ----------
    const cand = (path: string, category: string, gb: number, reason: string, eligible = true, blocked: string | null = null, project: string | null = null) => ({
      id: path, category, path, size_bytes: avail(gb * GB), last_modified: now - 6 * D, safety: "safe", reason, regenerate: "rebuilt by its tool on next use", project, eligible, blocked_by: blocked,
    });
    const candidates = [
      cand(`${P("rust-indexer")}/target`, "rust_target", 3.6, "Rust build output in rust-indexer", true, null, P("rust-indexer")),
      cand(`${P("ml-pipeline")}/.venv`, "python_venv", 2.9, "Python virtual environment in ml-pipeline", true, null, P("ml-pipeline")),
      cand(`${P("mobile-app")}/node_modules`, "node_modules", 1.8, "npm dependencies in mobile-app", true, null, P("mobile-app")),
      cand(`${home}/Library/Caches/ms-playwright`, "developer_cache", 1.4, "Playwright browsers (downloaded again on demand)"),
      cand(`${P("acme-web")}/node_modules`, "node_modules", 1.2, "pnpm dependencies in acme-web", true, null, P("acme-web")),
      cand(`${home}/.cache/huggingface/hub`, "model_cache", 6.7, "Hugging Face model cache"),
      cand(`${home}/Library/Caches/pnpm`, "package_cache", 0.9, "pnpm store cache"),
      cand(`${P("acme-web")}/.next`, "build_output", 0.6, "Next.js build output", true, null, P("acme-web")),
      cand(`${P("design-system")}/storybook-static`, "build_output", 0.3, "Storybook build", false, "contains files tracked by Git", P("design-system")),
    ];
    const eligible = candidates.filter((c) => c.eligible).reduce((n, c) => n + c.size_bytes.value, 0);
    const disk = {
      analysed_at: now - 20 * 60_000,
      candidates,
      totals: [],
      eligible_bytes: eligible,
      docker: avail({ rows: [{ kind: "Images", total: 23, active: 6, size: "14.2GB", reclaimable: "9.8GB (69%)" }, { kind: "Build Cache", total: 188, active: 0, size: "6.1GB", reclaimable: "6.1GB" }, { kind: "Local Volumes", total: 7, active: 3, size: "2.3GB", reclaimable: "0B" }], dangling_images: 4 }),
      issues: [],
    };

    // ---------- graph ----------
    const n = (id: string, kind: string, name: string, detail: string | null) => ({ id, kind, name, detail });
    const rt = (t: string, v: string) => n(`runtime:/opt/homebrew/bin/${t}`, "runtime", t === "node" ? "Node.js" : t === "python" ? "Python" : t === "go" ? "Go" : "Rust", v);
    const runtimes = { node: rt("node", "22.11.0"), python: rt("python", "3.12.7"), go: rt("go", "1.24.2"), rust: rt("rust", "1.94.1") };
    const deps = ["react", "next", "zod", "typescript", "vite", "fastapi", "pydantic", "torch", "tokio", "serde", "stripe-go"].map((d) => n(`dependency:${d}`, "dependency", d, ["fastapi", "pydantic", "torch"].includes(d) ? "PyPI" : ["tokio", "serde"].includes(d) ? "crates.io" : d === "stripe-go" ? "Go" : "npm"));
    const graphNodes = [
      ...repos.map((r) => n(r.id, "repository", r.name, r.attributes.primary_language)),
      ...Object.values(runtimes),
      ...deps,
      n("package:homebrew:openssl@3", "package", "openssl@3", "Homebrew"),
    ];
    let e = 0;
    const edge = (kind: string, from: string, to: string) => ({ id: `e${++e}`, kind, from_id: from, to_id: to, confidence: "verified", attributes: null });
    const uses: Record<string, string[]> = {
      "acme-web": ["react", "next", "zod", "typescript"], "design-system": ["react", "vite", "typescript"], "mobile-app": ["react", "zod", "typescript"], "docs-site": ["vite", "typescript"],
      "ml-pipeline": ["fastapi", "pydantic", "torch"], "rust-indexer": ["tokio", "serde"], "payments-api": ["stripe-go"],
    };
    const graphEdges = [
      ...projects.filter((p) => p.runtime).map((p) => edge("requires_runtime", proj(p.name).id, runtimes[p.runtime as keyof typeof runtimes].id)),
      ...Object.entries(uses).flatMap(([p, ds]) => ds.map((d) => edge("depends_on", proj(p).id, `dependency:${d}`))),
      edge("depends_on", runtimes.node.id, "package:homebrew:openssl@3"),
      edge("depends_on", runtimes.python.id, "package:homebrew:openssl@3"),
    ];
    const graph = { nodes: graphNodes, edges: graphEdges, truncated: false, center: null };

    // ---------- operator ----------
    const cleanupAnswer = {
      answer:
        "6 agent sessions are running, using 4.7 GB in total:\n- Cursor — 1.4 GB, 2 MCP\n- Claude Code (PID 7006) in acme-web — 1.2 GB, 2 MCP, 1 dev server, 5 child processes\n- Codex CLI (PID 7015) in ml-pipeline — 1.0 GB, 1 dev server, 2 child processes\n- Claude Code (PID 7012) in payments-api — 643 MB, 1 MCP, 1 dev server, 2 child processes\n- Gemini CLI (PID 7017) in docs-site — 346 MB, 1 dev server, 1 child process\n- Hermes Agent (PID 7019) in ~/agents/support-bot — 232 MB, 1 MCP, 1 child process\n\n3 processes are still running after their agent exited:\n- storybook (PID 7020), 318 MB — started by Codex CLI\n- node (PID 7021), 226 MB — started by Claude Code\n- node (PID 7022), 52 MB — started by Claude Code",
      steps: [
        { tool: "agent_sessions", arguments: {}, summary: "6 sessions, 3 left running", ok: true },
        { tool: "propose_action", arguments: { reason: "Stop 3 processes left running by exited agents" }, summary: "Stop 3 processes", ok: true },
      ],
      proposals: [{ request: { type: "terminate_processes", targets: leftovers.map((l) => ({ pid: l.process.pid, start_time: l.process.start_time })) }, title: "Stop 3 processes", can_execute: true, reason: "Stop 3 processes left running by exited agents" }],
      mode: "builtin",
      model: null,
      data_sent_to: null,
    };
    const plan = {
      token: "demo-token",
      request: { type: "terminate_processes", targets: [] },
      title: "Stop 3 processes",
      summary: "Send SIGTERM to 3 processes.",
      items: [
        { label: "storybook", detail: "PID 7020 · :6006 · started by Codex CLI in design-system", bytes: null, blocked: null },
        { label: "node (vite)", detail: "PID 7021 · :5173 · started by Claude Code in design-system", bytes: null, blocked: null },
        { label: "node (filesystem MCP server)", detail: "PID 7022 · started by Claude Code in rust-indexer", bytes: null, blocked: null },
      ],
      total_bytes: null,
      warnings: ["Each process is asked to exit. Unsaved work in a dev server or tool may be lost; a process that ignores the request keeps running (force quit stays a separate, per-process choice)."],
      can_execute: true,
      reversible: false,
      recovery: "Start the servers again the way they were started (for example `pnpm storybook`). AGASTHY does not restart them.",
      expires_in_secs: 600,
    };

    const responses: Record<string, unknown> = {
      app_info: {
        version: extras.appVersion,
        platform: { os: "macos", os_version: "15.6", arch: "aarch64", support_level: "implemented" },
        data_dir: `${home}/Library/Application Support/org.agasthy.desktop`,
        db_path: `${home}/Library/Application Support/org.agasthy.desktop/agasthy.db`,
        schema_version: 2,
        search_dirs: [{ path: "/opt/homebrew/bin", origin: "process_path" }],
        command_allowlist: ["git", "brew", "npm", "pnpm", "uv", "python3", "cargo", "lsof", "docker"],
      },
      gpus: avail([{ model: "Apple M3 Pro", vendor: "Apple", cores: 18, vram: null }]),
      overview: {
        counts,
        recent: repos.slice(0, 6),
        latest_scans: [scan(1, "repositories", 2 * H, 8), scan(2, "software", 3 * H, 121), scan(3, "packages", 3 * H, 192), scan(4, "ai", 2 * H, 33), scan(5, "security", 20 * H, 9)],
        scan_roots: 1,
        dirty_repositories: 4,
        duplicate_clone_links: 0,
        binaries_installed_by_package: 27,
        relationship_counts: [{ kind: "depends_on", count: 1310 }, { kind: "requires_runtime", count: 7 }, { kind: "origin_remote", count: 8 }],
      },
      list_scan_roots: [{ id: 1, path: code, enabled: true, max_depth: 6, added_at: now - 30 * D }],
      running_scans: [],
      list_scans: [],
      list_audit: [],
      list_entities: repos,

      graph_overview: graph,
      graph_neighborhood: { ...graph, center: repos[0].id },
      shared_dependencies: [
        ["typescript", "npm", 4], ["react", "npm", 3], ["zod", "npm", 2], ["vite", "npm", 2], ["pydantic", "PyPI", 1],
      ].map(([d, eco, count]) => ({ dependency: { id: `dependency:${d}`, kind: "dependency", name: d, path: null }, ecosystem: eco, projects: count })),

      processes: { taken_at: now, processes: extras.processes, ports: avail(extras.processes.filter((p) => p.ports.length).length), own_pid: 1 },
      removal_impact: extras.removalImpact,
      snapshot_compare: extras.snapshotDiff,
      snapshot_reconstruction: extras.reconstruction,
      cached_disk_analysis: disk,
      disk_analysis: disk,
      quarantine_list: [],
      plan_action: plan,
      insights,
      agent_worktrees: {
        repos_checked: 8,
        problems: [],
        worktrees: [
          { repo_id: proj("acme-web").id, repo_name: "acme-web", path: `${P("acme-web")}/.claude/worktrees/fix-checkout-race`, branch: "fix/checkout-race", head: "4be1a09c2f17", locked: false, prunable: false, created_by: "Claude Code", changed_files: 4, active_agents: ["Claude Code"], modified_at: now - 12 * 60_000 },
          { repo_id: proj("payments-api").id, repo_name: "payments-api", path: `${home}/.codex/worktrees/a41f/payments-api`, branch: "feat/retry-backoff", head: "c09d2e11ab43", locked: false, prunable: false, created_by: "Codex", changed_files: 0, active_agents: [], modified_at: now - 5 * H },
          { repo_id: proj("ml-pipeline").id, repo_name: "ml-pipeline", path: `${code}/ml-pipeline-eval`, branch: "feature/eval-harness", head: "77aa0d3e91c2", locked: false, prunable: false, created_by: null, changed_files: 12, active_agents: [], modified_at: now - 2 * D },
          { repo_id: proj("rust-indexer").id, repo_name: "rust-indexer", path: `${P("rust-indexer")}/.claude/worktrees/simd-tokenizer`, branch: "perf/simd-tokenizer", head: "e5f0b27d8a10", locked: false, prunable: true, created_by: "Claude Code", changed_files: null, active_agents: [], modified_at: null },
        ],
      },
      scan_schedule: { auto_refresh: true, refresh_after_hours: 24, kinds: ["packages", "software", "repositories", "ai"] },
      operator_settings: {
        presets: [
          { id: "ollama", name: "Ollama (local)", kind: "openai_compatible", base_url: "http://127.0.0.1:11434/v1", default_model: "llama3.2", needs_key: false },
          { id: "anthropic", name: "Anthropic", kind: "anthropic", base_url: "https://api.anthropic.com", default_model: "claude-opus-5-5", needs_key: true },
        ],
        provider: null,
        provider_is_local: false,
        has_key: false,
        cloud_consent: false,
        suggestions: ["What are my coding agents doing?", "Clean up after my agents", "What is using my RAM?", "Free 10 GB safely", "Which repositories have I not touched in 90 days?", "Which MCP servers are configured?"],
      },
      security_settings: extras.security,
      labs_list: [],
      snapshots_list: extras.snapshots,
    };

    window.__AGASTHY_TEST_IPC__ = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
      if (cmd === "telemetry") return telemetry() as T;
      if (cmd === "agent_report") return agentReport() as T;
      if (cmd === "agent_usage") return usageReport((args?.windowDays as number) ?? 30) as T;
      if (cmd === "operator_ask") {
        await new Promise((r) => setTimeout(r, 700));
        return cleanupAnswer as T;
      }
      if (cmd === "list_entities") {
        const q = (args?.query ?? {}) as { kind?: string | null };
        if (!q.kind || q.kind === "repository") return repos as T;
        return (extras.byKind[q.kind as keyof typeof extras.byKind] ?? []) as T;
      }
      if (cmd === "list_edges") return extras.edges.filter((e) => e.kind === args?.kind) as T;
      if (cmd === "entity_detail") {
        const all = [...repos, ...Object.values(extras.byKind).flat()] as { id: string; path: string | null; source: string }[];
        const entity = all.find((x) => x.id === args?.id) ?? repos[0];
        const evidence = [
          { id: 1, kind: "observed", detail: entity.path ? `found at ${entity.path}` : "found during scan", source: entity.source, confidence: "verified", observed_at: now - 2 * H },
        ];
        return { entity, evidence, outgoing: [], incoming: [] } as T;
      }
      if (cmd in responses) return responses[cmd] as T;
      throw `demo: no data for ${cmd}`;
    };
  }, payload);
}
