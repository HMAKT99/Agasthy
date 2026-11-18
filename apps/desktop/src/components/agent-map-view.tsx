import { Badge, Button, StateView, cn } from "@agasthy/ui";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FILTER, KIND_TITLE, type MapFilter, buildAgentMap, leaving, visibleIds } from "../lib/agent-map";
import { errorMessage } from "../lib/ipc";
import { useAgentMapData, useAgentUsage, useRunScan } from "../lib/queries";
import { EntityDetailPanel } from "../pages/entity-detail";
import { AgentMapCanvas, MAP_COLOR, type MapLens } from "./agent-map";
import { AgentMapPanel } from "./agent-map-panel";
import { PageHeader } from "./page";

export interface MapUrlState {
  sel?: string;
  around?: string;
  days?: number;
}

const LAYERS: { key: keyof MapFilter["layers"]; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "files", label: "Files" },
  { key: "mcp", label: "MCP servers and models" },
  { key: "providers", label: "Providers" },
];

/** The Machine Graph page's default view: the machine from the agents' side. */
export function AgentMapView({
  selected,
  around,
  days,
  onChange,
  onExplore,
}: {
  selected: string | null;
  around: string | null;
  days: number;
  onChange: (next: MapUrlState) => void;
  onExplore: (id: string) => void;
}) {
  const data = useAgentMapData();
  const usage = useAgentUsage(days);
  const [filter, setFilter] = useState<MapFilter>(DEFAULT_FILTER);
  const [lens, setLens] = useState<MapLens>({ leaving: false, work: true });
  const [evidence, setEvidence] = useState<string | null>(null);

  const map = useMemo(
    () =>
      data.data
        ? buildAgentMap({
            entities: data.data.entities,
            edges: data.data.edges,
            sessions: usage.data?.sessions ?? [],
            runtimeEdges: data.data.edges.filter((e) => e.kind === "requires_runtime"),
            runtimes: data.data.entities.filter((e) => e.kind === "runtime"),
          })
        : null,
    [data.data, usage.data],
  );
  const effective = useMemo(() => ({ ...filter, around }), [filter, around]);
  const visible = useMemo(() => (map ? visibleIds(map, effective) : new Set<string>()), [map, effective]);
  const agents = useMemo(() => (map ? [...map.nodes.values()].filter((n) => n.kind === "ai_tool").sort((a, b) => a.name.localeCompare(b.name)) : []), [map]);

  const select = (id: string | null) => {
    setEvidence(null);
    onChange({ sel: id ?? undefined });
  };
  const focus = (id: string | null) => onChange({ around: id ?? undefined, sel: id ?? selected ?? undefined });

  const aroundNode = around ? map?.nodes.get(around) : undefined;
  const leaves = map ? leaving(map).length : 0;
  const agentCount = [...visible].filter((id) => map?.nodes.get(id)?.kind === "ai_tool").length;

  return (
    <>
      <PageHeader
        title="Machine Graph"
        subtitle={
          map
            ? `${agents.length} agent${agents.length === 1 ? "" : "s"} · ${[...map.nodes.values()].filter((n) => n.kind === "mcp_server").length} MCP servers · ${leaves} connection${leaves === 1 ? "" : "s"} leave the machine`
            : undefined
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        {map ? <MapSearch map={map} visible={visible} onPick={(id) => select(id)} /> : null}
        <AgentFilter
          agents={agents}
          value={filter}
          onChange={setFilter}
        />
        <LayerFilter value={filter} onChange={setFilter} />
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Toggle on={lens.leaving} onClick={() => setLens((l) => ({ ...l, leaving: !l.leaving }))} title="Dim everything except connections that cross the edge of this machine">
          <span className="inline-block w-3 border-t-2 border-warning" aria-hidden /> What leaves the machine
        </Toggle>
        <Toggle on={lens.work} onClick={() => setLens((l) => ({ ...l, work: !l.work }))} title="Draw where agents worked, sized by tokens from their own logs">
          <span className="inline-block h-1 w-3 rounded bg-accent/60" aria-hidden /> Work
        </Toggle>
        {lens.work ? (
          <select
            aria-label="Work window"
            value={days}
            onChange={(e) => onChange({ days: Number(e.target.value) })}
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12px] text-fg"
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        ) : null}
        {aroundNode ? (
          <Badge className="ml-auto inline-flex items-center gap-1 py-0.5">
            Only {aroundNode.name}
            <button onClick={() => focus(null)} aria-label="Show everything" className="rounded hover:text-fg">
              <X className="size-3" />
            </button>
          </Badge>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1" aria-label="Graph canvas">
          {data.isLoading ? (
            <StateView kind="loading" title="Drawing the agent map" />
          ) : data.error ? (
            <StateView kind="error" title="Could not load the agent map" description={errorMessage(data.error)} />
          ) : !map || agents.length === 0 ? (
            <EmptyMap />
          ) : agentCount === 0 ? (
            <StateView
              kind="empty"
              title="No agents match these filters"
              action={
                <Button onClick={() => setFilter(DEFAULT_FILTER)} variant="primary">
                  Reset filters
                </Button>
              }
            />
          ) : (
            <AgentMapCanvas map={map} visible={visible} selected={selected} lens={lens} onSelect={select} onFocus={(id) => focus(id)} />
          )}
        </div>
        {map && evidence ? (
          <EntityDetailPanel id={evidence} onClose={() => setEvidence(null)} onNavigate={(id) => select(map.nodes.has(id) ? id : null)} />
        ) : map && agents.length ? (
          <AgentMapPanel
            map={map}
            selected={selected}
            around={around}
            windowDays={days}
            onPick={(id) => select(id)}
            onFocus={focus}
            onClose={() => select(null)}
            onDetails={setEvidence}
            onExplore={onExplore}
          />
        ) : null}
      </div>
    </>
  );
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors",
        on ? "border-accent/60 bg-hover text-fg" : "border-line text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** A small popover menu; closes on outside click or Escape. */
function Menu({ label, active, children }: { label: string; active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[12px] transition-colors",
          active ? "border-accent/60 text-fg" : "border-line text-muted hover:text-fg",
        )}
      >
        {label} <ChevronDown className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-64 rounded-md border border-line bg-surface p-1.5 shadow-lg" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] text-fg hover:bg-hover">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[var(--accent)]" />
      {children}
    </label>
  );
}

function AgentFilter({ agents, value, onChange }: { agents: { id: string; name: string; installed?: boolean }[]; value: MapFilter; onChange: (f: MapFilter) => void }) {
  const shown = agents.filter((a) => (!value.installedOnly || a.installed !== false) && (value.agents.length === 0 || value.agents.includes(a.id))).length;
  const active = value.agents.length > 0 || value.installedOnly;
  const toggle = (id: string) => {
    const base = value.agents.length ? value.agents : agents.map((a) => a.id);
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange({ ...value, agents: next.length === agents.length ? [] : next });
  };
  return (
    <Menu label={active ? `Agents · ${shown} of ${agents.length}` : "All agents"} active={active}>
      <Check checked={value.installedOnly} onChange={() => onChange({ ...value, installedOnly: !value.installedOnly })}>
        Installed only
      </Check>
      <div className="my-1 h-px bg-line" />
      {agents.map((a) => (
        <Check key={a.id} checked={value.agents.length === 0 || value.agents.includes(a.id)} onChange={() => toggle(a.id)}>
          <span className="size-2 rounded-full" style={{ background: MAP_COLOR.ai_tool, opacity: a.installed === false ? 0.45 : 1 }} />
          <span className="truncate">{a.name}</span>
          {a.installed === false ? <span className="ml-auto text-[11px] text-faint">settings only</span> : null}
        </Check>
      ))}
      <div className="mt-1 flex gap-1 border-t border-line pt-1.5">
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, agents: [] })}>
          All
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, agents: agents.filter((a) => a.installed !== false).map((a) => a.id).slice(0, 1) })}>
          Just one
        </Button>
      </div>
    </Menu>
  );
}

function LayerFilter({ value, onChange }: { value: MapFilter; onChange: (f: MapFilter) => void }) {
  const hidden = LAYERS.filter((l) => !value.layers[l.key]).length;
  return (
    <Menu label={hidden ? `Layers · ${LAYERS.length - hidden} of ${LAYERS.length}` : "All layers"} active={hidden > 0}>
      {LAYERS.map((l) => (
        <Check key={l.key} checked={value.layers[l.key]} onChange={() => onChange({ ...value, layers: { ...value.layers, [l.key]: !value.layers[l.key] } })}>
          {l.label}
        </Check>
      ))}
      <p className="px-1.5 pt-1 text-[11px] leading-4 text-faint">Agents are always shown. Things only show while they connect to a shown agent.</p>
    </Menu>
  );
}

function MapSearch({ map, visible, onPick }: { map: ReturnType<typeof buildAgentMap>; visible: Set<string>; onPick: (id: string) => void }) {
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  const hits = q
    ? [...map.nodes.values()]
        .filter((n) => n.name.toLowerCase().includes(q) || (n.path ?? "").toLowerCase().includes(q))
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, 8)
    : [];
  return (
    <div className="relative">
      <label className="flex h-7 w-56 items-center gap-1.5 rounded-md border border-line bg-surface px-2 focus-within:border-accent/60">
        <Search className="size-3.5 text-faint" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              onPick(hits[0].id);
              setText("");
            }
          }}
          placeholder="Find an agent, project, server…"
          aria-label="Find on the map"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-faint"
        />
      </label>
      {hits.length ? (
        <ul className="absolute z-30 mt-1 w-80 overflow-hidden rounded-md border border-line bg-surface shadow-lg" role="listbox">
          {hits.map((n) => (
            <li key={n.id}>
              <button
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(n.id);
                  setText("");
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-hover"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: MAP_COLOR[n.kind] }} />
                <span className="truncate text-fg">{n.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-faint">
                  {KIND_TITLE[n.kind]}
                  {visible.has(n.id) ? "" : " · hidden by filters"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EmptyMap() {
  const scan = useRunScan();
  const nav = useNavigate();
  return (
    <StateView
      kind="empty"
      title="No AI agents mapped yet"
      description="The Agent Map shows which agents are on this machine, what instructions they read, which MCP servers they can call and what leaves the machine. It is built from the AI ecosystem scan, which reads configuration only."
      action={
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => scan.mutate("ai")} disabled={scan.isPending}>
            {scan.isPending ? "Scanning…" : "Scan the AI ecosystem"}
          </Button>
          <Button variant="ghost" onClick={() => void nav({ to: "/settings" })}>
            Choose project folders
          </Button>
        </div>
      }
    />
  );
}
