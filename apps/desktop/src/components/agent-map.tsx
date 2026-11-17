import { cn } from "@agasthy/ui";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { shortenHome } from "../lib/format";
import { type AgentMap, type MapKind, type MapNode, RING, formatTokens, layout, reach } from "../lib/agent-map";

export const MAP_COLOR: Record<MapKind, string> = {
  repository: "var(--accent)",
  ai_config_file: "#a58b6f",
  ai_tool: "#e0795b",
  mcp_server: "#5b8def",
  local_model: "#7aa35a",
  ai_provider: "#c9a227",
};

const RADIUS: Record<MapKind, number> = { repository: 11, ai_config_file: 4.5, ai_tool: 15, mcp_server: 8, local_model: 7, ai_provider: 8 };
const CATEGORY: Record<string, string> = {
  cli: "command line",
  desktop_app: "desktop app",
  ide: "editor",
  ide_extension: "editor extension",
  local_inference: "local inference",
};

export interface MapLens {
  /** Draw only the links that cross the edge of the machine. */
  leaving: boolean;
  /** Draw where agents worked, sized by tokens. */
  work: boolean;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The Agent Map canvas: rings around the machine's projects, a boundary for
 * the machine itself, and only the links that matter for what is selected or
 * hovered. Click selects, double-click focuses, Escape clears. Scroll or the
 * buttons zoom; drag pans.
 */
export function AgentMapCanvas({
  map,
  visible,
  selected,
  lens,
  onSelect,
  onFocus,
}: {
  map: AgentMap;
  visible: Set<string>;
  selected: string | null;
  lens: MapLens;
  onSelect: (id: string | null) => void;
  onFocus: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 700 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cx = size.w / 2;
  const cy = size.h / 2;
  // Leave room for labels outside the outer ring.
  const r = Math.max(160, Math.min(size.w / 2 - 120, size.h / 2 - 34) / RING.out);
  const placed = useMemo(() => layout(map, visible, cx, cy, r), [map, visible, cx, cy, r]);

  const active = hovered ?? selected;
  const lit = useMemo(() => (active && map.nodes.has(active) ? reach(map, active) : null), [map, active]);
  const leavingIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of map.links)
      if ((l.kind === "uses_provider" || l.kind === "uses_mcp_server") && map.nodes.get(l.to)?.outside) {
        s.add(l.from);
        s.add(l.to);
      }
    return s;
  }, [map]);
  const fileCount = [...visible].filter((id) => map.nodes.get(id)?.kind === "ai_config_file").length;

  const isOn = (id: string) => (lens.leaving && !active ? leavingIds.has(id) : !lit || lit.has(id));
  const maxWork = Math.max(1, ...map.work.map((w) => w.tokens));

  const zoomBy = (f: number, px = cx, py = cy) =>
    setView((v) => {
      const k = Math.min(4, Math.max(0.4, v.k * f));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-node]")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onSelect(null);
  };

  const pos = (id: string) => placed.get(id);
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend: number) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    return `M${a.x},${a.y} Q${mx + (mx - cx) * bend},${my + (my - cy) * bend} ${b.x},${b.y}`;
  };

  const linkEls = [];
  if (lens.work) {
    for (const w of map.work) {
      const a = pos(w.repo);
      const b = pos(w.agent);
      if (!a || !b) continue;
      const hot = lit ? lit.has(w.repo) && lit.has(w.agent) && (active === w.repo || active === w.agent) : false;
      linkEls.push(
        <path
          key={`work:${w.repo}:${w.agent}`}
          d={curve(a, b, 0)}
          fill="none"
          stroke="var(--accent)"
          strokeLinecap="round"
          strokeWidth={3 + 13 * Math.sqrt(w.tokens / maxWork)}
          opacity={hot ? 0.55 : lit || lens.leaving ? 0.08 : 0.28}
        >
          <title>{`${map.nodes.get(w.agent)?.name} in ${map.nodes.get(w.repo)?.name}: ${formatTokens(w.tokens)} tokens, ${w.sessions} sessions`}</title>
        </path>,
      );
    }
  }
  for (const l of map.links) {
    const a = pos(l.from);
    const b = pos(l.to);
    if (!a || !b) continue;
    const crosses = (l.kind === "uses_provider" || l.kind === "uses_mcp_server") && map.nodes.get(l.to)!.outside;
    // With something active, light its own links, and for an agent or a
    // project also the links between the things it involves (project to
    // file, file to agent), so its whole footprint reads as one shape.
    const activeKind = active ? map.nodes.get(active)?.kind : undefined;
    const hot = lit
      ? lit.has(l.from) && lit.has(l.to) && (l.from === active || l.to === active || activeKind === "ai_tool" || activeKind === "repository")
      : lens.leaving && crosses;
    linkEls.push(
      <path
        key={l.id}
        d={curve(a, b, 0.12)}
        fill="none"
        className={cn(crosses && hot && "agent-map-flow")}
        stroke={crosses ? "var(--warning)" : hot ? "var(--fg)" : "var(--faint)"}
        strokeOpacity={hot ? (crosses ? 1 : 0.55) : lit || lens.leaving ? 0.08 : crosses ? 0.55 : 0.3}
        strokeWidth={hot ? (crosses ? 1.8 : 1.3) : 1}
        strokeDasharray={!crosses && l.confidence !== "verified" && l.confidence !== "strong" ? "4 3" : undefined}
      />,
    );
  }

  const nodeEls = [...placed.values()].map((p) => {
    const n = map.nodes.get(p.id)!;
    const on = isOn(n.id);
    const rr = RADIUS[n.kind];
    const isSel = n.id === selected;
    const center = n.kind === "repository" || n.kind === "ai_tool";
    const right = Math.cos(p.angle) >= -0.05;
    const showLabel = n.kind !== "ai_config_file" || fileCount <= 14 || (lit?.has(n.id) ?? false);
    const label = truncate(n.kind === "ai_config_file" ? n.label : n.label, n.kind === "ai_config_file" ? 26 : 22);
    const tx = center ? p.x : p.x + (right ? rr + 6 : -rr - 6);
    const ty = center ? p.y + rr + 15 : p.y + 4;
    const work = n.kind === "repository" && lens.work ? map.work.filter((w) => w.repo === n.id && (!active || active === n.id || w.agent === active)) : [];
    const workTotal = work.reduce((s, w) => s + w.tokens, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(n.id);
      }
    };
    return (
      <g
        key={n.id}
        data-node={n.id}
        role="button"
        tabIndex={0}
        aria-label={`${n.name}${n.outside ? ", outside this machine" : ""}`}
        aria-pressed={isSel}
        className="cursor-pointer outline-none [&:focus-visible>circle:nth-child(2)]:stroke-[var(--accent)]"
        style={{ opacity: on ? 1 : 0.22, transition: "opacity 150ms" }}
        onPointerEnter={() => setHovered(n.id)}
        onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
        onFocus={() => setHovered(n.id)}
        onBlur={() => setHovered((h) => (h === n.id ? null : h))}
        onClick={() => onSelect(n.id)}
        onDoubleClick={() => onFocus(n.id)}
        onKeyDown={onKey}
      >
        <title>{`${n.name}${n.path ? `\n${n.path}` : ""}\nClick for details, double-click to show only what it involves`}</title>
        <circle cx={p.x} cy={p.y} r={rr + 7} fill="transparent" />
        <circle
          cx={p.x}
          cy={p.y}
          r={rr}
          fill={MAP_COLOR[n.kind]}
          fillOpacity={n.kind === "ai_tool" && n.installed === false ? 0.4 : 1}
          stroke={isSel ? "var(--fg)" : n.kind === "ai_tool" && n.installed === false ? MAP_COLOR.ai_tool : "none"}
          strokeWidth={isSel ? 2.5 : 1.5}
          strokeDasharray={!isSel && n.kind === "ai_tool" && n.installed === false ? "3 2" : undefined}
        />
        {showLabel ? (
          <text
            x={tx}
            y={ty}
            textAnchor={center ? "middle" : right ? "start" : "end"}
            fill={n.kind === "ai_config_file" ? "var(--muted)" : "var(--fg)"}
            fontSize={n.kind === "ai_config_file" ? 10.5 : 12}
            fontWeight={center ? 600 : 400}
           
          >
            {label}
          </text>
        ) : null}
        {n.kind === "ai_tool" ? (
          <text x={tx} y={ty + 13} textAnchor="middle" fill="var(--muted)" fontSize={10.5}>
            {n.installed === false ? "settings only" : (CATEGORY[n.category ?? ""] ?? n.category ?? "")}
          </text>
        ) : null}
        {workTotal > 0 ? (
          <text x={tx} y={ty + 13} textAnchor="middle" fill="var(--accent)" fontSize={10.5} fontWeight={600}>
            {formatTokens(workTotal)} tokens
          </text>
        ) : null}
      </g>
    );
  });

  const edgeR = RING.edge * r;
  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden" aria-label="Agent map">
      <svg
        width={size.w}
        height={size.h}
        className="block touch-none select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => e.key === "Escape" && onSelect(null)}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <circle cx={cx} cy={cy} r={edgeR} fill="var(--accent)" fillOpacity={0.035} stroke="var(--accent)" strokeOpacity={0.45} strokeDasharray="2 5" strokeWidth={1.2} />
          <text x={cx} y={cy - edgeR + 16} textAnchor="middle" fill="var(--faint)" fontSize={10.5} letterSpacing="0.08em">
            THIS MACHINE
          </text>
          <text x={cx} y={cy - edgeR - 10} textAnchor="middle" fill="var(--warning)" fontSize={10.5} letterSpacing="0.08em">
            OUTSIDE: THE INTERNET
          </text>
          {linkEls}
          {nodeEls}
        </g>
      </svg>
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-md border border-line bg-surface shadow-sm">
        {(
          [
            ["Zoom in", Plus, () => zoomBy(1.25)],
            ["Zoom out", Minus, () => zoomBy(0.8)],
            ["Fit", Maximize2, () => setView({ x: 0, y: 0, k: 1 })],
          ] as const
        ).map(([label, Icon, fn]) => (
          <button key={label} onClick={fn} aria-label={label} title={label} className="grid size-7 place-items-center text-muted hover:bg-hover hover:text-fg">
            <Icon className="size-3.5" aria-hidden />
          </button>
        ))}
      </div>
      <MapLegend lens={lens} />
    </div>
  );
}

function MapLegend({ lens }: { lens: MapLens }) {
  const dot = (k: MapKind, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: MAP_COLOR[k] }} />
      {label}
    </span>
  );
  return (
    <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-5rem)] flex-wrap gap-x-3 gap-y-1 rounded-md border border-line bg-surface/90 px-2.5 py-1.5 text-[11px] text-muted shadow-sm">
      {dot("repository", "Project")}
      {dot("ai_config_file", "Instruction or config file")}
      {dot("ai_tool", "Agent")}
      {dot("mcp_server", "MCP server")}
      {dot("ai_provider", "Model provider")}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-4 border-t-2 border-warning" />
        Leaves the machine
      </span>
      {lens.work ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-4 rounded bg-accent/50" />
          Work done
        </span>
      ) : null}
    </div>
  );
}

export function nodeSubtitle(n: MapNode): string {
  if (n.kind === "ai_tool") return [n.vendor, n.installed === false ? "settings only, program not found" : CATEGORY[n.category ?? ""]].filter(Boolean).join(" · ");
  if (n.kind === "mcp_server") return n.outside ? `remote · ${n.host ?? "unknown host"}` : `local${n.command ? ` · ${n.command}` : ""}`;
  if (n.kind === "ai_provider") return n.outside ? "outside this machine" : "on this machine";
  return n.path ? shortenHome(n.path) : "";
}
