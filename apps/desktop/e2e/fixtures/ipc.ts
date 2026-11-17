/**
 * DEVELOPMENT FIXTURE — automated tests only.
 *
 * A stand-in for the Tauri backend so UI tests can run in a browser. Every
 * value here is synthetic and labelled as such ("fixture-…", example.invalid);
 * it is never bundled into the application.
 */
import type { Page } from "@playwright/test";

export async function installFixtureIpc(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const now = Date.now();
    const avail = <T,>(value: T) => ({ status: "available", value });
    const repoAttrs = {
      scan_root: "/fixture/code",
      git_dir_kind: "directory",
      head: avail({ branch: "main", detached: false, unborn: false, commit_sha: "0123456789abcdef0123456789abcdef01234567", last_commit_at: now - 3600_000 }),
      working_tree: avail({ clean: false, staged: 0, modified: 2, untracked: 1, conflicted: 0 }),
      local_branches: avail(3),
      remotes: [{ name: "origin", url: "https://example.invalid/fixture/widget.git", credentials_redacted: false, parsed: null }],
      primary_remote: null,
      manifests: ["package.json"],
      languages: [{ language: "TypeScript", files: 12 }],
      primary_language: "TypeScript",
      frameworks: ["React"],
      license: { spdx: "Apache-2.0", source: "LICENSE" },
      size_bytes: avail(1048576),
      clones_of_same_remote: 1,
    };
    const repo = {
      id: "repository:/fixture/code/fixture-widget",
      kind: "repository",
      name: "fixture-widget",
      path: "/fixture/code/fixture-widget",
      version: "0123456789ab",
      source: "git",
      attributes: repoAttrs,
      first_seen: now - 60_000,
      last_seen: now,
    };
    const unavailableGpu = { status: "unavailable", reason: "fixture: not measured" };
    const responses: Record<string, unknown> = {
      app_info: {
        version: "0.0.0-fixture",
        platform: { os: "fixture-os", os_version: null, arch: "fixture-arch", support_level: "skeleton" },
        data_dir: "/fixture/data",
        db_path: "/fixture/data/agasthy.db",
        schema_version: 1,
        search_dirs: [{ path: "/fixture/bin", origin: "process_path" }],
        command_allowlist: ["git"],
      },
      telemetry: {
        taken_at: now,
        host: { hostname: "fixture-host", os_name: "FixtureOS", os_version: "1.0", kernel_version: null, cpu_arch: "fixture-arch", uptime_secs: 3600 },
        cpu: { status: "unavailable", reason: "collecting the first CPU sample" },
        memory: avail({ total_bytes: 8 * 1024 ** 3, used_bytes: 2 * 1024 ** 3, available_bytes: 6 * 1024 ** 3, swap_total_bytes: 0, swap_used_bytes: 0 }),
        load_average: { status: "unsupported", platform: "fixture-os" },
        disks: avail([]),
        process_count: avail(1),
        top_by_memory: avail([{ pid: 1, name: "fixture-process", cpu_percent: unavailableGpu, memory_bytes: 1024, exe: null }]),
        top_by_cpu: { status: "unavailable", reason: "collecting the first CPU sample" },
        gpu_utilisation: unavailableGpu,
      },
      gpus: unavailableGpu,
      overview: {
        counts: [
          { kind: "repository", count: 1 },
          { kind: "application", count: 0 },
          { kind: "binary", count: 0 },
          { kind: "runtime", count: 0 },
          { kind: "package", count: 0 },
          { kind: "package_manager", count: 0 },
          { kind: "remote_project", count: 0 },
        ],
        recent: [repo],
        latest_scans: [
          { id: 1, kind: "repositories", status: "completed", started_at: now - 5000, finished_at: now - 4000, entities_found: 1, entities_removed: 0, issues: [] },
          { id: 2, kind: "ai", status: "completed", started_at: now - 3000, finished_at: now - 2000, entities_found: 3, entities_removed: 0, issues: [] },
        ],
        scan_roots: 1,
        dirty_repositories: 1,
        duplicate_clone_links: 0,
        binaries_installed_by_package: 0,
      },
      list_scan_roots: [{ id: 1, path: "/fixture/code", enabled: true, max_depth: 6, added_at: now }],
      running_scans: [],
      list_scans: [],
      list_audit: [],
      entity_detail: {
        entity: repo,
        evidence: [{ id: 1, kind: "git_directory", detail: "`.git` directory present", source: "/fixture/code/fixture-widget/.git", confidence: "verified", observed_at: now }],
        outgoing: [],
        incoming: [],
      },
    };
    const runtime = {
      id: "runtime:/fixture/bin/node",
      kind: "runtime",
      name: "Node.js",
      path: "/fixture/bin/node",
      version: "22.0.0",
      source: "path",
      attributes: { tool: "node", display_name: "Node.js", category: "runtime", active: true, rank: 0, version: avail("22.0.0") },
      first_seen: now,
      last_seen: now,
    };
    const graphView = {
      nodes: [
        { id: repo.id, kind: "repository", name: "fixture-widget", detail: "TypeScript" },
        { id: runtime.id, kind: "runtime", name: "Node.js", detail: "22.0.0" },
        { id: "dependency:npm:fixture-lib", kind: "dependency", name: "fixture-lib", detail: "npm" },
      ],
      edges: [
        { id: "e1", kind: "requires_runtime", from_id: repo.id, to_id: runtime.id, confidence: "verified", attributes: null },
        { id: "e2", kind: "depends_on", from_id: repo.id, to_id: "dependency:npm:fixture-lib", confidence: "verified", attributes: null },
      ],
      truncated: false,
      center: null,
    };
    responses.graph_overview = graphView;
    responses.graph_neighborhood = { ...graphView, center: repo.id };
    responses.shared_dependencies = [];
    responses.runtime_impact = {
      target: { id: runtime.id, path: "/fixture/bin/node", version: "22.0.0", active: true, rank: 0 },
      runtime: "node",
      other_copies: [],
      items: [
        {
          project: { id: repo.id, kind: "repository", name: "fixture-widget", path: repo.path },
          requirements: ["package.json: >=20"],
          outcome: "breaks",
          explanation: "No other node is on PATH; the project could not run its node tooling.",
          fallback: null,
        },
      ],
      breaks: 1,
      falls_back: 0,
      unaffected: 0,
      unknown: 0,
      limitations: ["fixture limitation"],
    };
    const aiTool = {
      id: "ai_tool:fixture-assistant",
      kind: "ai_tool",
      name: "Fixture Assistant",
      path: "/fixture/bin/assistant",
      version: "1.0.0",
      source: "ai",
      attributes: {
        tool: "fixture-assistant",
        vendor: "Fixture Vendor",
        category: "cli",
        installed: true,
        signals: [{ kind: "binary", path: "/fixture/bin/assistant", detail: null }],
        local_endpoint: null,
      },
      first_seen: now,
      last_seen: now,
    };
    const fileAttrs = (name: string, text: string) => ({
      file_type: "instructions",
      scope: "project",
      tools: ["fixture-assistant"],
      project: "/fixture/code/fixture-widget",
      relative_path: name,
      size_bytes: 40,
      modified_at: now,
      sha256: "0".repeat(64),
      lines: 2,
      headings: ["Fixture"],
      text,
      text_truncated: false,
      redactions: 0,
      orphaned: false,
      duplicates: [],
      overlaps: [],
      directives: [],
      references: [],
    });
    const fileA = {
      id: "ai_file:/fixture/code/fixture-widget/AGENTS.md",
      kind: "ai_config_file",
      name: "AGENTS.md",
      path: "/fixture/code/fixture-widget/AGENTS.md",
      version: null,
      source: "ai",
      attributes: fileAttrs("AGENTS.md", "# Fixture\nUse fixture-pm for installs.\n"),
      first_seen: now,
      last_seen: now,
    };
    const fileB = { ...fileA, id: "ai_file:/fixture/home/GLOBAL.md", name: "GLOBAL.md", path: "/fixture/home/GLOBAL.md", attributes: { ...fileAttrs("GLOBAL.md", "x"), scope: "global", project: null } };
    // A second agent whose usage logs are read, a remote MCP server and a cloud provider, for the Agent Map.
    const cliAgent = {
      ...aiTool,
      id: "ai_tool:fixture-cli",
      name: "Fixture CLI",
      attributes: { ...aiTool.attributes, tool: "claude-code", vendor: "Fixture Vendor", category: "cli" },
    };
    const remoteMcp = {
      id: "mcp:/fixture/home/.fixture.json#global#fixture-remote",
      kind: "mcp_server",
      name: "fixture-remote",
      path: null,
      version: null,
      source: "ai",
      attributes: { server: "fixture-remote", transport: "http", command: null, args: [], url: "https://mcp.example.invalid/mcp", env_names: [], config_file: "/fixture/home/.fixture.json", tool: "claude-code", scope: "global", disabled: false, fingerprint: "url:https://mcp.example.invalid/mcp" },
      first_seen: now,
      last_seen: now,
    };
    const provider = {
      id: "ai_provider:fixture-cloud",
      kind: "ai_provider",
      name: "Fixture Cloud",
      path: null,
      version: null,
      source: "ai",
      attributes: { provider: "fixture-cloud", kind: "cloud", highest: "referenced", signals: [] },
      first_seen: now,
      last_seen: now,
    };
    const allEdges = [
      { id: "c1", kind: "potential_conflict", from_id: fileA.id, to_id: fileB.id, confidence: "probable", attributes: { topic: "package_manager" } },
      { id: "m1", kind: "contains", from_id: repo.id, to_id: fileA.id, confidence: "verified", attributes: null },
      { id: "m2", kind: "configures_tool", from_id: fileA.id, to_id: aiTool.id, confidence: "strong", attributes: null },
      { id: "m3", kind: "configures_tool", from_id: fileB.id, to_id: cliAgent.id, confidence: "strong", attributes: null },
      { id: "m4", kind: "uses_mcp_server", from_id: cliAgent.id, to_id: remoteMcp.id, confidence: "strong", attributes: null },
      { id: "m5", kind: "uses_provider", from_id: cliAgent.id, to_id: provider.id, confidence: "strong", attributes: null },
      { id: "m6", kind: "requires_runtime", from_id: repo.id, to_id: runtime.id, confidence: "verified", attributes: null },
    ];
    const candidate = {
      id: "/fixture/code/fixture-widget/node_modules",
      category: "node_modules",
      path: "/fixture/code/fixture-widget/node_modules",
      size_bytes: avail(5 * 1024 ** 2),
      last_modified: now - 86_400_000,
      safety: "safe",
      reason: "installed npm dependencies in fixture-widget",
      regenerate: "reinstall with your package manager",
      project: "/fixture/code/fixture-widget",
      eligible: true,
      blocked_by: null,
    };
    const tracked = { ...candidate, id: "/fixture/code/fixture-widget/dist", path: "/fixture/code/fixture-widget/dist", category: "build_output", eligible: false, blocked_by: "contains files tracked by Git" };
    responses.cached_disk_analysis = {
      analysed_at: now,
      candidates: [candidate, tracked],
      totals: [{ category: "node_modules", count: 1, bytes: 5 * 1024 ** 2, eligible_bytes: 5 * 1024 ** 2 }],
      eligible_bytes: 5 * 1024 ** 2,
      docker: { status: "unavailable", reason: "Docker is installed but its daemon is not running" },
      issues: [],
    };
    responses.quarantine_list = [];
    responses.plan_action = {
      token: "fixture-token",
      request: { type: "quarantine_paths", paths: [candidate.path] },
      title: "Move 1 item to quarantine",
      summary: "Each folder is moved into AGASTHY's quarantine.",
      items: [{ label: candidate.path, detail: "node_modules", bytes: 5 * 1024 ** 2, blocked: null }],
      total_bytes: 5 * 1024 ** 2,
      warnings: ["Disk space is freed only when you permanently delete the quarantined items."],
      can_execute: true,
      reversible: true,
      recovery: "Restore from Storage & Cleanup → Quarantine.",
      expires_in_secs: 600,
    };
    responses.execute_action = {
      title: "Moved 1 item to quarantine",
      outcome: "succeeded",
      message: "Delete them permanently from the Quarantine list to free the space, or restore them.",
      details: [],
      verification: "Each original path was confirmed gone.",
      recovery: "Restore from Storage & Cleanup → Quarantine.",
      bytes: 5 * 1024 ** 2,
      quarantine_op: "op-fixture",
    };
    const proc = (pid: number, name: string, protectedReason: string | null) => ({
      pid,
      parent_pid: 1,
      name,
      exe: `/fixture/bin/${name}`,
      command: [name],
      cwd: null,
      cpu_percent: avail(1.5),
      memory_bytes: 1024 ** 2,
      start_time: 1000 + pid,
      run_time_secs: 60,
      status: "Run",
      kind: protectedReason ? "system" : "developer_server",
      protected: protectedReason,
      ports: protectedReason ? [] : [{ address: "127.0.0.1", port: 3000 }],
      project: protectedReason ? null : { id: repo.id, name: "fixture-widget", via: "working directory" },
      app_bundle: null,
    });
    responses.processes = {
      taken_at: now,
      processes: [proc(4242, "fixture-server", null), proc(77, "fixture-system", "part of the operating system")],
      ports: avail(1),
      own_pid: 1,
    };
    responses.removal_impact = {
      target: { id: "package:homebrew:fixture-lib", kind: "package", name: "fixture-lib", path: null },
      risk: "high",
      summary: "Other installed software depends on fixture-lib.",
      sections: [
        {
          title: "Packages that need fixture-lib",
          entries: [{ entity: { id: "package:homebrew:fixture-app", kind: "package", name: "fixture-app", path: null }, explanation: "depends on it", confidence: "verified" }],
        },
      ],
      runtime_reports: [],
      unknowns: ["fixture unknown"],
      plan: ["Double-check with `brew uses --installed fixture-lib`."],
      recovery: ["`brew install fixture-lib`"],
    };
    responses.security_settings = {
      osv_enabled: false,
      preview: [{ entity_id: "package:npm:fixture-pkg", ecosystem: "npm", name: "fixture-pkg", version: "1.0.0" }],
      preview_total: 1,
      last_report: null,
    };
    responses.set_osv_enabled = null;
    responses.labs_list = [];
    responses.snapshots_list = [
      { id: "snap-1", name: "Fixture snapshot", created_at: now - 3600_000, hostname: "fixture-host", counts: { package: 1 }, path: "/fixture/data/snapshots/snap-1.json" },
    ];
    responses.snapshot_reconstruction = {
      snapshot: "snap-1",
      steps: [
        { item: { section: "package", key: "package:npm:fixture-pkg", name: "fixture-pkg", version: "1.0.0", details: {} }, command: "npm install --global fixture-pkg@1.0.0", note: null },
        { item: { section: "env_var", key: "FIXTURE_TOKEN", name: "FIXTURE_TOKEN", version: null, details: {} }, command: null, note: "Only the name was recorded; set the value yourself." },
      ],
      supported: 1,
      unsupported: 1,
    };
    const sp = (pid: number, name: string, role: string, mem: number, ports: number[] = []) => ({
      pid, start_time: 1000 + pid, parent_pid: 10, name, command: `fixture ${name}`, role, memory_bytes: mem, cpu_percent: 1,
      ports: ports.map((port) => ({ address: "127.0.0.1", port })), cwd: "/fixture/code/fixture-widget", run_time_secs: 3600, protected: null,
    });
    responses.agent_report = {
      taken_at: now,
      tracking_since: now - 600_000,
      port_data_available: true,
      total_memory_bytes: 600 * 1024 ** 2,
      sessions: [
        {
          id: "claude-code:10:1010", agent: "claude-code", label: "Claude Code", recognised: true, root: sp(10, "claude", "agent", 400 * 1024 ** 2),
          cwd: "/fixture/code/fixture-widget", project: { id: repo.id, name: "fixture-widget", via: "working directory" }, host: "Terminal",
          children: [sp(11, "rea mcp", "mcp_server", 50 * 1024 ** 2), sp(12, "vite", "dev_server", 150 * 1024 ** 2, [5173])],
          total_memory_bytes: 600 * 1024 ** 2, total_cpu_percent: 3, ports: [{ address: "127.0.0.1", port: 5173 }], mcp_servers: 1, dev_servers: 1, nested_agents: 0,
        },
      ],
      leftovers: [
        { process: sp(40, "next-server", "dev_server", 200 * 1024 ** 2, [3000]), origin: "seen_in_session", agent_label: "Codex CLI", session_cwd: "/fixture/code/other", project: null, agent_exited_at: now - 1_200_000 },
      ],
    };
    const today = new Date().toISOString().slice(0, 10);
    const tk = (input: number, output: number, cache_read: number, requests: number) => ({ input, output, cache_write: 0, cache_read, requests });
    responses.agent_usage = {
      window_days: 30,
      files_read: 2,
      problems: [],
      sources: [{ agent: "claude-code", path: "/fixture/home/.claude/projects", found: true }],
      sessions: [
        {
          agent: "claude-code", session_id: "fixture-session", cwd: "/fixture/code/fixture-widget", first_at: now - 3_000_000, last_at: now,
          tokens: tk(1000, 50_000, 2_000_000, 120), models: [{ model: "claude-opus-5-5", tokens: tk(1000, 50_000, 2_000_000, 120), estimated_cost_usd: 1.4 }],
          estimated_cost_usd: 1.4, cost_partial: false,
        },
      ],
      days: [{ day: today, agent: "claude-code", cwd: "/fixture/code/fixture-widget", model: "claude-opus-5-5", tokens: tk(1000, 50_000, 2_000_000, 120), estimated_cost_usd: 1.4 }],
    };
    responses.agent_worktrees = {
      repos_checked: 1,
      problems: [],
      worktrees: [
        { repo_id: repo.id, repo_name: "fixture-widget", path: "/fixture/code/fixture-widget/.claude/worktrees/fix-login", branch: "fix-login", head: "abc123", locked: false, prunable: false, created_by: "Claude Code", changed_files: 3, active_agents: [], modified_at: now - 7_200_000 },
      ],
    };
    responses.insights = {
      generated_at: now,
      insights: [
        {
          id: "agent-leftovers", severity: "warning", area: "Agents", title: "1 process left running by exited agents", detail: "fixture: a dev server holding 200 MB.",
          action: { kind: "review", label: "Review stopping them", request: { type: "terminate_processes", targets: [{ pid: 40, start_time: 1040 }] } },
        },
        { id: "tokens-today", severity: "info", area: "Tokens", title: "Agents used 2.1M tokens today", detail: "fixture", action: { kind: "open", route: "/usage", label: "Open Token Usage" } },
        { id: "stale-packages", severity: "info", area: "Freshness", title: "Package data is 9 days old", detail: "fixture", action: { kind: "scan", scan: "packages", label: "Scan now" } },
      ],
    };
    responses.diagnostics_report = "### Environment\n\n- AGASTHY 0.0.0-fixture\n- macOS 15.6 (aarch64), Apple M3, 16 GB memory\n\n### Recent diagnostics log\n\n```text\n(empty)\n```\n";
    responses.export_usage_csv = "~/Downloads/agasthy-token-usage-30d.csv";
    responses.scan_schedule = { auto_refresh: true, refresh_after_hours: 24, kinds: ["packages", "software", "repositories", "ai"] };
    responses.operator_settings = {
      presets: [
        { id: "ollama", name: "Ollama (local)", kind: "openai_compatible", base_url: "http://127.0.0.1:11434/v1", default_model: "fixture-model", needs_key: false },
        { id: "anthropic", name: "Anthropic", kind: "anthropic", base_url: "https://api.example.invalid", default_model: "fixture-model", needs_key: true },
      ],
      provider: null,
      provider_is_local: false,
      has_key: false,
      cloud_consent: false,
      suggestions: ["Free 10 GB safely", "What is using my RAM?"],
    };
    responses.operator_ask = {
      answer: "fixture: 1.0 GB of regenerable folders passed the safety checks.",
      steps: [{ tool: "disk_cleanup_candidates", arguments: {}, summary: "1 candidates", ok: true }],
      proposals: [
        { request: { type: "quarantine_paths", paths: ["/fixture/code/fixture-widget/node_modules"] }, title: "Move 1 item to quarantine", can_execute: true, reason: "fixture reason" },
      ],
      mode: "builtin",
      model: null,
      data_sent_to: null,
    };
    const byKind: Record<string, unknown[]> = {
      repository: [repo],
      ai_tool: [aiTool, cliAgent],
      ai_config_file: [fileA, fileB],
      mcp_server: [remoteMcp],
      ai_provider: [provider],
      runtime: [runtime],
    };
    window.__AGASTHY_TEST_IPC__ = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
      if (cmd === "list_edges") return allEdges.filter((e) => e.kind === args?.kind) as T;
      if (cmd === "list_entities") {
        const q = (args?.query ?? {}) as { kind?: string | null };
        return (q.kind ? (byKind[q.kind] ?? []) : [repo]) as T;
      }
      if (cmd === "entity_detail" && args?.id === fileA.id) {
        return { entity: fileA, evidence: [], outgoing: [], incoming: [] } as T;
      }
      if (cmd === "entity_detail" && args?.id === runtime.id) {
        return { entity: runtime, evidence: [], outgoing: [], incoming: [] } as T;
      }
      if (cmd === "open_issue") {
        (window as unknown as { __lastIssue?: unknown }).__lastIssue = args;
        return null as T;
      }
      if (cmd in responses) return responses[cmd] as T;
      throw `fixture: no response for ${cmd}`;
    };
  });
}
