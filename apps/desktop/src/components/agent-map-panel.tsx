import { Badge, Button, cn } from "@agasthy/ui";
import { Check, Copy, Crosshair, FileSearch, Network, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  type AgentMap,
  KIND_TITLE,
  type MapNode,
  briefing,
  defaultProject,
  formatTokens,
  inc,
  leaving,
  out,
} from "../lib/agent-map";
import { formatRelative, shortenHome } from "../lib/format";
import { MAP_COLOR, nodeSubtitle } from "./agent-map";

function Section({ title, count, children, empty }: { title: string; count?: number; children: ReactNode[]; empty: string }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
        {title}
        {count != null ? ` · ${count}` : ""}
      </h3>
      {children.length ? <ul className="flex flex-col">{children}</ul> : <div className="text-[12px] text-faint">{empty}</div>}
    </section>
  );
}

function Row({ node, detail, warn, onPick }: { node: MapNode; detail?: ReactNode; warn?: boolean; onPick: (id: string) => void }) {
  return (
    <li>
      <button
        onClick={() => onPick(node.id)}
        className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-[12.5px] hover:bg-hover"
      >
        <span className="size-2 shrink-0 self-center rounded-full" style={{ background: MAP_COLOR[node.kind] }} />
        <span className="min-w-0 truncate text-fg">{node.kind === "ai_config_file" ? shortenHome(node.path ?? node.name) : node.name}</span>
        {detail ? <span className={cn("ml-auto max-w-[55%] shrink-0 truncate text-right text-[11.5px]", warn ? "text-warning" : "text-faint")}>{detail}</span> : null}
      </button>
    </li>
  );
}

/**
 * The right-hand panel of the Agent Map: a summary when nothing is selected,
 * otherwise what the selected thing reads, calls, sends to and worked in.
 */
export function AgentMapPanel({
  map,
  selected,
  around,
  windowDays,
  onPick,
  onFocus,
  onClose,
  onDetails,
  onExplore,
}: {
  map: AgentMap;
  selected: string | null;
  around: string | null;
  windowDays: number;
  onPick: (id: string) => void;
  onFocus: (id: string | null) => void;
  onClose: () => void;
  onDetails: (id: string) => void;
  onExplore: (id: string) => void;
}) {
  const n = selected ? map.nodes.get(selected) : undefined;
  if (!n) return <Summary map={map} windowDays={windowDays} onPick={onPick} />;
  const remoteDetail = (m: MapNode) => nodeSubtitle(m);

  let body: ReactNode;
  if (n.kind === "ai_tool") {
    const files = inc(map, n.id, "configures_tool");
    const mcps = out(map, n.id, "uses_mcp_server");
    const providers = out(map, n.id, "uses_provider");
    const models = out(map, n.id, "serves_model");
    const work = map.work.filter((w) => w.agent === n.id);
    body = (
      <>
        <Section title="Sends data to" empty="Nothing found that leaves this machine.">
          {[...providers.filter((p) => p.outside), ...mcps.filter((m) => m.outside)].map((m) => (
            <Row key={m.id} node={m} detail={m.kind === "ai_provider" ? "model provider" : m.host} warn onPick={onPick} />
          ))}
        </Section>
        <Section title="Can call" count={mcps.length + models.length} empty="No MCP servers configured.">
          {[...mcps, ...models].map((m) => (
            <Row key={m.id} node={m} detail={remoteDetail(m)} warn={m.outside} onPick={onPick} />
          ))}
        </Section>
        <Section title="Reads" count={files.length} empty="No instruction or config files found.">
          {files.map((f) => {
            const shared = out(map, f.id, "configures_tool").filter((t) => t.id !== n.id).length;
            return (
              <Row
                key={f.id}
                node={f}
                detail={shared ? `also read by ${shared} other${shared > 1 ? "s" : ""}` : f.project ? "this project" : "everywhere"}
                onPick={onPick}
              />
            );
          })}
        </Section>
        <Section title={`Worked in · last ${windowDays} days`} empty="No sessions in a scanned project in this window, or this agent's logs are not read.">
          {work.map((w) => (
            <Row
              key={w.repo}
              node={map.nodes.get(w.repo)!}
              detail={`${formatTokens(w.tokens)} tokens · ${w.sessions} session${w.sessions === 1 ? "" : "s"}${w.lastAt ? ` · ${formatRelative(w.lastAt)}` : ""}`}
              onPick={onPick}
            />
          ))}
        </Section>
        <Briefing key={n.id} map={map} agent={n} />
      </>
    );
  } else if (n.kind === "repository") {
    const files = out(map, n.id, "contains");
    const agents = new Map<string, MapNode>();
    for (const f of files) for (const t of out(map, f.id, "configures_tool")) agents.set(t.id, t);
    const work = map.work.filter((w) => w.repo === n.id);
    for (const w of work) agents.set(w.agent, map.nodes.get(w.agent)!);
    const mcps = new Map<string, MapNode>();
    for (const f of files) for (const m of out(map, f.id, "declares_mcp_server")) mcps.set(m.id, m);
    body = (
      <>
        <Section title="Agents set up or working here" count={agents.size} empty="No agent is set up for this project.">
          {[...agents.values()].map((a) => {
            const w = work.find((x) => x.agent === a.id);
            return <Row key={a.id} node={a} detail={w ? `${formatTokens(w.tokens)} tokens · ${windowDays} days` : "set up by a file"} onPick={onPick} />;
          })}
        </Section>
        <Section title="Agent files in this project" count={files.length} empty="None.">
          {files.map((f) => (
            <Row
              key={f.id}
              node={f}
              detail={out(map, f.id, "configures_tool").map((t) => t.label).join(", ") || "read by no known agent"}
              onPick={onPick}
            />
          ))}
        </Section>
        <Section title="MCP servers this project declares" empty="None.">
          {[...mcps.values()].map((m) => (
            <Row key={m.id} node={m} detail={remoteDetail(m)} warn={m.outside} onPick={onPick} />
          ))}
        </Section>
      </>
    );
  } else if (n.kind === "ai_config_file") {
    const project = n.project ? map.nodes.get(n.project) : undefined;
    body = (
      <>
        <Section title="Read by" empty="No agent found on this machine reads this file.">
          {out(map, n.id, "configures_tool").map((t) => (
            <Row key={t.id} node={t} onPick={onPick} />
          ))}
        </Section>
        <Section title="Declares" empty="No MCP servers.">
          {out(map, n.id, "declares_mcp_server").map((m) => (
            <Row key={m.id} node={m} detail={remoteDetail(m)} warn={m.outside} onPick={onPick} />
          ))}
        </Section>
        {project ? (
          <Section title="Belongs to" empty="">
            {[<Row key={project.id} node={project} onPick={onPick} />]}
          </Section>
        ) : (
          <p className="text-[12px] text-muted">Not inside a project: it applies wherever the agents that read it run.</p>
        )}
      </>
    );
  } else if (n.kind === "mcp_server") {
    body = (
      <>
        <p className="text-[12px] text-muted">
          {n.outside
            ? `Calls to this server go over the internet to ${n.host ?? "a remote host"}.`
            : "A program started on this machine. AGASTHY records how it is launched, not what the program does once running."}
        </p>
        <Section title="Who can call it" empty="No agent found.">
          {inc(map, n.id, "uses_mcp_server").map((t) => (
            <Row key={t.id} node={t} onPick={onPick} />
          ))}
        </Section>
        <Section title="Declared in" empty="Unknown.">
          {inc(map, n.id, "declares_mcp_server").map((f) => (
            <Row key={f.id} node={f} onPick={onPick} />
          ))}
        </Section>
      </>
    );
  } else {
    const users = n.kind === "local_model" ? inc(map, n.id, "serves_model") : inc(map, n.id, "uses_provider");
    body = (
      <Section title={n.outside ? "Agents that send data here" : "Used by"} empty="No agent linked.">
        {users.map((t) => (
          <Row key={t.id} node={t} onPick={onPick} />
        ))}
      </Section>
    );
  }

  return (
    <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-surface p-4" aria-label="Details">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="size-2 rounded-full" style={{ background: MAP_COLOR[n.kind] }} />
          {KIND_TITLE[n.kind]}
          <button onClick={onClose} aria-label="Close details" className="ml-auto rounded p-1 text-faint hover:bg-hover hover:text-fg">
            <X className="size-3.5" />
          </button>
        </div>
        <h2 className="break-words text-[17px] font-semibold leading-6 text-fg">{n.name}</h2>
        <div className="flex flex-wrap gap-1.5">
          {nodeSubtitle(n) ? <Badge tone={n.outside ? "warning" : "neutral"}>{nodeSubtitle(n)}</Badge> : null}
          {n.version ? <Badge>{n.version}</Badge> : null}
          {n.providerLevel === "credential_present" ? <Badge>credential file present (not read)</Badge> : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => onFocus(around === n.id ? null : n.id)} aria-pressed={around === n.id}>
            <Crosshair aria-hidden /> {around === n.id ? "Show everything" : "Show only this"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDetails(n.id)}>
            <FileSearch aria-hidden /> Evidence
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onExplore(n.id)}>
            <Network aria-hidden /> All connections
          </Button>
        </div>
      </header>
      {body}
    </aside>
  );
}

function Summary({ map, windowDays, onPick }: { map: AgentMap; windowDays: number; onPick: (id: string) => void }) {
  const agents = [...map.nodes.values()].filter((n) => n.kind === "ai_tool");
  const workBy = new Map<string, number>();
  for (const w of map.work) workBy.set(w.agent, (workBy.get(w.agent) ?? 0) + w.tokens);
  agents.sort((a, b) => (workBy.get(b.id) ?? 0) - (workBy.get(a.id) ?? 0) || Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name));
  const leaves = leaving(map);
  const mcps = [...map.nodes.values()].filter((n) => n.kind === "mcp_server");
  return (
    <aside className="flex w-[380px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-4" aria-label="Summary">
      <section className="flex flex-col gap-1.5">
        <h2 className="text-[15px] font-semibold text-fg">Your machine, from the agents' side</h2>
        <p className="text-[12px] leading-5 text-muted">
          Projects sit in the middle, then the instruction files in them, then the agents that read those files, then the MCP servers they can
          call. The dotted circle is the edge of this machine; orange lines cross it. Click anything to see what it involves; double-click to show
          only that.
        </p>
      </section>
      <Section title="Agents" count={agents.length} empty="No AI coding agents found yet.">
        {agents.map((a) => (
          <Row
            key={a.id}
            node={a}
            detail={workBy.get(a.id) ? `${formatTokens(workBy.get(a.id)!)} tokens · ${windowDays} days` : a.installed === false ? "settings only" : undefined}
            onPick={onPick}
          />
        ))}
      </Section>
      <Section title="What leaves this machine" count={leaves.length} empty="Nothing found that leaves this machine.">
        {leaves.map((l) => (
          <Row key={l.id} node={map.nodes.get(l.to)!} detail={`from ${map.nodes.get(l.from)!.label}`} warn onPick={onPick} />
        ))}
      </Section>
      <Section title="MCP servers" count={mcps.length} empty="No MCP servers configured.">
        {mcps.map((m) => (
          <Row key={m.id} node={m} detail={nodeSubtitle(m)} warn={m.outside} onPick={onPick} />
        ))}
      </Section>
      <p className="text-[11.5px] leading-5 text-faint">
        Agents and providers are linked from configuration and installed apps, so a missing line means AGASTHY found no evidence, not that no
        data is sent. A local MCP server's own network use is not shown.
      </p>
    </aside>
  );
}

function Briefing({ map, agent }: { map: AgentMap; agent: MapNode }) {
  const projects = useMemo(() => {
    const ids = new Set<string>();
    for (const w of map.work) if (w.agent === agent.id) ids.add(w.repo);
    for (const f of inc(map, agent.id, "configures_tool")) if (f.project && map.nodes.has(f.project)) ids.add(f.project);
    return [...ids].map((id) => map.nodes.get(id)!);
  }, [map, agent.id]);
  // The project the user picked, while it is still one of this agent's projects.
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const repo = picked && projects.some((p) => p.id === picked) ? picked : defaultProject(map, agent.id);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  if (!projects.length || !repo) return null;
  const text = briefing(map, agent.id, repo);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">What this agent would be told</h3>
      <label className="flex items-center gap-2 text-[12px] text-muted">
        Project
        <select
          value={repo}
          onChange={(e) => setPicked(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 text-[12px] text-fg"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <pre className="selectable max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-raised p-2.5 font-mono text-[11.5px] leading-5 text-fg">
        {text}
      </pre>
      <div>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy briefing"}
        </Button>
      </div>
      <p className="text-[11.5px] leading-5 text-faint">Paste it into a session, or into an agent's instructions, so it starts with the facts of this machine.</p>
    </section>
  );
}
