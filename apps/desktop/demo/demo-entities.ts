/**
 * DEMO DATA (typed) — the rest of the synthetic demo machine: applications,
 * tools and runtimes, packages, AI ecosystem, processes, security findings,
 * impact analysis and snapshots. Built in Node, checked against the app's
 * generated types, and passed into the page by demo-ipc.ts. Never bundled.
 */
import type {
  AiConfigFileAttrs,
  AiProviderAttrs,
  AiToolAttrs,
  BinaryAttrs,
  DependencyAttrs,
  Edge,
  Entity,
  EntityKind,
  EntityRef,
  FindingAttrs,
  InstalledApp,
  LocalModelAttrs,
  McpServerAttrs,
  PackageAttrs,
  PackageManagerAttrs,
  ProcessInfo,
  ReconstructionPlan,
  RemovalImpact,
  SecuritySettings,
  SnapshotDiff,
  SnapshotSummary,
} from "@agasthy/shared-types";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const home = "/Users/dev";
const code = `${home}/code`;
const avail = <T>(value: T) => ({ status: "available" as const, value });

export interface DemoExtras {
  byKind: Partial<Record<EntityKind, Entity[]>>;
  edges: Edge[];
  processes: ProcessInfo[];
  removalImpact: RemovalImpact;
  snapshots: SnapshotSummary[];
  snapshotDiff: SnapshotDiff;
  reconstruction: ReconstructionPlan;
  security: SecuritySettings;
}

export function buildDemoExtras(now: number): DemoExtras {
  const D = 86_400_000;
  const entity = (kind: EntityKind, id: string, name: string, attributes: unknown, extra: Partial<Entity> = {}): Entity => ({
    id,
    kind,
    name,
    path: null,
    version: null,
    source: "demo",
    attributes: attributes as Entity["attributes"],
    first_seen: now - 30 * D,
    last_seen: now,
    ...extra,
  });

  // ---------- applications ----------
  const apps: [string, string, string, string][] = [
    ["Cursor", "com.todesktop.230313mzl4w4u92", "1.9.2", "/Applications"],
    ["Visual Studio Code", "com.microsoft.VSCode", "1.106.0", "/Applications"],
    ["Ghostty", "com.mitchellh.ghostty", "1.2.3", "/Applications"],
    ["iTerm", "com.googlecode.iterm2", "3.6.4", "/Applications"],
    ["Docker", "com.docker.docker", "4.52.0", "/Applications"],
    ["Claude", "com.anthropic.claudefordesktop", "1.4.1", "/Applications"],
    ["ChatGPT", "com.openai.chat", "1.2026.310", "/Applications"],
    ["LM Studio", "ai.elementlabs.lmstudio", "0.3.31", "/Applications"],
    ["Ollama", "com.electron.ollama", "0.12.10", "/Applications"],
    ["Zed", "dev.zed.Zed", "0.211.4", "/Applications"],
    ["Postman", "com.postmanlabs.mac", "11.70.1", "/Applications"],
    ["TablePlus", "com.tinyapp.TablePlus", "6.7.2", "/Applications"],
    ["Raycast", "com.raycast.macos", "1.103.4", "/Applications"],
    ["Linear", "com.linear", "1.33.0", "/Applications"],
    ["Figma", "com.figma.Desktop", "125.9.8", "/Applications"],
    ["Xcode", "com.apple.dt.Xcode", "26.1", "/Applications"],
  ];
  const applications = apps.map(([name, bundle, version, dir]) => {
    const a: InstalledApp = { name, path: `${dir}/${name}.app`, bundle_id: bundle, version, build: null, location: "machine", metadata_source: "Contents/Info.plist" };
    return entity("application", `application:${a.path}`, name, a, { path: a.path, version, source: "software" });
  });

  // ---------- CLI tools & runtimes ----------
  type B = [tool: string, display: string, category: BinaryAttrs["category"], version: string, dir: string, active: boolean, installer: string | null, kind: "runtime" | "binary"];
  const bins: B[] = [
    ["node", "Node.js", "runtime", "22.11.0", "/opt/homebrew/bin", true, "Homebrew (node)", "runtime"],
    ["node", "Node.js", "runtime", "20.18.1", `${home}/.nvm/versions/node/v20.18.1/bin`, false, "nvm", "runtime"],
    ["python3", "Python", "runtime", "3.12.7", "/opt/homebrew/bin", true, "Homebrew (python@3.12)", "runtime"],
    ["python3", "Python", "runtime", "3.9.6", "/usr/bin", false, "macOS (Xcode CLT)", "runtime"],
    ["go", "Go", "runtime", "1.24.2", "/opt/homebrew/bin", true, "Homebrew (go)", "runtime"],
    ["rustc", "Rust", "runtime", "1.94.1", `${home}/.cargo/bin`, true, "rustup", "runtime"],
    ["bun", "Bun", "runtime", "1.3.2", `${home}/.bun/bin`, true, "bun installer", "runtime"],
    ["git", "Git", "version_control", "2.52.0", "/opt/homebrew/bin", true, "Homebrew (git)", "binary"],
    ["gh", "GitHub CLI", "version_control", "2.83.0", "/opt/homebrew/bin", true, "Homebrew (gh)", "binary"],
    ["docker", "Docker CLI", "container", "28.5.1", "/usr/local/bin", true, "Docker Desktop", "binary"],
    ["kubectl", "kubectl", "cloud", "1.34.2", "/opt/homebrew/bin", true, "Homebrew (kubernetes-cli)", "binary"],
    ["terraform", "Terraform", "cloud", "1.13.4", "/opt/homebrew/bin", true, "Homebrew (hashicorp/tap/terraform)", "binary"],
    ["pnpm", "pnpm", "package_manager", "10.20.0", "/opt/homebrew/bin", true, "Homebrew (pnpm)", "binary"],
    ["uv", "uv", "package_manager", "0.9.8", `${home}/.local/bin`, true, "uv installer", "binary"],
    ["claude", "Claude Code", "ai_tool", "2.1.325", `${home}/.local/bin`, true, "native installer", "binary"],
    ["codex", "Codex CLI", "ai_tool", "0.62.0", "/opt/homebrew/bin", true, "Homebrew (codex)", "binary"],
    ["gemini", "Gemini CLI", "ai_tool", "0.18.1", "/opt/homebrew/bin", true, "npm (@google/gemini-cli)", "binary"],
    ["ollama", "Ollama", "ai_tool", "0.12.10", "/usr/local/bin", true, "Ollama.app", "binary"],
    ["psql", "PostgreSQL client", "database", "17.6", "/opt/homebrew/bin", true, "Homebrew (libpq)", "binary"],
  ];
  const binaries = bins.map(([tool, display, category, version, dir, active, installer, kind], i) => {
    const path = `${dir}/${tool}`;
    const a: BinaryAttrs = {
      tool,
      display_name: display,
      category,
      file_name: tool,
      directory: dir,
      directory_origin: "process_path",
      resolved_path: null,
      active,
      rank: active ? 0 : 1,
      shadowed_by: active ? null : bins.find((b) => b[0] === tool && b[5])?.[4] + `/${tool}`,
      version: avail(version),
      version_command: `${tool} --version`,
      install_hint: installer ? { installer, detail: `resolved from ${dir}` } : null,
    };
    return entity(kind, `${kind}:${path}`, display, a, { path, version, source: "software", first_seen: now - (40 - i) * D });
  });

  // ---------- packages & managers ----------
  type P = [name: string, manager: PackageAttrs["manager"], kind: string, version: string, description: string, onRequest: boolean | null];
  const pkgs: P[] = [
    ["openssl@3", "homebrew", "formula", "3.6.0", "Cryptography and SSL/TLS Toolkit", false],
    ["node", "homebrew", "formula", "22.11.0", "Platform built on V8 to build network applications", true],
    ["python@3.12", "homebrew", "formula", "3.12.7", "Interpreted, interactive, object-oriented programming language", true],
    ["go", "homebrew", "formula", "1.24.2", "Open source programming language", true],
    ["git", "homebrew", "formula", "2.52.0", "Distributed revision control system", true],
    ["gh", "homebrew", "formula", "2.83.0", "GitHub command-line tool", true],
    ["postgresql@17", "homebrew", "formula", "17.6", "Object-relational database system", true],
    ["redis", "homebrew", "formula", "8.2.2", "Persistent key-value database", true],
    ["ffmpeg", "homebrew", "formula", "8.0", "Play, record, convert, and stream audio and video", true],
    ["visual-studio-code", "homebrew", "cask", "1.106.0", "Open-source code editor", true],
    ["ghostty", "homebrew", "cask", "1.2.3", "Terminal emulator that uses platform-native UI", true],
    ["typescript", "npm", "global", "5.9.3", "TypeScript is a language for application scale JavaScript", null],
    ["vercel", "npm", "global", "48.10.0", "The command-line interface for Vercel", null],
    ["@google/gemini-cli", "npm", "global", "0.18.1", "Gemini CLI", null],
    ["ruff", "uv", "tool", "0.14.4", "An extremely fast Python linter and code formatter", null],
    ["pre-commit", "uv", "tool", "4.4.0", "A framework for managing multi-language pre-commit hooks", null],
    ["cargo-watch", "cargo", "crate", "8.5.3", "Watches over your Cargo project's source", null],
  ];
  const packages = pkgs.map(([name, manager, kind, version, description, onRequest]) => {
    const a: PackageAttrs = { manager, package_kind: kind, description, homepage: null, license: null, installed_on_request: onRequest, upstream: null, provides: [], install_path: null };
    return entity("package", `package:${manager}${kind === "cask" ? "-cask" : ""}:${name}`, name, a, { version, source: manager });
  });
  const mgr = (manager: PackageManagerAttrs["manager"], display: string, binary: string, version: string, count: number) => {
    const a: PackageManagerAttrs = { manager, display_name: display, state: { state: "read", binary, version }, package_count: count, inventory_command: null };
    return entity("package_manager", `package_manager:${manager}`, display, a, { path: binary, version });
  };
  const managers = [
    mgr("homebrew", "Homebrew", "/opt/homebrew/bin/brew", "4.6.20", 142),
    mgr("npm", "npm (global)", "/opt/homebrew/bin/npm", "10.9.0", 9),
    mgr("pnpm", "pnpm (global)", "/opt/homebrew/bin/pnpm", "10.20.0", 3),
    mgr("uv", "uv tools", `${home}/.local/bin/uv`, "0.9.8", 7),
    mgr("pip", "pip (default python3)", "/opt/homebrew/bin/python3", "25.2", 18),
    mgr("cargo", "cargo install", `${home}/.cargo/bin/cargo`, "1.94.1", 7),
  ];
  const deps = (
    [
      ["react", "npm", "19.2.0"],
      ["next", "npm", "16.0.3"],
      ["typescript", "npm", "5.9.3"],
      ["zod", "npm", "4.1.12"],
      ["vite", "npm", "7.2.2"],
      ["fastapi", "PyPI", "0.121.1"],
      ["pydantic", "PyPI", "2.12.4"],
      ["torch", "PyPI", "2.9.1"],
      ["tokio", "crates.io", "1.48.0"],
      ["serde", "crates.io", "1.0.228"],
      ["github.com/stripe/stripe-go/v83", "Go", "83.1.0"],
    ] as const
  ).map(([name, eco, version]) => {
    const a: DependencyAttrs = { ecosystem: eco, package: name };
    return entity("dependency", `dependency:${name}`, name, a, { version, source: "manifest" });
  });

  // ---------- AI ecosystem ----------
  const tool = (id: string, name: string, vendor: string, category: string, path: string, endpoint: string | null = null) => {
    const a: AiToolAttrs = {
      tool: id,
      vendor,
      category,
      installed: true,
      signals: [{ kind: category === "desktop_app" || category === "ide" ? "app_bundle" : "binary", path, detail: null }],
      local_endpoint: endpoint ? { address: endpoint, listening: true } : null,
    };
    return entity("ai_tool", `ai_tool:${id}`, name, a, { path, source: "ai" });
  };
  const aiTools = [
    tool("claude-code", "Claude Code", "Anthropic", "cli", `${home}/.local/bin/claude`),
    tool("codex", "Codex CLI", "OpenAI", "cli", "/opt/homebrew/bin/codex"),
    tool("gemini-cli", "Gemini CLI", "Google", "cli", "/opt/homebrew/bin/gemini"),
    tool("cursor", "Cursor", "Anysphere", "ide", "/Applications/Cursor.app"),
    tool("claude-desktop", "Claude (desktop app)", "Anthropic", "desktop_app", "/Applications/Claude.app"),
    tool("ollama", "Ollama", "Ollama", "local_inference", "/Applications/Ollama.app", "127.0.0.1:11434"),
    tool("lmstudio", "LM Studio", "Element Labs", "local_inference", "/Applications/LM Studio.app"),
    tool("hermes", "Hermes Agent", "Nous Research", "cli", `${home}/.local/bin/hermes`),
  ];
  const provider = (id: string, name: string, kind: string, highest: AiProviderAttrs["highest"], source: string, detail: string) => {
    const a: AiProviderAttrs = { provider: id, kind, highest, signals: [{ level: highest, source, detail }] };
    return entity("ai_provider", `ai_provider:${id}`, name, a, { source: "ai" });
  };
  const providers = [
    provider("anthropic", "Anthropic", "cloud", "credential_present", `${home}/.claude/.credentials.json`, "credential file present (not read)"),
    provider("openai", "OpenAI", "cloud", "credential_present", `${home}/.codex/auth.json`, "credential file present (not read)"),
    provider("google", "Google Gemini", "cloud", "configured", `${home}/.gemini/settings.json`, "selected in settings"),
    provider("ollama", "Ollama (local)", "local", "reachable", "127.0.0.1:11434", "listening"),
  ];
  const mcp = (server: string, transport: string, command: string | null, args: string[], config: string, toolName: string, envNames: string[] = [], disabled = false, url: string | null = null) => {
    const a: McpServerAttrs = {
      server,
      transport,
      command,
      args,
      url,
      env_names: envNames,
      config_file: config,
      tool: toolName,
      scope: "global",
      disabled,
      fingerprint: `${command ?? url}|${args.join(" ")}`,
    };
    return entity("mcp_server", `mcp:${config}#global#${server}`, server, a, { path: config, source: "ai" });
  };
  const mcpServers = [
    mcp("github", "stdio", "npx", ["-y", "@modelcontextprotocol/server-github"], `${home}/.claude.json`, "claude-code", ["GITHUB_PERSONAL_ACCESS_TOKEN"]),
    mcp("github", "stdio", "npx", ["-y", "@modelcontextprotocol/server-github"], `${home}/.cursor/mcp.json`, "cursor", ["GITHUB_PERSONAL_ACCESS_TOKEN"]),
    mcp("playwright", "stdio", "npx", ["@playwright/mcp@latest"], `${home}/.claude.json`, "claude-code"),
    mcp("context7", "stdio", "npx", ["-y", "@upstash/context7-mcp"], `${home}/.cursor/mcp.json`, "cursor"),
    mcp("linear", "http", null, [], `${home}/.claude.json`, "claude-code", [], false, "https://mcp.linear.app/mcp"),
    mcp("slack", "stdio", "npx", ["-y", "@modelcontextprotocol/server-slack"], `${home}/.hermes/config.yaml`, "hermes", ["SLACK_BOT_TOKEN"]),
    mcp("postgres", "stdio", "npx", ["-y", "@modelcontextprotocol/server-postgres", "<redacted>"], `${home}/.codex/config.toml`, "codex", [], true),
  ];
  const file = (path: string, type: string, scope: string, tools: string[], project: string | null, lines: number, headings: string[], opts: Partial<AiConfigFileAttrs> = {}) => {
    const a: AiConfigFileAttrs = {
      file_type: type,
      scope,
      tools,
      project,
      relative_path: project ? path.slice(project.length + 1) : path.replace(home, "~"),
      size_bytes: lines * 48,
      modified_at: now - (lines % 9) * D,
      sha256: (path.length * 7919).toString(16).padStart(64, "0"),
      lines,
      headings,
      text: null,
      text_truncated: false,
      redactions: 0,
      orphaned: false,
      duplicates: [],
      overlaps: [],
      directives: [],
      references: [],
      ...opts,
    };
    return entity("ai_config_file", `ai_file:${path}`, path.split("/").pop() ?? path, a, { path, source: "ai" });
  };
  const files = [
    file(`${home}/.claude/CLAUDE.md`, "instructions", "global", ["claude-code"], null, 64, ["Style", "Git", "Testing"]),
    file(`${home}/.codex/AGENTS.md`, "instructions", "global", ["codex"], null, 31, ["Conventions"]),
    file(`${code}/acme-web/CLAUDE.md`, "instructions", "project", ["claude-code"], `${code}/acme-web`, 88, ["Stack", "Commands", "Conventions"], {
      directives: [{ topic: "package_manager", value: "pnpm", line: 12, text: "Always use pnpm." }],
    }),
    file(`${code}/acme-web/AGENTS.md`, "instructions", "project", ["codex", "cursor", "gemini-cli"], `${code}/acme-web`, 74, ["Setup", "Commands"], {
      directives: [{ topic: "package_manager", value: "npm", line: 8, text: "Run npm install before tests." }],
    }),
    file(`${code}/payments-api/AGENTS.md`, "instructions", "project", ["codex", "cursor", "gemini-cli"], `${code}/payments-api`, 52, ["Go conventions", "Testing"]),
    file(`${code}/payments-api/CLAUDE.md`, "instructions", "project", ["claude-code"], `${code}/payments-api`, 52, ["Go conventions", "Testing"], {
      duplicates: [`${code}/payments-api/AGENTS.md`],
    }),
    file(`${code}/ml-pipeline/.cursor/rules/python.mdc`, "rules", "project", ["cursor"], `${code}/ml-pipeline`, 27, ["Python"]),
    file(`${code}/design-system/CLAUDE.md`, "instructions", "project", ["claude-code"], `${code}/design-system`, 45, ["Components", "Storybook"]),
    file(`${code}/infra/.github/copilot-instructions.md`, "instructions", "project", [], `${code}/infra`, 19, ["Terraform"], { orphaned: true }),
    file(`${code}/mobile-app/.windsurfrules`, "rules", "project", [], `${code}/mobile-app`, 23, ["Expo"], { orphaned: true }),
    file(`${home}/.claude/agents/code-reviewer.md`, "agent", "global", ["claude-code"], null, 38, ["Role", "Checklist"]),
    file(`${home}/.claude/skills/release/SKILL.md`, "skill", "global", ["claude-code"], null, 41, ["Release steps"]),
  ];
  const model = (store: string, name: string, tag: string, format: string, gb: number) => {
    const a: LocalModelAttrs = { store, model: name, tag, format, size_bytes: Math.round(gb * GB) };
    return entity("local_model", `local_model:${store}:${name}:${tag}`, `${name}:${tag}`, a, { source: "ai" });
  };
  const models = [
    model("ollama", "qwen2.5-coder", "7b", "gguf", 4.7),
    model("ollama", "llama3.2", "3b", "gguf", 2.0),
    model("ollama", "nomic-embed-text", "latest", "gguf", 0.27),
    model("lmstudio", "gpt-oss-20b", "mlx-4bit", "mlx", 11.3),
  ];
  let e = 0;
  const edge = (kind: Edge["kind"], from: string, to: string, attributes: unknown = null): Edge => ({ id: `de${++e}`, kind, from_id: from, to_id: to, confidence: "probable", attributes: attributes as Edge["attributes"] });
  const edges = [
    edge("potential_conflict", `ai_file:${code}/acme-web/CLAUDE.md`, `ai_file:${code}/acme-web/AGENTS.md`, { topic: "package_manager" }),
    edge("same_content", `ai_file:${code}/payments-api/CLAUDE.md`, `ai_file:${code}/payments-api/AGENTS.md`),
  ];
  // What the Agent Map draws: projects hold files, files configure agents,
  // agents call MCP servers and send to providers, local engines serve models.
  const strong = (kind: Edge["kind"], from: string, to: string): Edge => ({ ...edge(kind, from, to), confidence: "strong" });
  for (const f of files) {
    const a = f.attributes as unknown as AiConfigFileAttrs;
    if (a.project) edges.push({ ...edge("contains", `repository:${a.project}`, f.id), confidence: "verified" });
    for (const t of a.tools) edges.push(strong("configures_tool", f.id, `ai_tool:${t}`));
  }
  for (const s of mcpServers) edges.push(strong("uses_mcp_server", `ai_tool:${(s.attributes as unknown as McpServerAttrs).tool}`, s.id));
  const sends: [string, string][] = [
    ["claude-code", "anthropic"],
    ["claude-desktop", "anthropic"],
    ["codex", "openai"],
    ["cursor", "anthropic"],
    ["cursor", "openai"],
    ["gemini-cli", "google"],
    ["hermes", "anthropic"],
    ["hermes", "ollama"],
  ];
  for (const [t, p] of sends) edges.push(strong("uses_provider", `ai_tool:${t}`, `ai_provider:${p}`));
  for (const m of models) edges.push(strong("serves_model", `ai_tool:${(m.attributes as unknown as LocalModelAttrs).store}`, m.id));

  // ---------- security ----------
  const finding = (id: string, category: string, severity: FindingAttrs["severity"], summary: string, pkgs: string[], fixed: string[], remediation: string) => {
    const a: FindingAttrs = { category, finding_id: id, aliases: [], summary, severity, source: category === "vulnerability" ? "OSV.dev (demo data)" : "local check", packages: pkgs, fixed_versions: fixed, remediation, references: [], published: null };
    return entity("finding", `finding:${id}`, summary, a, { source: "security" });
  };
  const findings = [
    finding("DEMO-2026-0001", "vulnerability", "high", "Request smuggling in an HTTP parser used by acme-web", ["npm example-http-parser 2.1.0"], ["2.1.4"], "Upgrade to 2.1.4 or later (try it in Update Lab first)."),
    finding("DEMO-2026-0002", "vulnerability", "high", "Path traversal in an archive library used by ml-pipeline", ["PyPI example-archive 1.8.2"], ["1.8.5"], "Upgrade to 1.8.5 or later."),
    finding("outdated:openssl@3", "outdated", "medium", "openssl@3 3.6.0 → 3.6.1 available", ["openssl@3"], ["3.6.1"], "`brew upgrade openssl@3` (check Impact Analysis first: 2 runtimes depend on it)."),
    finding("outdated:git", "outdated", "low", "git 2.52.0 → 2.52.1 available", ["git"], ["2.52.1"], "`brew upgrade git`."),
    finding("outdated:node", "outdated", "low", "node 22.11.0 → 22.12.0 available", ["node"], ["22.12.0"], "`brew upgrade node`."),
    finding("provenance:/usr/local/bin/terraform-old", "provenance", "info", "terraform 1.5.7 in /usr/local/bin has no known installer", ["/usr/local/bin/terraform-old"], [], "Remove it if unused; Homebrew's terraform is active."),
  ];
  const security: SecuritySettings = {
    osv_enabled: true,
    preview: [],
    preview_total: 1243,
    last_report: { osv_enabled: true, sent_to_osv: 1243, eligible_for_osv: 1243, vulnerabilities: 2, outdated: 3, unknown_origin: 1, not_covered: [] },
  };

  // ---------- processes ----------
  let pid = 400;
  const proc = (name: string, memMB: number, cpu: number, kind: ProcessInfo["kind"], opts: Partial<ProcessInfo> = {}): ProcessInfo => ({
    pid: ++pid * 7,
    parent_pid: 1,
    name,
    exe: null,
    command: [name],
    cwd: null,
    cpu_percent: avail(cpu),
    memory_bytes: memMB * MB,
    start_time: 1_700_000_000 + pid,
    run_time_secs: 3600 * (pid % 30),
    status: "Run",
    kind,
    protected: null,
    ports: [],
    project: null,
    app_bundle: null,
    ...opts,
  });
  const port = (p: number) => [{ address: "127.0.0.1", port: p }];
  const link = (n: string) => ({ id: `repository:${code}/${n}`, name: n, via: "working directory" });
  const processes = [
    proc("Cursor Helper (Renderer)", 1350, 6.1, "application", { app_bundle: "/Applications/Cursor.app" }),
    proc("claude", 612, 3.4, "ai_tool", { project: link("acme-web"), cwd: `${code}/acme-web` }),
    proc("python3.12", 590, 41, "developer_server", { ports: port(8000), project: link("ml-pipeline"), command: ["uvicorn", "app.main:app", "--reload"] }),
    proc("claude", 486, 1.2, "ai_tool", { project: link("payments-api") }),
    proc("next-server", 448, 2.0, "developer_server", { ports: port(3000), project: link("acme-web") }),
    proc("codex", 352, 0.9, "ai_tool", { project: link("ml-pipeline") }),
    proc("storybook", 318, 0.1, "developer_server", { ports: port(6006), project: link("design-system") }),
    proc("Slack Helper", 310, 0.4, "application", { app_bundle: "/Applications/Slack.app" }),
    proc("postgres", 212, 0.3, "database", { ports: port(5432) }),
    proc("node", 226, 0.2, "developer_server", { ports: port(5173), project: link("design-system"), command: ["vite"] }),
    proc("WindowServer", 214, 1.8, "system", { protected: "essential system process", parent_pid: 1 }),
    proc("ollama", 188, 0.2, "ai_tool", { ports: port(11434) }),
    proc("redis-server", 24, 0.1, "database", { ports: port(6379) }),
    proc("com.docker.backend", 160, 0.6, "container", { app_bundle: "/Applications/Docker.app" }),
    proc("kernel_task", 12, 2.4, "system", { protected: "core operating-system process", pid: 0 }),
    proc("launchd", 18, 0.1, "system", { protected: "core operating-system process", pid: 1, parent_pid: null }),
  ];

  // ---------- impact ----------
  const ref = (id: string, kind: EntityKind, name: string, path: string | null = null): EntityRef => ({ id, kind, name, path });
  const removalImpact: RemovalImpact = {
    target: ref("package:homebrew:openssl@3", "package", "openssl@3"),
    risk: "high",
    summary: "4 Homebrew packages and 2 runtimes depend on openssl@3; 5 projects would stop working.",
    sections: [
      {
        title: "Packages that need it",
        entries: ["node", "python@3.12", "postgresql@17", "redis"].map((n) => ({ entity: ref(`package:homebrew:${n}`, "package", n), explanation: "linked against openssl@3 when installed", confidence: "verified" as const })),
      },
      {
        title: "Runtimes that depend on it",
        entries: [
          { entity: ref("runtime:/opt/homebrew/bin/node", "runtime", "Node.js 22.11.0", "/opt/homebrew/bin/node"), explanation: "provided by node, which needs openssl@3", confidence: "verified" as const },
          { entity: ref("runtime:/opt/homebrew/bin/python3", "runtime", "Python 3.12.7", "/opt/homebrew/bin/python3"), explanation: "provided by python@3.12, which needs openssl@3", confidence: "verified" as const },
        ],
      },
      {
        title: "Projects affected",
        entries: [
          ["acme-web", "breaks: requires node >=22, no other copy matches"],
          ["design-system", "falls back to Node.js 20.18.1 (nvm)"],
          ["docs-site", "falls back to Node.js 20.18.1 (nvm)"],
          ["mobile-app", "breaks: .nvmrc pins 22"],
          ["ml-pipeline", "breaks: requires-python >=3.12; /usr/bin/python3 is 3.9"],
        ].map(([n, why]) => ({ entity: ref(`repository:${code}/${n}`, "repository", n, `${code}/${n}`), explanation: why, confidence: "strong" as const })),
      },
    ],
    runtime_reports: [],
    unknowns: ["Programs started from scripts or IDEs that load OpenSSL dynamically are not visible."],
    plan: ["Do not uninstall: upgrade instead (`brew upgrade openssl@3`).", "If you must remove it, first move acme-web, mobile-app and ml-pipeline to runtimes that do not depend on it."],
    recovery: ["`brew install openssl@3`", "`brew reinstall node python@3.12`"],
  };

  // ---------- snapshots ----------
  const snapshots: SnapshotSummary[] = [
    { id: "snap-2026-11-14", name: "Before macOS update", created_at: now - 2 * D, hostname: "demo-mbp", counts: { application: 16, package: 186, repository: 8, runtime: 7, env_var: 41 }, path: `${home}/Library/Application Support/org.agasthy.desktop/snapshots/snap-2026-11-14.json` },
    { id: "snap-2026-10-01", name: "Fresh setup", created_at: now - 46 * D, hostname: "demo-mbp", counts: { application: 12, package: 151, repository: 6, runtime: 5, env_var: 37 }, path: `${home}/Library/Application Support/org.agasthy.desktop/snapshots/snap-2026-10-01.json` },
  ];
  const item = (section: string, name: string, version: string | null) => ({ section, key: `${section}:${name}`, name, version, details: {} });
  const snapshotDiff: SnapshotDiff = {
    from: "snap-2026-10-01",
    to: "now",
    added: [item("package", "ffmpeg", "8.0"), item("package", "redis", "8.2.2"), item("application", "LM Studio", "0.3.31"), item("repository", "rust-indexer", null)],
    removed: [item("package", "yarn", "1.22.22"), item("application", "Sublime Text", "4200")],
    changed: [
      { section: "runtime", key: "runtime:node", name: "Node.js", before: "22.9.0", after: "22.11.0" },
      { section: "package", key: "package:python@3.12", name: "python@3.12", before: "3.12.6", after: "3.12.7" },
    ],
  };
  const reconstruction: ReconstructionPlan = {
    snapshot: "snap-2026-11-14",
    steps: [
      { item: item("package", "postgresql@17", "17.6"), command: "brew install postgresql@17", note: null },
      { item: item("package", "typescript", "5.9.3"), command: "npm install --global typescript@5.9.3", note: null },
      { item: item("package", "ruff", "0.14.4"), command: "uv tool install ruff==0.14.4", note: null },
      { item: item("repository", "payments-api", null), command: "git clone https://github.com/acme-labs/payments-api.git ~/code/payments-api", note: null },
      { item: item("env_var", "GITHUB_PERSONAL_ACCESS_TOKEN", null), command: null, note: "Only the name was recorded; set the value yourself." },
    ],
    supported: 4,
    unsupported: 1,
  };

  return {
    byKind: {
      application: applications,
      runtime: binaries.filter((b) => b.kind === "runtime"),
      binary: binaries.filter((b) => b.kind === "binary"),
      package: packages,
      package_manager: managers,
      dependency: deps,
      ai_tool: aiTools,
      ai_provider: providers,
      mcp_server: mcpServers,
      ai_config_file: files,
      local_model: models,
      finding: findings,
    },
    edges,
    processes,
    removalImpact,
    snapshots,
    snapshotDiff,
    reconstruction,
    security,
  };
}
