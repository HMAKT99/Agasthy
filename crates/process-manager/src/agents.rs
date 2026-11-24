//! Coding-agent sessions: which agents are running, everything they started,
//! and what they left behind after exiting.
//!
//! A *session* is one agent process (Claude Code, Codex, Gemini CLI, …) plus
//! all of its descendants. The [`AgentTracker`] remembers the descendants it
//! has seen for each session, so when an agent exits and a dev server or MCP
//! server it started keeps running, that process is reported as *left behind*
//! with the session it came from (verified: AGASTHY saw it in that session's
//! process tree). Detached developer processes whose origin was never seen
//! are reported separately, as *probable*, never attributed to an agent.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{ListeningPort, ProcessInfo, ProcessKind, ProcessSnapshot, ProjectLink};

/// Agent signatures. Matched against the process name, executable path and
/// arguments (never by asking the process anything).
pub struct AgentSignature {
    pub id: &'static str,
    pub label: &'static str,
    names: &'static [&'static str],
    arg_markers: &'static [&'static str],
}

pub const AGENTS: &[AgentSignature] = &[
    AgentSignature {
        id: "claude-code",
        label: "Claude Code",
        names: &["claude"],
        arg_markers: &["@anthropic-ai/claude-code", "claude-code/cli.js"],
    },
    AgentSignature {
        id: "codex",
        label: "Codex CLI",
        names: &[
            "codex",
            "codex-aarch64-apple-darwin",
            "codex-x86_64-apple-darwin",
        ],
        arg_markers: &["@openai/codex"],
    },
    AgentSignature {
        id: "gemini-cli",
        label: "Gemini CLI",
        names: &["gemini"],
        arg_markers: &["@google/gemini-cli"],
    },
    AgentSignature {
        id: "cursor-agent",
        label: "Cursor Agent",
        names: &["cursor-agent"],
        arg_markers: &["cursor-agent"],
    },
    AgentSignature {
        id: "copilot-cli",
        label: "GitHub Copilot CLI",
        names: &["copilot"],
        arg_markers: &["@github/copilot"],
    },
    AgentSignature {
        id: "aider",
        label: "Aider",
        names: &["aider"],
        arg_markers: &["/bin/aider", "aider-chat"],
    },
    AgentSignature {
        id: "opencode",
        label: "OpenCode",
        names: &["opencode"],
        arg_markers: &["opencode-ai"],
    },
    AgentSignature {
        id: "goose",
        label: "Goose",
        names: &["goose"],
        arg_markers: &[],
    },
    AgentSignature {
        id: "amp",
        label: "Amp",
        names: &["amp"],
        arg_markers: &["@sourcegraph/amp"],
    },
    AgentSignature {
        id: "qwen-code",
        label: "Qwen Code",
        names: &["qwen"],
        arg_markers: &["@qwen-code/qwen-code"],
    },
    AgentSignature {
        id: "hermes",
        label: "Hermes Agent",
        names: &["hermes"],
        arg_markers: &["/bin/hermes", "hermes-agent", "hermes_cli"],
    },
    AgentSignature {
        id: "openclaw",
        label: "OpenClaw",
        names: &["openclaw", "openclaw-gateway"],
        arg_markers: &["openclaw"],
    },
    AgentSignature {
        id: "crush",
        label: "Crush",
        names: &["crush"],
        arg_markers: &["@charmland/crush"],
    },
    AgentSignature {
        id: "kilo",
        label: "Kilo Code CLI",
        names: &["kilocode", "kilo"],
        arg_markers: &["@kilocode/cli"],
    },
];

/// How a session root was recognised.
#[derive(Debug, Clone, PartialEq)]
pub struct RootKind {
    pub id: String,
    pub label: String,
    /// Recognised by signature (`true`) or because it starts MCP servers (`false`).
    pub known: bool,
}

/// A known agent, or any other process that starts MCP servers (an MCP
/// client is an agent host, whatever it is called). Desktop apps qualify only
/// through the MCP rule, so an app that runs no MCP server is not a session.
pub fn root_kind(p: &ProcessInfo, children: &[&ProcessInfo]) -> Option<RootKind> {
    if let Some(sig) = identify(p) {
        return Some(RootKind {
            id: sig.id.into(),
            label: sig.label.into(),
            known: true,
        });
    }
    if p.protected.is_some() || matches!(child_role(p), ChildRole::McpServer | ChildRole::Shell) {
        return None;
    }
    if !children
        .iter()
        .any(|c| child_role(c) == ChildRole::McpServer)
    {
        return None;
    }
    Some(match p.app_bundle.as_deref() {
        Some(bundle) => {
            let file = bundle.rsplit('/').next().unwrap_or(bundle);
            let name = HOST_APPS
                .iter()
                .find(|(b, _)| file == *b)
                .map(|(_, n)| n.to_string())
                .unwrap_or_else(|| file.trim_end_matches(".app").to_string());
            RootKind {
                id: format!("app:{name}"),
                label: name,
                known: false,
            }
        }
        None => RootKind {
            id: format!("unknown:{}", p.name),
            label: format!("Unrecognized agent ({})", p.name),
            known: false,
        },
    })
}

/// Which agent, if any, this process is.
pub fn identify(p: &ProcessInfo) -> Option<&'static AgentSignature> {
    // GUI apps (Claude.app, Cursor.app) are hosts, not CLI agent sessions.
    if p.app_bundle.is_some() {
        return None;
    }
    let exe_name = p
        .exe
        .as_deref()
        .and_then(|e| e.rsplit(['/', '\\']).next())
        .map(|n| n.trim_end_matches(".exe"));
    // Windows: `copilot.exe`, `node.exe`, and `node_modules\@github\copilot\…` arguments.
    let name = p.name.strip_suffix(".exe").unwrap_or(&p.name);
    let args: Vec<String> = p
        .command
        .iter()
        .take(3)
        .map(|a| a.replace('\\', "/"))
        .collect();
    // The script a launcher runs: `node /opt/homebrew/bin/qwen` runs `qwen`.
    // Global npm installs and npx start agents through such a bin link, whose
    // path does not contain the package name.
    let launched = is_launcher(name)
        .then(|| args.iter().skip(1).find(|a| !a.starts_with('-')))
        .flatten()
        .and_then(|a| a.rsplit('/').next());
    AGENTS.iter().find(|a| {
        a.names
            .iter()
            .any(|n| name == *n || exe_name == Some(n) || launched == Some(n))
            // Node/Python launchers: the agent is named in the first few arguments.
            || (is_launcher(name)
                && args.iter().any(|arg| a.arg_markers.iter().any(|m| arg.contains(m))))
    })
}

fn is_launcher(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let n = n.strip_suffix(".exe").unwrap_or(&n);
    n == "node" || n == "bun" || n == "deno" || n.starts_with("python")
}

/// What a descendant process is, for display and for cleanup decisions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ChildRole {
    /// A nested agent (sub-agent or a second agent started by this one).
    Agent,
    McpServer,
    DevServer,
    Watcher,
    Shell,
    /// `caffeinate`: keeps the Mac awake while the agent works.
    KeepAwake,
    Other,
}

pub fn child_role(p: &ProcessInfo) -> ChildRole {
    if identify(p).is_some() {
        return ChildRole::Agent;
    }
    let name = p.name.to_ascii_lowercase();
    let args = p.command.join(" ").to_ascii_lowercase();
    if name == "caffeinate" {
        return ChildRole::KeepAwake;
    }
    if matches!(
        name.as_str(),
        "zsh" | "bash" | "sh" | "fish" | "-zsh" | "-bash" | "/bin/zsh" | "/bin/bash"
    ) || name.ends_with("/zsh")
    {
        return ChildRole::Shell;
    }
    if args.contains("mcp") || name.contains("mcp") {
        return ChildRole::McpServer;
    }
    if !p.ports.is_empty()
        || p.kind == ProcessKind::DeveloperServer
        || DEV_SERVER_MARKERS.iter().any(|m| args.contains(m))
    {
        return ChildRole::DevServer;
    }
    if WATCH_MARKERS.iter().any(|m| args.contains(m)) {
        return ChildRole::Watcher;
    }
    ChildRole::Other
}

const DEV_SERVER_MARKERS: &[&str] = &[
    "vite",
    "next dev",
    "next-server",
    "webpack serve",
    "webpack-dev-server",
    "react-scripts start",
    "astro dev",
    "nuxt dev",
    "remix dev",
    "uvicorn",
    "gunicorn",
    "flask run",
    "manage.py runserver",
    "rails server",
    "storybook",
    "expo start",
    "wrangler dev",
    "http.server",
    "serve ",
];
const WATCH_MARKERS: &[&str] = &[
    "--watch",
    " watch",
    "nodemon",
    "tsc -w",
    "cargo watch",
    "jest --watch",
    "vitest",
    "esbuild --watch",
    "chokidar",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SessionProcess {
    pub pid: u32,
    pub start_time: u64,
    pub parent_pid: Option<u32>,
    pub name: String,
    /// Command line with credential-like values redacted, shortened.
    pub command: String,
    pub role: ChildRole,
    pub memory_bytes: u64,
    pub cpu_percent: Option<f32>,
    pub ports: Vec<ListeningPort>,
    pub cwd: Option<String>,
    pub run_time_secs: u64,
    /// Why AGASTHY will not stop it, if it will not.
    pub protected: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentSession {
    /// `<agent id>:<pid>:<start time>`; stable for the life of the process.
    pub id: String,
    pub agent: String,
    pub label: String,
    /// Recognised by name; `false` when found because it starts MCP servers.
    pub recognised: bool,
    pub root: SessionProcess,
    pub cwd: Option<String>,
    pub project: Option<ProjectLink>,
    /// The app the session runs in (Terminal, iTerm2, Cursor, VS Code, …), if found.
    pub host: Option<String>,
    pub children: Vec<SessionProcess>,
    /// Root and every descendant.
    pub total_memory_bytes: u64,
    pub total_cpu_percent: Option<f32>,
    pub ports: Vec<ListeningPort>,
    pub mcp_servers: u32,
    pub dev_servers: u32,
    pub nested_agents: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LeftoverOrigin {
    /// AGASTHY saw this process in the session's tree while the agent ran.
    SeenInSession,
    /// Its parent exited and it looks like a developer process; who started it is unknown.
    Detached,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Leftover {
    pub process: SessionProcess,
    pub origin: LeftoverOrigin,
    /// The agent that started it, when seen.
    pub agent_label: Option<String>,
    pub session_cwd: Option<String>,
    pub project: Option<ProjectLink>,
    /// When the session's agent was last seen running (ms since epoch).
    pub agent_exited_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentReport {
    pub taken_at: i64,
    pub sessions: Vec<AgentSession>,
    pub leftovers: Vec<Leftover>,
    pub total_memory_bytes: u64,
    /// When the tracker started watching; sessions that ended before this are unknown.
    pub tracking_since: i64,
    pub port_data_available: bool,
}

fn short_command(p: &ProcessInfo) -> String {
    let s = p.command.join(" ");
    if s.chars().count() > 160 {
        format!("{}…", s.chars().take(160).collect::<String>())
    } else if s.is_empty() {
        p.name.clone()
    } else {
        s
    }
}

fn to_session_process(p: &ProcessInfo) -> SessionProcess {
    SessionProcess {
        pid: p.pid,
        start_time: p.start_time,
        parent_pid: p.parent_pid,
        name: p.name.clone(),
        command: short_command(p),
        role: child_role(p),
        memory_bytes: p.memory_bytes,
        cpu_percent: p.cpu_percent.value().copied(),
        ports: p.ports.clone(),
        cwd: p.cwd.clone(),
        run_time_secs: p.run_time_secs,
        protected: p.protected.clone(),
    }
}

const HOST_APPS: &[(&str, &str)] = &[
    ("Terminal.app", "Terminal"),
    ("iTerm.app", "iTerm2"),
    ("Warp.app", "Warp"),
    ("Ghostty.app", "Ghostty"),
    ("WezTerm.app", "WezTerm"),
    ("kitty.app", "kitty"),
    ("Alacritty.app", "Alacritty"),
    ("Cursor.app", "Cursor"),
    ("Visual Studio Code.app", "VS Code"),
    ("Windsurf.app", "Windsurf"),
    ("Zed.app", "Zed"),
    ("Claude.app", "Claude app"),
    ("Codex.app", "Codex app"),
];

fn host_of(p: &ProcessInfo, by_pid: &HashMap<u32, &ProcessInfo>) -> Option<String> {
    let mut cur = p.parent_pid;
    for _ in 0..12 {
        let parent = by_pid.get(&cur?)?;
        if let Some(bundle) = parent.app_bundle.as_deref() {
            let file = bundle.rsplit('/').next().unwrap_or(bundle);
            return Some(
                HOST_APPS
                    .iter()
                    .find(|(b, _)| file == *b)
                    .map(|(_, n)| n.to_string())
                    .unwrap_or_else(|| file.trim_end_matches(".app").to_string()),
            );
        }
        if parent.name == "tmux" || parent.name.starts_with("tmux") {
            return Some("tmux".into());
        }
        cur = parent.parent_pid;
    }
    None
}

/// Group a snapshot into agent sessions. Pure: no history needed.
pub fn sessions(snap: &ProcessSnapshot) -> Vec<AgentSession> {
    let by_pid: HashMap<u32, &ProcessInfo> = snap.processes.iter().map(|p| (p.pid, p)).collect();
    let mut children: HashMap<u32, Vec<&ProcessInfo>> = HashMap::new();
    for p in &snap.processes {
        if let Some(pp) = p.parent_pid {
            children.entry(pp).or_default().push(p);
        }
    }
    // A session root is an agent whose ancestors are not agents. Desktop apps
    // that run MCP servers are roots too: their helpers have the app as parent.
    let kids_of = |p: &ProcessInfo| children.get(&p.pid).cloned().unwrap_or_default();
    let is_agent = |p: &ProcessInfo| root_kind(p, &kids_of(p)).is_some();
    // Recognised agents are always their own session (a Claude Code running in
    // Cursor's terminal is not part of "Cursor"); they only nest inside other
    // recognised agents. App and unknown sessions nest inside any session.
    let has_ancestor = |p: &ProcessInfo, pred: &dyn Fn(&ProcessInfo) -> bool| {
        let mut cur = p.parent_pid;
        for _ in 0..32 {
            let Some(parent) = cur.and_then(|c| by_pid.get(&c)) else {
                return false;
            };
            if pred(parent) {
                return true;
            }
            cur = parent.parent_pid;
        }
        false
    };
    let is_known = |p: &ProcessInfo| identify(p).is_some();
    let mut out = Vec::new();
    for p in snap.processes.iter().filter(|p| {
        if is_known(p) {
            !has_ancestor(p, &is_known)
        } else {
            is_agent(p) && !has_ancestor(p, &is_agent)
        }
    }) {
        let sig = root_kind(p, &kids_of(p)).expect("filtered to agents");
        let mut desc: Vec<&ProcessInfo> = Vec::new();
        let mut stack = vec![p.pid];
        let mut seen = HashSet::new();
        while let Some(pid) = stack.pop() {
            for c in children.get(&pid).map(Vec::as_slice).unwrap_or(&[]) {
                // An app or unknown session stops at recognised agents: those are separate sessions.
                if !sig.known && is_known(c) {
                    continue;
                }
                if seen.insert(c.pid) {
                    desc.push(c);
                    stack.push(c.pid);
                }
            }
        }
        let kids: Vec<SessionProcess> = desc.iter().map(|c| to_session_process(c)).collect();
        let total_mem = p.memory_bytes + kids.iter().map(|k| k.memory_bytes).sum::<u64>();
        let total_cpu = p
            .cpu_percent
            .value()
            .map(|c| c + kids.iter().filter_map(|k| k.cpu_percent).sum::<f32>());
        let mut ports: Vec<ListeningPort> = p.ports.clone();
        for k in &kids {
            for port in &k.ports {
                if !ports.contains(port) {
                    ports.push(port.clone());
                }
            }
        }
        ports.sort_by_key(|x| x.port);
        // Count each server once: a launcher (`npm exec … mcp`) and the node
        // process it starts are one server.
        let role_of: HashMap<u32, ChildRole> = kids.iter().map(|k| (k.pid, k.role)).collect();
        let count = |r: ChildRole| {
            kids.iter()
                .filter(|k| k.role == r && k.parent_pid.and_then(|pp| role_of.get(&pp)) != Some(&r))
                .count() as u32
        };
        // The session's project: the agent's own, or the first child's (agents may chdir).
        let project = p
            .project
            .clone()
            .or_else(|| desc.iter().find_map(|c| c.project.clone()));
        out.push(AgentSession {
            id: format!("{}:{}:{}", sig.id, p.pid, p.start_time),
            agent: sig.id.clone(),
            label: sig.label.clone(),
            recognised: sig.known,
            root: to_session_process(p),
            cwd: p.cwd.clone(),
            project,
            host: host_of(p, &by_pid),
            mcp_servers: count(ChildRole::McpServer),
            dev_servers: count(ChildRole::DevServer),
            nested_agents: count(ChildRole::Agent),
            children: kids,
            total_memory_bytes: total_mem,
            total_cpu_percent: total_cpu,
            ports,
        });
    }
    out.sort_by(|a, b| b.total_memory_bytes.cmp(&a.total_memory_bytes));
    out
}

#[derive(Debug, Clone)]
struct Remembered {
    agent_label: String,
    session_root: (u32, u64),
    session_cwd: Option<String>,
    project: Option<ProjectLink>,
    agent_last_seen: i64,
}

/// Remembers which processes belonged to which agent session.
#[derive(Debug, Default)]
pub struct AgentTracker {
    /// (pid, start time) of every process seen inside a session.
    seen: HashMap<(u32, u64), Remembered>,
    started_at: Option<i64>,
    /// (agent label, working directory) of the sessions in the latest update.
    last: Vec<(String, Option<String>)>,
}

impl AgentTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Sessions seen in the latest update: (agent label, working directory).
    pub fn last_sessions(&self) -> Vec<(String, Option<String>)> {
        self.last.clone()
    }

    pub fn update(&mut self, snap: &ProcessSnapshot) -> AgentReport {
        let now = snap.taken_at;
        let started = *self.started_at.get_or_insert(now);
        let sessions = sessions(snap);
        self.last = sessions
            .iter()
            .map(|s| (s.label.clone(), s.cwd.clone()))
            .collect();
        let alive: HashSet<(u32, u64)> = snap
            .processes
            .iter()
            .map(|p| (p.pid, p.start_time))
            .collect();

        for s in &sessions {
            let root = (s.root.pid, s.root.start_time);
            for c in &s.children {
                self.seen.insert(
                    (c.pid, c.start_time),
                    Remembered {
                        agent_label: s.label.clone(),
                        session_root: root,
                        session_cwd: s.cwd.clone(),
                        project: s.project.clone(),
                        agent_last_seen: now,
                    },
                );
            }
        }
        // Forget processes that no longer exist.
        self.seen.retain(|k, _| alive.contains(k));

        let in_session: HashSet<(u32, u64)> = sessions
            .iter()
            .flat_map(|s| {
                std::iter::once((s.root.pid, s.root.start_time))
                    .chain(s.children.iter().map(|c| (c.pid, c.start_time)))
            })
            .collect();
        let by_key: HashMap<(u32, u64), &ProcessInfo> = snap
            .processes
            .iter()
            .map(|p| ((p.pid, p.start_time), p))
            .collect();

        let mut leftovers = Vec::new();
        for (key, r) in &self.seen {
            if in_session.contains(key) || alive.contains(&r.session_root) {
                continue;
            }
            let Some(p) = by_key.get(key) else { continue };
            let sp = to_session_process(p);
            // A leftover shell or keep-awake helper is not worth reporting on its own.
            if matches!(sp.role, ChildRole::Shell | ChildRole::KeepAwake) && p.ports.is_empty() {
                continue;
            }
            leftovers.push(Leftover {
                process: sp,
                origin: LeftoverOrigin::SeenInSession,
                agent_label: Some(r.agent_label.clone()),
                session_cwd: r.session_cwd.clone(),
                project: r.project.clone(),
                agent_exited_at: Some(r.agent_last_seen),
            });
        }
        // Detached developer processes never seen in a session: reparented to
        // launchd (PID 1), user-owned, not an app, and linked to a project or listening.
        let reported: HashSet<u32> = leftovers.iter().map(|l| l.process.pid).collect();
        for p in &snap.processes {
            if p.parent_pid != Some(1)
                || p.protected.is_some()
                || p.app_bundle.is_some()
                || reported.contains(&p.pid)
                || in_session.contains(&(p.pid, p.start_time))
            {
                continue;
            }
            let role = child_role(p);
            let dev_like = matches!(
                role,
                ChildRole::DevServer | ChildRole::McpServer | ChildRole::Watcher
            );
            if !dev_like || (p.project.is_none() && p.ports.is_empty()) {
                continue;
            }
            leftovers.push(Leftover {
                process: to_session_process(p),
                origin: LeftoverOrigin::Detached,
                agent_label: None,
                session_cwd: None,
                project: p.project.clone(),
                agent_exited_at: None,
            });
        }
        leftovers.sort_by(|a, b| b.process.memory_bytes.cmp(&a.process.memory_bytes));

        AgentReport {
            taken_at: now,
            total_memory_bytes: sessions.iter().map(|s| s.total_memory_bytes).sum(),
            sessions,
            leftovers,
            tracking_since: started,
            port_data_available: snap.ports.is_available(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agasthy_core::Availability;

    fn proc(pid: u32, parent: u32, name: &str, cmd: &[&str], mem: u64) -> ProcessInfo {
        ProcessInfo {
            pid,
            parent_pid: Some(parent),
            name: name.into(),
            exe: Some(format!("/usr/local/bin/{name}")),
            command: cmd.iter().map(|s| s.to_string()).collect(),
            cwd: Some("/Users/u/code/web".into()),
            cpu_percent: Availability::available(1.0),
            memory_bytes: mem,
            start_time: 1000 + pid as u64,
            run_time_secs: 60,
            status: "Run".into(),
            kind: ProcessKind::Other,
            protected: None,
            ports: vec![],
            project: Some(ProjectLink {
                id: "repository:/Users/u/code/web".into(),
                name: "web".into(),
                via: "working directory".into(),
            }),
            app_bundle: None,
        }
    }

    fn app(pid: u32, bundle: &str) -> ProcessInfo {
        let mut p = proc(pid, 1, "Terminal", &[], 10);
        p.exe = Some(format!("{bundle}/Contents/MacOS/x"));
        p.app_bundle = Some(bundle.into());
        p.project = None;
        p
    }

    fn snap(processes: Vec<ProcessInfo>, t: i64) -> ProcessSnapshot {
        ProcessSnapshot {
            taken_at: t,
            processes,
            ports: Availability::available(0),
            own_pid: 9999,
        }
    }

    fn machine() -> Vec<ProcessInfo> {
        let mut vite = proc(
            40,
            10,
            "node",
            &["node", "/Users/u/code/web/node_modules/.bin/vite"],
            120,
        );
        vite.ports = vec![ListeningPort {
            address: "127.0.0.1".into(),
            port: 5173,
        }];
        vec![
            app(1, "/System/Applications/Utilities/Terminal.app"),
            proc(2, 1, "-zsh", &["-zsh"], 2),
            proc(10, 2, "claude", &["claude"], 300),
            proc(
                11,
                10,
                "npm exec rea-agents@6.7.0 mcp",
                &["npm", "exec", "rea-agents@6.7.0", "mcp"],
                20,
            ),
            proc(12, 11, "node", &["node", "server.js"], 30),
            proc(13, 10, "caffeinate", &["caffeinate", "-i"], 1),
            vite,
            proc(
                50,
                2,
                "node",
                &[
                    "node",
                    "/opt/homebrew/lib/node_modules/@google/gemini-cli/dist/index.js",
                ],
                200,
            ),
        ]
    }

    #[test]
    fn identifies_agents_and_groups_sessions() {
        let s = sessions(&snap(machine(), 0));
        assert_eq!(s.len(), 2);
        let claude = s.iter().find(|x| x.agent == "claude-code").unwrap();
        assert_eq!(claude.children.len(), 4);
        assert_eq!(claude.total_memory_bytes, 300 + 20 + 30 + 1 + 120);
        assert_eq!(claude.mcp_servers, 1);
        assert_eq!(claude.dev_servers, 1);
        assert_eq!(claude.ports[0].port, 5173);
        assert_eq!(claude.host.as_deref(), Some("Terminal"));
        assert_eq!(claude.project.as_ref().unwrap().name, "web");
        let gemini = s.iter().find(|x| x.agent == "gemini-cli").unwrap();
        assert!(gemini.children.is_empty());
    }

    #[test]
    fn identifies_windows_agents_run_by_node_exe() {
        let mut copilot = proc(
            10,
            1,
            "node.exe",
            &[
                r"C:\Program Files\nodejs\node.exe",
                r"C:\Users\u\AppData\Roaming\npm\node_modules\@github\copilot\index.js",
            ],
            100,
        );
        copilot.exe = Some(r"C:\Program Files\nodejs\node.exe".into());
        assert_eq!(identify(&copilot).map(|a| a.id), Some("copilot-cli"));
        let mut native = proc(11, 1, "copilot.exe", &[], 100);
        native.exe = Some(r"C:\Users\u\AppData\Local\copilot\copilot.exe".into());
        assert_eq!(identify(&native).map(|a| a.id), Some("copilot-cli"));
        let plain = proc(12, 1, "node.exe", &[r"C:\code\web\server.js"], 100);
        assert_eq!(identify(&plain).map(|a| a.id), None);
    }

    #[test]
    fn identifies_agents_started_through_a_bin_link() {
        // `npm i -g` / npx: node runs the bin link, not the package path.
        let cases = [
            (&["node", "/opt/homebrew/bin/qwen"][..], "qwen-code"),
            (
                &["node", "/Users/u/.npm/_npx/1a2b/node_modules/.bin/qwen"][..],
                "qwen-code",
            ),
            (
                &["node", "--no-warnings", "/usr/local/bin/gemini"][..],
                "gemini-cli",
            ),
            (
                &["node", "/opt/homebrew/bin/openclaw", "gateway"][..],
                "openclaw",
            ),
            (&["python3", "/Users/u/.local/bin/aider"][..], "aider"),
        ];
        for (args, want) in cases {
            assert_eq!(
                identify(&proc(10, 1, args[0], args, 100)).map(|a| a.id),
                Some(want),
                "{args:?}"
            );
        }
        // The package path still works, and ordinary scripts are not agents.
        let pkg = [
            "node",
            "/opt/homebrew/lib/node_modules/@qwen-code/qwen-code/cli-entry.js",
        ];
        assert_eq!(
            identify(&proc(11, 1, "node", &pkg, 100)).map(|a| a.id),
            Some("qwen-code")
        );
        for args in [
            &["node", "server.js", "qwen"][..],
            &["node", "/srv/app/index.js"][..],
        ] {
            assert_eq!(
                identify(&proc(12, 1, "node", args, 100)).map(|a| a.id),
                None,
                "{args:?}"
            );
        }
    }

    #[test]
    fn gui_apps_are_hosts_not_sessions() {
        let mut p = proc(5, 1, "claude", &[], 10);
        p.app_bundle = Some("/Applications/Claude.app".into());
        assert!(identify(&p).is_none());
        // "Claude" (the desktop app's process name) is not the CLI.
        assert!(identify(&proc(6, 1, "Claude", &[], 10)).is_none());
    }

    #[test]
    fn any_mcp_client_is_a_session() {
        let mut m = machine();
        // An unknown agent and a desktop app, each starting an MCP server.
        m.push(proc(80, 2, "mybot", &["mybot", "--serve"], 90));
        m.push(proc(
            81,
            80,
            "node",
            &["node", "/x/server-mcp/index.js"],
            10,
        ));
        let mut cursor = app(82, "/Applications/Cursor.app");
        cursor.name = "Cursor".into();
        m.push(cursor);
        m.push(proc(83, 82, "Cursor Helper: mcp-process", &[], 30));
        // A program with no MCP children is not an agent.
        m.push(proc(84, 2, "python3", &["python3", "train.py"], 500));
        m.push(proc(
            85,
            2,
            "python3",
            &["python3", "/Users/u/.hermes/hermes-agent/venv/bin/hermes"],
            120,
        ));
        let s = sessions(&snap(m, 0));
        let labels: Vec<&str> = s.iter().map(|x| x.label.as_str()).collect();
        assert!(labels.contains(&"Unrecognized agent (mybot)"), "{labels:?}");
        assert!(labels.contains(&"Cursor"), "{labels:?}");
        assert!(labels.contains(&"Hermes Agent"), "{labels:?}");
        assert!(!labels.iter().any(|l| l.contains("python3")));
        assert!(!s.iter().find(|x| x.label == "Cursor").unwrap().recognised);
        assert!(
            s.iter()
                .find(|x| x.label == "Hermes Agent")
                .unwrap()
                .recognised
        );
    }

    #[test]
    fn nested_agents_belong_to_their_parent_session() {
        let mut m = machine();
        m.push(proc(60, 10, "claude", &["claude", "-p"], 50));
        let s = sessions(&snap(m, 0));
        let claude = s.iter().find(|x| x.agent == "claude-code").unwrap();
        assert_eq!(claude.nested_agents, 1);
        assert_eq!(s.iter().filter(|x| x.agent == "claude-code").count(), 1);
    }

    #[test]
    fn processes_left_behind_are_attributed_to_their_session() {
        let mut t = AgentTracker::new();
        let r = t.update(&snap(machine(), 1_000));
        assert!(r.leftovers.is_empty());
        // The agent exits; its MCP server child and vite are reparented to launchd.
        let mut after: Vec<ProcessInfo> = machine()
            .into_iter()
            .filter(|p| p.pid != 10 && p.pid != 13)
            .collect();
        for p in after.iter_mut() {
            if p.pid == 11 || p.pid == 40 {
                p.parent_pid = Some(1);
            }
        }
        let r = t.update(&snap(after, 2_000));
        assert_eq!(r.sessions.len(), 1, "only gemini remains");
        let pids: Vec<u32> = r.leftovers.iter().map(|l| l.process.pid).collect();
        assert!(
            pids.contains(&40) && pids.contains(&11) && pids.contains(&12),
            "{pids:?}"
        );
        let vite = r.leftovers.iter().find(|l| l.process.pid == 40).unwrap();
        assert_eq!(vite.origin, LeftoverOrigin::SeenInSession);
        assert_eq!(vite.agent_label.as_deref(), Some("Claude Code"));
        assert_eq!(vite.agent_exited_at, Some(1_000));
        assert_eq!(vite.process.role, ChildRole::DevServer);
    }

    #[test]
    fn a_reused_pid_is_not_a_leftover() {
        let mut t = AgentTracker::new();
        t.update(&snap(machine(), 1_000));
        // The agent and its children exit; PID 40 is reused by an unrelated process.
        let mut other = proc(40, 2, "python3", &["python3", "x.py"], 5);
        other.start_time = 99_999;
        let r = t.update(&snap(
            vec![
                app(1, "/System/Applications/Utilities/Terminal.app"),
                proc(2, 1, "-zsh", &[], 2),
                other,
            ],
            2_000,
        ));
        assert!(r.leftovers.is_empty());
    }

    #[test]
    fn detached_dev_processes_are_reported_without_attribution() {
        let mut vite = proc(70, 1, "node", &["node", "node_modules/.bin/vite"], 80);
        vite.ports = vec![ListeningPort {
            address: "127.0.0.1".into(),
            port: 3000,
        }];
        let mut daemon = proc(71, 1, "node", &["node", "daemon.js"], 80);
        daemon.project = None;
        let mut t = AgentTracker::new();
        let r = t.update(&snap(vec![vite, daemon], 1));
        assert_eq!(r.leftovers.len(), 1);
        assert_eq!(r.leftovers[0].origin, LeftoverOrigin::Detached);
        assert!(r.leftovers[0].agent_label.is_none());
    }
}
