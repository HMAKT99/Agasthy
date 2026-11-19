import type { DiskSample, Entity, EntityKind, KindCount, ProcessSample, ScanKind, ScanRecord, TelemetrySnapshot } from "@agasthy/shared-types";
import { Badge, Button, Meter, StateView } from "@agasthy/ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { InsightsPanel } from "../components/insights-panel";
import { ArrowRight, FolderPlus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Avail } from "../components/availability";
import { PageHeader, Panel, Stat } from "../components/page";
import { SCAN_LABELS, progressLabel, useScanActivity } from "../components/scan-activity";
import { formatBytes, formatDuration, formatNumber, formatPercent, formatRelative, shortenHome, unavailableReason, value } from "../lib/format";
import { errorMessage } from "../lib/ipc";
import { useGpus, useOsWords, useOverview, useTelemetry } from "../lib/queries";
import { KIND_LABEL, tabForKind } from "./discovery";

export function OverviewPage() {
  const overview = useOverview();
  const telemetry = useTelemetry();
  const activity = useScanActivity();
  const host = telemetry.data?.host;
  const inventoryRunning = activity.running.size > 0;
  const hasRoots = (overview.data?.scan_roots ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={
          host
            ? [host.hostname, [host.os_name, host.os_version].filter(Boolean).join(" "), host.uptime_secs ? `up ${formatDuration(host.uptime_secs)}` : null]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void (hasRoots ? activity.startAll() : activity.startInventory())}
            disabled={inventoryRunning}
            title={hasRoots ? "Packages, then applications and tools, then your project folders" : "Packages, then applications and tools"}
          >
            <RefreshCw className={inventoryRunning ? "animate-spin" : ""} aria-hidden />
            {inventoryRunning ? "Scanning…" : hasRoots ? "Scan everything" : "Scan installed software"}
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-5">
        {/* First thing a new user sees: one click to look at the machine. */}
        {overview.data && overview.data.latest_scans.length === 0 ? <FirstRun hasRoots={hasRoots} /> : null}
        <InsightsPanel />
        <ResourcesPanel telemetry={telemetry.data} error={telemetry.error} />
        {overview.isLoading ? (
          <StateView kind="loading" title="Reading AGASTHY's database" compact />
        ) : overview.error ? (
          <StateView kind="error" title="Could not read discovery data" description={errorMessage(overview.error)} />
        ) : overview.data ? (
          <>
            <EnvironmentPanel counts={overview.data.counts} dirty={overview.data.dirty_repositories} dupes={overview.data.duplicate_clone_links} roots={overview.data.scan_roots} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ProcessesPanel telemetry={telemetry.data} />
              <RecommendedPanel
                scans={overview.data.latest_scans}
                roots={overview.data.scan_roots}
                dirty={overview.data.dirty_repositories}
                dupes={overview.data.duplicate_clone_links}
                counts={overview.data.counts}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <RecentPanel recent={overview.data.recent} />
              <ScanStatusPanel scans={overview.data.latest_scans} />
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

/**
 * Shown until the first scan: one click scans installed software and the AI
 * setup (agents, MCP servers, instruction files), which needs no folders, so
 * the Overview, Agent Map and AI pages fill in straight away. Project folders
 * stay a separate, explicit choice.
 */
function FirstRun({ hasRoots }: { hasRoots: boolean }) {
  const nav = useNavigate();
  const activity = useScanActivity();
  const busy = activity.running.size > 0;
  const scanMachine = async () => {
    await activity.startInventory();
    await activity.start("ai");
    if (hasRoots) await activity.start("repositories");
  };
  return (
    <Panel>
      <div className="flex flex-col items-start gap-3 py-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[13.5px] font-medium text-fg">Let AGASTHY look at this machine</div>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-muted">
            One scan finds your applications, developer tools, packages and AI setup: coding agents, MCP servers and instruction files. It only reads,
            takes about a minute, and nothing leaves this machine. Project folders are scanned only once you choose them.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => void nav({ to: "/settings" })}>
            <FolderPlus aria-hidden /> Choose project folders
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void scanMachine()}>
            {busy ? <RefreshCw className="animate-spin" aria-hidden /> : null}
            {busy ? "Scanning…" : "Scan this machine"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function primaryDisk(disks: DiskSample[]): DiskSample | undefined {
  return disks.find((d) => d.primary) ?? disks.find((d) => !d.system_volume);
}

function Resource({ label, main, sub, meter }: { label: string; main: ReactNode; sub?: ReactNode; meter: number | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md px-1 py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] text-muted">{label}</span>
        <span className="tabular truncate text-[13px] font-medium text-fg">{main}</span>
      </div>
      <Meter value={meter} label={label} />
      <div className="tabular h-4 truncate text-[11.5px] text-faint">{sub}</div>
    </div>
  );
}

function ResourcesPanel({ telemetry, error }: { telemetry?: TelemetrySnapshot; error: unknown }) {
  const gpus = useGpus();
  const { os } = useOsWords();
  // Windows reports commit charge beyond RAM, not page-file activity.
  const commit = os === "windows";
  if (error) return <StateView kind="error" title="Telemetry unavailable" description={errorMessage(error)} compact />;
  if (!telemetry) return <StateView kind="loading" title="Sampling system resources" compact />;
  const cpu = value(telemetry.cpu);
  const mem = value(telemetry.memory);
  const disks = value(telemetry.disks);
  const disk = disks ? primaryDisk(disks) : undefined;
  const load = value(telemetry.load_average);
  const gpuList = gpus.data ? value(gpus.data) : null;
  return (
    <Panel
      title="Resources"
      actions={<span className="text-[11px] text-faint">live · every 2 s</span>}
      bodyClassName="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 xl:grid-cols-6"
    >
      <Resource
        label="CPU"
        main={<Avail value={telemetry.cpu} render={(c) => formatPercent(c.usage_percent)} />}
        sub={cpu ? `${cpu.logical_cores} cores${cpu.brand ? ` · ${cpu.brand}` : ""}` : unavailableReason(telemetry.cpu)}
        meter={cpu ? cpu.usage_percent / 100 : null}
      />
      <Resource
        label="Memory"
        main={<Avail value={telemetry.memory} render={(m) => `${formatBytes(m.used_bytes)} / ${formatBytes(m.total_bytes, 0)}`} />}
        sub={mem ? `${formatBytes(mem.available_bytes)} available` : unavailableReason(telemetry.memory)}
        meter={mem ? mem.used_bytes / mem.total_bytes : null}
      />
      <Resource
        label={commit ? "Committed beyond RAM" : "Swap"}
        main={<Avail value={telemetry.memory} render={(m) => (m.swap_total_bytes ? `${formatBytes(m.swap_used_bytes)} / ${formatBytes(m.swap_total_bytes, 0)}` : "none configured")} />}
        sub={!mem || !mem.swap_total_bytes ? "" : commit ? "Not page-file activity; several GB is normal" : os === "macos" ? "macOS grows swap on demand" : ""}
        meter={mem && mem.swap_total_bytes ? mem.swap_used_bytes / mem.swap_total_bytes : null}
      />
      <Resource
        label={disk ? `Disk ${disk.mount_point}` : "Disk"}
        main={disk ? `${formatBytes(disk.total_bytes - disk.available_bytes)} / ${formatBytes(disk.total_bytes, 0)}` : <Avail value={telemetry.disks} render={() => "no volume"} />}
        sub={disk ? `${formatBytes(disk.available_bytes)} free · ${disk.file_system}` : ""}
        meter={disk && disk.total_bytes ? (disk.total_bytes - disk.available_bytes) / disk.total_bytes : null}
      />
      <Resource
        label="Load average"
        main={<Avail value={telemetry.load_average} render={(l) => `${l.one.toFixed(2)} ${l.five.toFixed(2)} ${l.fifteen.toFixed(2)}`} />}
        sub={<Avail value={telemetry.process_count} render={(n) => `${formatNumber(n)} processes`} />}
        meter={load && cpu ? Math.min(1, load.one / cpu.logical_cores) : null}
      />
      <Resource
        label="GPU"
        main={gpus.isLoading ? "…" : gpuList && gpuList.length ? gpuList.map((g) => g.model).join(", ") : gpus.data ? <Avail value={gpus.data} render={() => "—"} /> : "—"}
        sub={gpuList?.[0]?.cores ? `${gpuList[0].cores} cores · utilisation unavailable` : "utilisation unavailable"}
        meter={null}
      />
    </Panel>
  );
}

const ENV_KINDS: { kind: EntityKind; label: string }[] = [
  { kind: "repository", label: "Repositories" },
  { kind: "application", label: "Applications" },
  { kind: "binary", label: "CLI tools" },
  { kind: "runtime", label: "Runtimes" },
  { kind: "package", label: "Packages" },
  { kind: "package_manager", label: "Package managers" },
  { kind: "ai_tool", label: "AI tools" },
  { kind: "mcp_server", label: "MCP servers" },
];

function EnvironmentPanel({ counts, dirty, dupes, roots }: { counts: KindCount[]; dirty: number; dupes: number; roots: number }) {
  const nav = useNavigate();
  const count = (k: EntityKind) => counts.find((c) => c.kind === k)?.count ?? 0;
  const hint = (k: EntityKind): ReactNode => {
    if (k === "repository") {
      if (roots === 0) return "no folders chosen";
      const parts = [dirty ? `${dirty} with changes` : null, dupes ? `${dupes} duplicate` : null].filter(Boolean);
      return parts.length ? parts.join(" · ") : `in ${roots} folder${roots === 1 ? "" : "s"}`;
    }
    if (k === "remote_project") return "";
    return KIND_LABEL[k].provenance;
  };
  return (
    <Panel title="Developer environment" bodyClassName="grid grid-cols-2 gap-1 p-1.5 md:grid-cols-4 xl:grid-cols-8">
      {ENV_KINDS.map(({ kind, label }) => (
        <Stat
          key={kind}
          label={label}
          value={formatNumber(count(kind))}
          hint={hint(kind)}
          onClick={() =>
            kind === "ai_tool" || kind === "mcp_server"
              ? void nav({ to: "/ai", search: { tab: kind === "ai_tool" ? "assistants" : "mcp" } })
              : void nav({ to: "/discovery", search: { tab: tabForKind(kind) } })
          }
        />
      ))}
    </Panel>
  );
}

function ProcTable({ rows, metric }: { rows: ProcessSample[]; metric: "memory" | "cpu" }) {
  return (
    <table className="w-full table-fixed text-[12px]">
      <tbody>
        {rows.map((p) => (
          <tr key={p.pid} className="border-t border-line first:border-t-0">
            <td className="truncate py-1 pr-2 text-fg" title={p.exe ?? p.name}>
              {p.name}
            </td>
            <td className="tabular w-16 py-1 text-right text-faint">{p.pid}</td>
            <td className="tabular w-24 py-1 text-right text-fg">
              {metric === "memory" ? formatBytes(p.memory_bytes) : <Avail value={p.cpu_percent} render={(c) => formatPercent(c, 1)} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProcessesPanel({ telemetry }: { telemetry?: TelemetrySnapshot }) {
  return (
    <Panel
      title="Top processes"
      actions={
        <Link to="/processes" className="text-[11px] text-accent hover:underline">
          Manage in Processes
        </Link>
      }
    >
      {!telemetry ? (
        <StateView kind="loading" title="Sampling processes" compact />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <div className="mb-1 text-[11.5px] text-muted">By memory</div>
            <Avail value={telemetry.top_by_memory} render={(rows) => <ProcTable rows={rows} metric="memory" />} />
          </div>
          <div>
            <div className="mb-1 text-[11.5px] text-muted">By CPU</div>
            {telemetry.top_by_cpu.status === "available" ? (
              <ProcTable rows={telemetry.top_by_cpu.value} metric="cpu" />
            ) : (
              <div className="py-2 text-[12px] text-faint">{unavailableReason(telemetry.top_by_cpu)}</div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

interface Action {
  text: string;
  detail: string;
  cta: string;
  run: () => void;
}

function RecommendedPanel({ scans, roots, dirty, dupes, counts }: { scans: ScanRecord[]; roots: number; dirty: number; dupes: number; counts: KindCount[] }) {
  const nav = useNavigate();
  const activity = useScanActivity();
  const has = (k: ScanKind) => scans.some((s) => s.kind === k);
  const actions: Action[] = [];
  if (roots === 0) {
    actions.push({
      text: "Choose folders that contain your projects",
      detail: "Repository discovery never scans without consent; it only looks inside folders you add.",
      cta: "Add folder",
      run: () => void nav({ to: "/settings" }),
    });
  } else if (!has("repositories")) {
    actions.push({ text: "Scan your project folders", detail: `${roots} folder${roots === 1 ? "" : "s"} added but not scanned yet.`, cta: "Scan", run: () => void activity.start("repositories") });
  }
  if (!has("packages") || !has("software")) {
    actions.push({ text: "Inventory installed software", detail: "Applications, PATH tools and package-manager inventories.", cta: "Scan", run: () => void activity.startInventory() });
  }
  if (dirty > 0) {
    actions.push({
      text: `${dirty} repositor${dirty === 1 ? "y has" : "ies have"} uncommitted changes`,
      detail: "Worth knowing before any cleanup or update work.",
      cta: "Show",
      run: () => void nav({ to: "/discovery", search: { tab: "repositories", filter: "dirty" } }),
    });
  }
  if (dupes > 0) {
    actions.push({
      text: `${dupes} duplicate clone${dupes === 1 ? "" : "s"} of the same project`,
      detail: "Multiple local clones share a primary remote. Review before removing anything.",
      cta: "Show",
      run: () => void nav({ to: "/discovery", search: { tab: "repositories", filter: "duplicates" } }),
    });
  }
  const shadowed = counts.find((c) => c.kind === "runtime")?.count ?? 0;
  if (shadowed > 0 && has("software")) {
    actions.push({
      text: "Review which runtime copies are active",
      detail: "When several copies of a runtime are on PATH, the first one wins.",
      cta: "Show",
      run: () => void nav({ to: "/discovery", search: { tab: "tools", filter: "runtimes" } }),
    });
  }
  return (
    <Panel title="Recommended">
      {actions.length === 0 ? (
        <StateView kind="empty" title="Nothing needs attention" description="Based on the scans AGASTHY has run so far." compact />
      ) : (
        <ul className="divide-y divide-line">
          {actions.map((a) => (
            <li key={a.text} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-[12.5px] text-fg">{a.text}</div>
                <div className="text-[11.5px] text-faint">{a.detail}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={a.run}>
                {a.cta} <ArrowRight aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentPanel({ recent }: { recent: Entity[] }) {
  const nav = useNavigate();
  return (
    <Panel title="Recently discovered">
      {recent.length === 0 ? (
        <StateView kind="empty" title="No discoveries yet" compact />
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((e) => (
            <li key={e.id}>
              <button
                className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:text-fg"
                onClick={() => void nav({ to: "/discovery", search: { tab: tabForKind(e.kind), id: e.id } })}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge>{KIND_LABEL[e.kind].short}</Badge>
                  <span className="truncate text-[12.5px] text-fg">{e.name}</span>
                  {e.path ? <span className="truncate text-[11.5px] text-faint">{shortenHome(e.path)}</span> : null}
                </div>
                <span className="shrink-0 text-[11.5px] text-faint">{formatRelative(e.first_seen)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ScanStatusPanel({ scans }: { scans: ScanRecord[] }) {
  const activity = useScanActivity();
  const kinds: ScanKind[] = ["repositories", "software", "packages", "ai", "security"];
  return (
    <Panel title="Scans">
      <ul className="divide-y divide-line">
        {kinds.map((k) => {
          const s = scans.find((x) => x.kind === k);
          const running = activity.running.has(k);
          const err = activity.lastError[k];
          return (
            <li key={k} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12.5px] text-fg">
                  {SCAN_LABELS[k]}
                  {running ? (
                    <Badge tone="accent">{progressLabel(activity.progress[k])}</Badge>
                  ) : s ? (
                    <Badge tone={s.status === "completed" ? "success" : s.status === "failed" ? "danger" : "warning"}>
                      {s.status === "completed" ? "complete" : s.status === "failed" ? "failed" : `${s.issues.length} issue${s.issues.length === 1 ? "" : "s"}`}
                    </Badge>
                  ) : (
                    <Badge>never run</Badge>
                  )}
                </div>
                <div className="truncate text-[11.5px] text-faint">
                  {err ? <span className="text-danger">{err}</span> : s ? `${formatNumber(s.entities_found)} found · ${formatRelative(s.finished_at ?? s.started_at)}` : "—"}
                </div>
              </div>
              <Button size="sm" variant="ghost" disabled={running} onClick={() => void activity.start(k)}>
                <RefreshCw className={running ? "animate-spin" : ""} aria-hidden /> Run
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
