import type {
  InsightsReport,
  ScanSchedule,
  UsageReport,
  AgentReport,
  WorktreeReport,
  ChatTurn,
  OperatorAnswer,
  OperatorSettings,
  ProviderConfig,
  Lab,
  ReconstructionPlan,
  RemovalImpact,
  SecuritySettings,
  SnapshotDiff,
  SnapshotSummary,
  ActionPlan,
  ActionRequest,
  ActionResult,
  DiskAnalysis,
  ProcessSnapshot,
  QuarantineOp,
  AppInfo,
  EntityKind,
  Edge,
  RelationKind,
  AuditEntry,
  Availability,
  Entity,
  EntityDetail,
  EntityQuery,
  GpuInfo,
  Overview,
  GraphView,
  ImpactReport,
  OverviewKind,
  ScanEvent,
  SharedDependency,
  ScanKind,
  ScanRecord,
  ScanRoot,
  TelemetrySnapshot,
} from "@agasthy/shared-types";
import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    /**
     * Test-only IPC replacement installed by Playwright fixtures
     * (apps/desktop/e2e/fixtures). Never set in the shipped application.
     */
    __AGASTHY_TEST_IPC__?: Invoke;
  }
}

/** True when running inside the AGASTHY desktop shell (or a test fixture). */
export function inDesktopShell(): boolean {
  return typeof window !== "undefined" && (isTauri() || Boolean(window.__AGASTHY_TEST_IPC__));
}

const invoke: Invoke = (cmd, args) => {
  if (window.__AGASTHY_TEST_IPC__) return window.__AGASTHY_TEST_IPC__(cmd, args);
  return tauriInvoke(cmd, args);
};

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
  telemetry: () => invoke<TelemetrySnapshot>("telemetry"),
  gpus: () => invoke<Availability<GpuInfo[]>>("gpus"),
  overview: () => invoke<Overview>("overview"),
  listScanRoots: () => invoke<ScanRoot[]>("list_scan_roots"),
  addScanRoot: (path: string) => invoke<ScanRoot>("add_scan_root", { path }),
  removeScanRoot: (id: number) => invoke<void>("remove_scan_root", { id }),
  setScanRootEnabled: (id: number, enabled: boolean) =>
    invoke<void>("set_scan_root_enabled", { id, enabled }),
  runScan: (kind: ScanKind) => invoke<ScanRecord>("run_scan", { kind }),
  runningScans: () => invoke<ScanKind[]>("running_scans"),
  listEntities: (query: EntityQuery) => invoke<Entity[]>("list_entities", { query }),
  entityDetail: (id: string) => invoke<EntityDetail | null>("entity_detail", { id }),
  listScans: (limit?: number) => invoke<ScanRecord[]>("list_scans", { limit }),
  listAudit: (limit?: number) => invoke<AuditEntry[]>("list_audit", { limit }),
  graphNeighborhood: (center: string, depth: number, kinds: EntityKind[]) =>
    invoke<GraphView>("graph_neighborhood", { center, depth, kinds }),
  graphOverview: (kind: OverviewKind) => invoke<GraphView>("graph_overview", { kind }),
  runtimeImpact: (id: string) => invoke<ImpactReport | null>("runtime_impact", { id }),
  sharedDependencies: (limit?: number) => invoke<SharedDependency[]>("shared_dependencies", { limit }),
  listEdges: (kind: RelationKind) => invoke<Edge[]>("list_edges", { kind }),
  processes: () => invoke<ProcessSnapshot>("processes"),
  agentReport: () => invoke<AgentReport>("agent_report"),
  insights: () => invoke<InsightsReport>("insights"),
  /** Redacted Markdown summary for a bug report; the user reviews it before sharing. */
  diagnosticsReport: () => invoke<string>("diagnostics_report"),
  /** Opens this project's GitHub "new issue" page with the given text. */
  openIssue: (title: string, body: string) => invoke<void>("open_issue", { title, body }),
  /** Opens AGASTHY's latest release on GitHub (for a copy that cannot update itself). */
  openReleases: () => invoke<void>("open_releases"),
  /** Native save dialog, then writes the CSV. Resolves to the saved path, or null if cancelled. */
  exportUsageCsv: (windowDays: number) => invoke<string | null>("export_usage_csv", { windowDays }),
  scanSchedule: () => invoke<ScanSchedule>("scan_schedule"),
  setAutoRefresh: (enabled: boolean) => invoke<void>("set_auto_refresh", { enabled }),
  agentWorktrees: () => invoke<WorktreeReport>("agent_worktrees"),
  /** Token counters from agents' own local logs; never message text. */
  agentUsage: (windowDays?: number) => invoke<UsageReport>("agent_usage", { windowDays }),
  diskAnalysis: () => invoke<DiskAnalysis>("disk_analysis"),
  cachedDiskAnalysis: () => invoke<DiskAnalysis | null>("cached_disk_analysis"),
  quarantineList: () => invoke<QuarantineOp[]>("quarantine_list"),
  /** Dry run: returns what would happen and a single-use confirmation token. */
  planAction: (request: ActionRequest) => invoke<ActionPlan>("plan_action", { request }),
  executeAction: (token: string) => invoke<ActionResult>("execute_action", { token }),
  removalImpact: (id: string) => invoke<RemovalImpact | null>("removal_impact", { id }),
  snapshotsList: () => invoke<SnapshotSummary[]>("snapshots_list"),
  snapshotCreate: (name: string) => invoke<SnapshotSummary>("snapshot_create", { name }),
  /** `to: null` compares with the machine as it is now. */
  snapshotCompare: (from: string, to: string | null) => invoke<SnapshotDiff>("snapshot_compare", { from, to }),
  snapshotReconstruction: (id: string) => invoke<ReconstructionPlan>("snapshot_reconstruction", { id }),
  securitySettings: () => invoke<SecuritySettings>("security_settings"),
  setOsvEnabled: (enabled: boolean) => invoke<void>("set_osv_enabled", { enabled }),
  labsList: () => invoke<Lab[]>("labs_list"),
  operatorSettings: () => invoke<OperatorSettings>("operator_settings"),
  /** `null` turns the model off; the built-in Operator still answers. */
  operatorSetProvider: (provider: ProviderConfig | null) => invoke<void>("operator_set_provider", { provider }),
  /** Stored in the OS credential store (Keychain), never in AGASTHY's database. */
  operatorSetKey: (preset: string, key: string) => invoke<void>("operator_set_key", { preset, key }),
  operatorDeleteKey: (preset: string) => invoke<void>("operator_delete_key", { preset }),
  operatorSetCloudConsent: (enabled: boolean) => invoke<void>("operator_set_cloud_consent", { enabled }),
  operatorAsk: (question: string, history: ChatTurn[], useModel: boolean) =>
    invoke<OperatorAnswer>("operator_ask", { question, history, useModel }),
};

export async function onScanEvent(handler: (e: ScanEvent) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<ScanEvent>("scan-event", (e) => handler(e.payload));
}

/** The menu-bar item asks the window to open a page. */
export async function onNavigate(handler: (route: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<string>("navigate", (e) => handler(e.payload));
}

export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, title: "Choose a folder to scan" });
  return typeof picked === "string" ? picked : null;
}

export async function revealInFileManager(path: string): Promise<void> {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/** Normalise errors returned by Tauri commands (strings) and JS errors. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Unexpected error";
}
