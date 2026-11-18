import "@xyflow/react/dist/style.css";

import type { Edge as GEdge, EntityKind, GraphNode, GraphView, RelationKind } from "@agasthy/shared-types";
import { Badge, Button, StateView, cn } from "@agasthy/ui";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import {
  AppWindow,
  Bot,
  ArrowLeft,
  Box,
  Brain,
  Cloud,
  FileText,
  Plug,
  ShieldAlert,
  Boxes,
  Cpu,
  Crosshair,
  FolderGit2,
  Globe,
  Package,
  Search,
  Terminal,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { AgentMapView } from "../components/agent-map-view";
import { RuntimeImpact } from "../components/impact";
import { PageHeader } from "../components/page";
import { NODE_HEIGHT, NODE_WIDTH, layoutGraph } from "../lib/graph-layout";
import { api, errorMessage } from "../lib/ipc";
import { useGraphNeighborhood, useSharedDependencies } from "../lib/queries";
import { KIND_LABEL } from "./discovery";
import { EntityDetailPanel } from "./entity-detail";

/** `map`: the Agent Map. `focus`: every recorded relationship around one thing. */
export type GraphMode = "map" | "focus";

export interface GraphSearch {
  view: GraphMode;
  focus?: string;
  depth: number;
  sel?: string;
  /** Agent Map: show only what this thing involves. */
  around?: string;
  /** Agent Map: days of token usage to draw as work. */
  days?: number;
}

export const KIND_STYLE: Record<EntityKind, { color: string; icon: ComponentType<{ className?: string }> }> = {
  repository: { color: "var(--accent)", icon: FolderGit2 },
  remote_project: { color: "var(--muted)", icon: Globe },
  application: { color: "#8b7cf6", icon: AppWindow },
  binary: { color: "var(--info)", icon: Terminal },
  runtime: { color: "var(--success)", icon: Cpu },
  package: { color: "#d97ab3", icon: Package },
  package_manager: { color: "#d97ab3", icon: Boxes },
  dependency: { color: "#5fb3b3", icon: Box },
  ai_tool: { color: "#e0795b", icon: Bot },
  ai_provider: { color: "#c9a227", icon: Cloud },
  local_model: { color: "#7aa35a", icon: Brain },
  mcp_server: { color: "#5b8def", icon: Plug },
  ai_config_file: { color: "#a58b6f", icon: FileText },
  finding: { color: "var(--danger)", icon: ShieldAlert },
};

const REL_SHORT: Record<RelationKind, string> = {
  origin_remote: "origin",
  tracks_remote: "remote",
  managed_by: "managed by",
  upstream_project: "upstream",
  provides: "provides",
  duplicate_clone: "duplicate of",
  installed_by: "installed by",
  depends_on: "depends on",
  requires_runtime: "requires",
  contains: "contains",
  configures_tool: "read by",
  declares_mcp_server: "declares",
  uses_mcp_server: "uses MCP",
  uses_provider: "uses",
  serves_model: "serves",
  same_content: "identical",
  potential_conflict: "conflicts?",
  references: "imports",
  has_finding: "finding",
};

const FILTERABLE: EntityKind[] = [
  "repository",
  "dependency",
  "runtime",
  "binary",
  "package",
  "application",
  "remote_project",
  "ai_tool",
  "ai_provider",
  "mcp_server",
  "ai_config_file",
  "local_model",
];

type EntityNodeData = { node: GraphNode; center: boolean };

function EntityNode({ data, selected }: NodeProps<FlowNode<EntityNodeData>>) {
  const { node, center } = data;
  const style = KIND_STYLE[node.kind];
  const Icon = style.icon;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-surface px-2.5 text-left shadow-sm",
        selected ? "border-accent ring-2 ring-accent/30" : center ? "border-accent/70" : "border-line",
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, borderLeft: `3px solid ${style.color}` }}
      title={`${KIND_LABEL[node.kind].provenance}: ${node.name}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
      <span style={{ color: style.color }} className="shrink-0">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium leading-4 text-fg">{node.name}</div>
        <div className="truncate text-[10.5px] leading-4 text-faint">
          {KIND_LABEL[node.kind].short}
          {node.detail ? ` · ${node.detail}` : ""}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

function toFlow(view: GraphView, selected: string | null): { nodes: FlowNode<EntityNodeData>[]; edges: FlowEdge[] } {
  const pos = layoutGraph(view);
  const showLabels = view.edges.length <= 40;
  const nodes = view.nodes.map((n) => ({
    id: n.id,
    type: "entity",
    position: pos.get(n.id) ?? { x: 0, y: 0 },
    data: { node: n, center: n.id === view.center },
    selected: n.id === selected,
  }));
  const edges = view.edges.map((e: GEdge) => {
    const touchesSelected = selected != null && (e.from_id === selected || e.to_id === selected);
    const stroke = touchesSelected ? "var(--accent)" : "var(--faint)";
    return {
      id: e.id,
      source: e.from_id,
      target: e.to_id,
      label: showLabels || touchesSelected ? REL_SHORT[e.kind] : undefined,
      labelStyle: { fontSize: 10, fill: "var(--muted)" },
      labelBgStyle: { fill: "var(--bg)" },
      style: {
        stroke,
        strokeWidth: touchesSelected ? 1.6 : 1,
        strokeDasharray: e.confidence === "verified" ? undefined : "4 3",
        opacity: selected && !touchesSelected ? 0.35 : 1,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: stroke },
      data: { confidence: e.confidence },
    };
  });
  return { nodes, edges };
}

function NodeSearch({ onPick }: { onPick: (id: string) => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = text.trim();
    if (!q) return;
    const t = setTimeout(() => {
      api
        .listEntities({ kind: null, text: q, limit: 8, offset: null })
        .then((rows) => {
          setError(null);
          setResults(rows.map((e) => ({ id: e.id, kind: e.kind, name: e.name, detail: e.version })));
        })
        .catch((e) => setError(errorMessage(e)));
    }, 150);
    return () => clearTimeout(t);
  }, [text]);
  const shown = text.trim() ? results : [];
  return (
    <div className="relative">
      <label className="flex h-7 w-64 items-center gap-1.5 rounded-md border border-line bg-surface px-2 focus-within:border-accent/60">
        <Search className="size-3.5 text-faint" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Focus on… (repo, runtime, package)"
          aria-label="Find a node to focus on"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-faint"
        />
      </label>
      {shown.length || error ? (
        <ul className="absolute z-20 mt-1 w-80 overflow-hidden rounded-md border border-line bg-surface shadow-lg" role="listbox">
          {error ? <li className="px-2.5 py-1.5 text-[12px] text-danger">{error}</li> : null}
          {shown.map((r) => (
            <li key={r.id}>
              <button
                role="option"
                aria-selected={false}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-hover"
                onClick={() => {
                  onPick(r.id);
                  setText("");
                }}
              >
                <Badge>{KIND_LABEL[r.kind].short}</Badge>
                <span className="truncate text-fg">{r.name}</span>
                {r.detail ? <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">{r.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SidePanel({ onFocus }: { onFocus: (id: string) => void }) {
  const shared = useSharedDependencies();
  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-4" aria-label="Graph legend">
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">How to read it</h3>
        <p className="text-[12px] leading-5 text-muted">
          Arrows point from a thing to what it relies on. Solid lines are verified by the system or a manifest; dashed lines are weaker inferences.
          Click a node for its evidence; double-click to focus the graph on it.
        </p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {(Object.keys(KIND_STYLE) as EntityKind[]).map((k) => {
            const Icon = KIND_STYLE[k].icon;
            return (
              <li key={k} className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <span style={{ color: KIND_STYLE[k].color }}>
                  <Icon className="size-3.5" />
                </span>
                {KIND_LABEL[k].short}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">Most shared dependencies</h3>
        {shared.isLoading ? (
          <StateView kind="loading" title="Loading" compact />
        ) : shared.error ? (
          <StateView kind="error" title="Could not load" description={errorMessage(shared.error)} compact />
        ) : !shared.data?.length ? (
          <div className="text-[12px] text-faint">None yet. Dependencies appear after a repository scan.</div>
        ) : (
          <ul className="flex flex-col">
            {shared.data.map((d) => (
              <li key={d.dependency.id}>
                <button
                  onClick={() => onFocus(d.dependency.id)}
                  className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-hover"
                >
                  <span className="truncate text-fg">{d.dependency.name}</span>
                  <span className="shrink-0 text-[11px] text-faint">
                    {d.ecosystem} · {d.projects} project{d.projects === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

export function GraphPage() {
  const search = useSearch({ from: "/graph" });
  const nav = useNavigate({ from: "/graph" });
  return (
    <div className="flex h-full min-h-0 flex-col">
      {search.view === "focus" && search.focus ? (
        <ConnectionsView
          search={search}
          onBack={() => void nav({ search: (s) => ({ ...s, view: "map", focus: undefined }) })}
        />
      ) : (
        <AgentMapView
          selected={search.sel ?? null}
          around={search.around ?? null}
          days={search.days ?? 30}
          onChange={(next) => void nav({ search: (s) => ({ ...s, ...next }), replace: true })}
          onExplore={(id) => void nav({ search: (s) => ({ ...s, view: "focus", focus: id, sel: id, depth: 1 }) })}
        />
      )}
    </div>
  );
}

/** Every recorded relationship around one thing, as a node graph: the deep dive behind the Agent Map. */
function ConnectionsView({ search, onBack }: { search: GraphSearch; onBack: () => void }) {
  const nav = useNavigate({ from: "/graph" });
  const [kinds, setKinds] = useState<EntityKind[]>([]);
  const q = useGraphNeighborhood(search.focus ?? null, search.depth, kinds);
  const view = q.data;
  const selected = search.sel ?? null;
  const flow = view ? toFlow(view, selected) : null;
  const center = view?.nodes.find((n) => n.id === view.center);

  const setFocus = (id: string) => void nav({ search: (s) => ({ ...s, view: "focus", focus: id, sel: id }) });
  const select = (id: string | undefined) => void nav({ search: (s) => ({ ...s, sel: id }), replace: true });

  return (
    <>
      <PageHeader
        title="Machine Graph"
        subtitle={view ? `All connections${center ? ` of ${center.name}` : ""} · ${view.nodes.length} nodes · ${view.edges.length} relationships${view.truncated ? " · limited" : ""}` : undefined}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden /> Agent map
        </Button>
        <NodeSearch onPick={setFocus} />
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Depth
          <select
            value={search.depth}
            onChange={(e) => void nav({ search: (s) => ({ ...s, depth: Number(e.target.value) }) })}
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12px] text-fg"
          >
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {FILTERABLE.map((k) => {
            const on = kinds.length === 0 || kinds.includes(k);
            return (
              <button
                key={k}
                onClick={() =>
                  setKinds((cur) => {
                    const base = cur.length === 0 ? FILTERABLE : cur;
                    const next = base.includes(k) ? base.filter((x) => x !== k) : [...base, k];
                    return next.length === FILTERABLE.length ? [] : next;
                  })
                }
                aria-pressed={on}
                className={cn(
                  "h-6 rounded-full border px-2 text-[11px] transition-colors",
                  on ? "border-line text-fg" : "border-line text-faint line-through opacity-60",
                )}
              >
                {KIND_LABEL[k].short}
              </button>
            );
          })}
        </div>
        {view?.truncated ? <Badge tone="warning">Showing the first {view.nodes.length} nodes</Badge> : null}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1" aria-label="Graph canvas">
          {q.isLoading ? (
            <StateView kind="loading" title="Building the graph" />
          ) : q.error ? (
            <StateView kind="error" title="Could not build the graph" description={errorMessage(q.error)} />
          ) : !view || view.nodes.length === 0 ? (
            <StateView kind="empty" title="Nothing to show" description="This node has no recorded relationships." />
          ) : flow ? (
            <ReactFlow
              key={`${search.focus ?? ""}:${search.depth}:${kinds.join(",")}`}
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => select(n.id)}
              onNodeDoubleClick={(_, n) => setFocus(n.id)}
              onPaneClick={() => select(undefined)}
              nodesConnectable={false}
              nodesDraggable
              elementsSelectable
              fitView
              fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
              minZoom={0.1}
              colorMode="system"
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} color="var(--line)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : null}
        </div>
        {selected ? (
          <EntityDetailPanel
            id={selected}
            onClose={() => select(undefined)}
            onNavigate={(id) => select(id)}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setFocus(selected)}>
                <Crosshair aria-hidden /> Focus graph here
              </Button>
            }
            extra={(entity) =>
              entity.kind === "runtime" ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">What if this were removed?</h3>
                  <RuntimeImpact id={entity.id} onSelectProject={(id) => select(id)} />
                </section>
              ) : null
            }
          />
        ) : (
          <SidePanel onFocus={setFocus} />
        )}
      </div>
    </>
  );
}
