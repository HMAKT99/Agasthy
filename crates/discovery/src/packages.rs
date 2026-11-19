//! Package-manager inventories.
//!
//! Each manager is read with one fixed, read-only command. Parsers take that
//! command's output and are unit-tested against recorded samples.

use std::path::{Path, PathBuf};
use std::time::Duration;

use agasthy_core::{
    Confidence, EntityInput, EntityKind, EvidenceInput, IngestBatch, IssueKind, PruneScope,
    RelationKind, RelationshipInput, ScanIssue, ScanKind,
};
use agasthy_platform::{CommandError, CommandRunner, CommandSpec, PackageManagerId, Platform};
use agasthy_provenance::{ProvenanceSource, confidence_for, parse_github_homepage};

use crate::attrs::{ManagerState, PackageAttrs, PackageManagerAttrs};
use crate::catalog::PROBE_ENV;
use crate::repos::remote_entity;
use crate::software::app_id;
use crate::version::extract_version;
use crate::{ProgressFn, ScanProgress};

#[derive(Debug, Clone, PartialEq)]
pub struct PackageRecord {
    pub name: String,
    pub version: Option<String>,
    pub attrs: PackageAttrs,
    /// Entity id override (Homebrew casks use a separate namespace).
    pub id: String,
    /// Names of packages from the same manager this one needs at runtime.
    pub depends_on: Vec<String>,
}

impl PackageRecord {
    fn new(manager: PackageManagerId, kind: &str, name: &str, version: Option<String>) -> Self {
        Self {
            depends_on: Vec::new(),
            id: format!("package:{}:{}", manager.as_str(), name),
            name: name.into(),
            version,
            attrs: PackageAttrs {
                manager,
                package_kind: kind.into(),
                description: None,
                homepage: None,
                license: None,
                installed_on_request: None,
                upstream: None,
                provides: Vec::new(),
                install_path: None,
            },
        }
    }
}

/// The read-only command used to list a manager's packages.
pub fn inventory_command(id: PackageManagerId) -> Option<CommandSpec> {
    let spec = match id {
        PackageManagerId::Homebrew => {
            CommandSpec::new("brew", &["info", "--json=v2", "--installed"])
                .timeout(Duration::from_secs(120))
                .max_output(96 * 1024 * 1024)
        }
        PackageManagerId::Npm => CommandSpec::new("npm", &["ls", "-g", "--depth=0", "--json"])
            .timeout(Duration::from_secs(60)),
        PackageManagerId::Pnpm => CommandSpec::new("pnpm", &["ls", "-g", "--depth=0", "--json"])
            .timeout(Duration::from_secs(60)),
        PackageManagerId::Uv => {
            CommandSpec::new("uv", &["tool", "list"]).timeout(Duration::from_secs(30))
        }
        PackageManagerId::Pip => CommandSpec::new(
            "python3",
            &[
                "-m",
                "pip",
                "list",
                "--format=json",
                "--disable-pip-version-check",
                "--no-input",
            ],
        )
        .timeout(Duration::from_secs(60)),
        PackageManagerId::Cargo => {
            CommandSpec::new("cargo", &["install", "--list"]).timeout(Duration::from_secs(30))
        }
        // `scoop export` prints installed apps as JSON; it changes nothing.
        PackageManagerId::Scoop => {
            CommandSpec::new("scoop", &["export"]).timeout(Duration::from_secs(60))
        }
        // Chocolatey 2.x lists only local packages (1.x would query the
        // network; it is refused below).
        PackageManagerId::Chocolatey => {
            CommandSpec::new("choco", &["list", "--limit-output"]).timeout(Duration::from_secs(60))
        }
        PackageManagerId::Flatpak => CommandSpec::new(
            "flatpak",
            &["list", "--app", "--columns=application,version,origin"],
        )
        .timeout(Duration::from_secs(30)),
        PackageManagerId::Snap => {
            CommandSpec::new("snap", &["list", "--unicode=never", "--color=never"])
                .timeout(Duration::from_secs(30))
        }
        // `pacman -Qi` reads the local package database only (no sync, no
        // network, no root). LC_ALL=C keeps the field names in English.
        PackageManagerId::Pacman => CommandSpec::new("pacman", &["-Qi", "--color", "never"])
            .env("LC_ALL", "C")
            .timeout(Duration::from_secs(60))
            .max_output(64 * 1024 * 1024),
        _ => return None,
    };
    let mut spec = spec;
    for (k, v) in PROBE_ENV {
        spec = spec.env(k, v);
    }
    Some(spec)
}

fn version_command(id: PackageManagerId) -> CommandSpec {
    let args: &[&str] = match id {
        PackageManagerId::Pip => &["-m", "pip", "--version"],
        _ => &["--version"],
    };
    let mut spec = CommandSpec::new(id.binary(), args).timeout(Duration::from_secs(10));
    for (k, v) in PROBE_ENV {
        spec = spec.env(k, v);
    }
    spec
}

pub fn parse_inventory(id: PackageManagerId, stdout: &str) -> Result<Vec<PackageRecord>, String> {
    match id {
        PackageManagerId::Homebrew => parse_brew(stdout),
        PackageManagerId::Npm => parse_npm(stdout, PackageManagerId::Npm),
        PackageManagerId::Pnpm => parse_pnpm(stdout),
        PackageManagerId::Uv => Ok(parse_uv(stdout)),
        PackageManagerId::Pip => parse_pip(stdout),
        PackageManagerId::Cargo => Ok(parse_cargo(stdout)),
        PackageManagerId::Scoop => parse_scoop(stdout),
        PackageManagerId::Chocolatey => Ok(parse_choco(stdout)),
        PackageManagerId::Flatpak => Ok(parse_flatpak(stdout)),
        PackageManagerId::Snap => Ok(parse_snap(stdout)),
        PackageManagerId::Pacman => Ok(parse_pacman(stdout)),
        other => Err(format!(
            "{} inventory is not implemented",
            other.display_name()
        )),
    }
}

fn s(v: &serde_json::Value, k: &str) -> Option<String> {
    v.get(k)
        .and_then(|x| x.as_str())
        .map(|x| x.trim().chars().take(512).collect::<String>())
        .filter(|x| !x.is_empty())
}

pub fn parse_brew(stdout: &str) -> Result<Vec<PackageRecord>, String> {
    let v: serde_json::Value =
        serde_json::from_str(stdout).map_err(|e| format!("invalid JSON from brew: {e}"))?;
    let mut out = Vec::new();
    for f in v
        .get("formulae")
        .and_then(|x| x.as_array())
        .into_iter()
        .flatten()
    {
        let Some(name) = s(f, "name") else { continue };
        let installed = f.get("installed").and_then(|x| x.as_array());
        let latest_installed = installed.and_then(|a| a.last());
        let version = latest_installed
            .and_then(|i| s(i, "version"))
            .or_else(|| f.get("versions").and_then(|v| s(v, "stable")));
        let mut rec = PackageRecord::new(PackageManagerId::Homebrew, "formula", &name, version);
        rec.attrs.description = s(f, "desc");
        rec.attrs.homepage = s(f, "homepage");
        rec.attrs.license = s(f, "license");
        rec.attrs.installed_on_request = latest_installed
            .and_then(|i| i.get("installed_on_request"))
            .and_then(|b| b.as_bool());
        rec.attrs.upstream = rec
            .attrs
            .homepage
            .as_deref()
            .and_then(parse_github_homepage);
        // What the *installed* keg links to (it can differ from the current
        // formula definition, e.g. built against openssl@3 while the formula now
        // names openssl@4). Fall back to the formula's list when absent.
        let runtime: Option<Vec<String>> = latest_installed
            .and_then(|i| i.get("runtime_dependencies"))
            .and_then(|r| r.as_array())
            .map(|a| {
                a.iter()
                    .filter(|d| d.get("declared_directly").and_then(|x| x.as_bool()) != Some(false))
                    .filter_map(|d| d.get("full_name").and_then(|n| n.as_str()))
                    .map(|n| n.rsplit('/').next().unwrap_or(n).to_string())
                    .collect()
            });
        rec.depends_on = runtime.unwrap_or_else(|| {
            f.get("dependencies")
                .and_then(|d| d.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default()
        });
        out.push(rec);
    }
    for c in v
        .get("casks")
        .and_then(|x| x.as_array())
        .into_iter()
        .flatten()
    {
        let Some(token) = s(c, "token") else { continue };
        let version = s(c, "installed").or_else(|| s(c, "version"));
        let display = c
            .get("name")
            .and_then(|n| n.as_array())
            .and_then(|a| a.first())
            .and_then(|n| n.as_str())
            .map(str::to_string);
        let mut rec = PackageRecord::new(PackageManagerId::Homebrew, "cask", &token, version);
        rec.id = format!("package:homebrew-cask:{token}");
        rec.attrs.description = s(c, "desc").or(display);
        rec.attrs.homepage = s(c, "homepage");
        rec.attrs.upstream = rec
            .attrs
            .homepage
            .as_deref()
            .and_then(parse_github_homepage);
        for art in c
            .get("artifacts")
            .and_then(|a| a.as_array())
            .into_iter()
            .flatten()
        {
            if let Some(apps) = art.get("app").and_then(|a| a.as_array()) {
                for app in apps {
                    // Entries are "Name.app" or {"target": "Name.app"}.
                    if let Some(name) = app.as_str() {
                        rec.attrs.provides.push(name.to_string());
                    } else if let Some(t) = app.get("target").and_then(|t| t.as_str()) {
                        rec.attrs.provides.push(t.to_string());
                    }
                }
            }
        }
        out.push(rec);
    }
    Ok(out)
}

pub fn parse_npm(stdout: &str, manager: PackageManagerId) -> Result<Vec<PackageRecord>, String> {
    let v: serde_json::Value =
        serde_json::from_str(stdout).map_err(|e| format!("invalid JSON from npm: {e}"))?;
    let mut out = Vec::new();
    if let Some(deps) = v.get("dependencies").and_then(|d| d.as_object()) {
        for (name, info) in deps {
            let mut rec = PackageRecord::new(manager, "global", name, s(info, "version"));
            rec.attrs.install_path = s(info, "path");
            out.push(rec);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn parse_pnpm(stdout: &str) -> Result<Vec<PackageRecord>, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let v: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("invalid JSON from pnpm: {e}"))?;
    let mut out = Vec::new();
    let roots: Vec<&serde_json::Value> = match &v {
        serde_json::Value::Array(a) => a.iter().collect(),
        other => vec![other],
    };
    for root in roots {
        for key in ["dependencies", "devDependencies"] {
            if let Some(deps) = root.get(key).and_then(|d| d.as_object()) {
                for (name, info) in deps {
                    let mut rec = PackageRecord::new(
                        PackageManagerId::Pnpm,
                        "global",
                        name,
                        s(info, "version"),
                    );
                    rec.attrs.install_path = s(info, "path");
                    out.push(rec);
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out.dedup_by(|a, b| a.name == b.name);
    Ok(out)
}

pub fn parse_uv(stdout: &str) -> Vec<PackageRecord> {
    let mut out: Vec<PackageRecord> = Vec::new();
    for line in stdout.lines() {
        let l = line.trim_end();
        if l.is_empty() || l.starts_with("No tools") {
            continue;
        }
        if let Some(exe) = l.trim_start().strip_prefix("- ") {
            if let Some(last) = out.last_mut() {
                last.attrs.provides.push(exe.trim().to_string());
            }
            continue;
        }
        if l.starts_with(' ') || l.starts_with('\t') {
            continue;
        }
        let mut parts = l.split_whitespace();
        let Some(name) = parts.next() else { continue };
        let version = parts.next().map(|v| v.trim_start_matches('v').to_string());
        out.push(PackageRecord::new(
            PackageManagerId::Uv,
            "tool",
            name,
            version,
        ));
    }
    out
}

pub fn parse_pip(stdout: &str) -> Result<Vec<PackageRecord>, String> {
    let v: serde_json::Value =
        serde_json::from_str(stdout.trim()).map_err(|e| format!("invalid JSON from pip: {e}"))?;
    let arr = v.as_array().ok_or("pip output is not a list")?;
    let mut out = Vec::new();
    for p in arr {
        let Some(name) = s(p, "name") else { continue };
        out.push(PackageRecord::new(
            PackageManagerId::Pip,
            "distribution",
            &name.to_lowercase(),
            s(p, "version"),
        ));
    }
    Ok(out)
}

pub fn parse_cargo(stdout: &str) -> Vec<PackageRecord> {
    let mut out: Vec<PackageRecord> = Vec::new();
    for line in stdout.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = out.last_mut() {
                let b = line.trim();
                if !b.is_empty() {
                    last.attrs.provides.push(b.to_string());
                }
            }
            continue;
        }
        let l = line.trim().trim_end_matches(':');
        if l.is_empty() {
            continue;
        }
        let mut parts = l.splitn(3, ' ');
        let Some(name) = parts.next() else { continue };
        let version = parts.next().map(|v| v.trim_start_matches('v').to_string());
        let mut rec = PackageRecord::new(PackageManagerId::Cargo, "crate", name, version);
        if let Some(src) = parts.next() {
            rec.attrs.install_path = Some(src.trim_matches(|c| c == '(' || c == ')').to_string());
        }
        out.push(rec);
    }
    out
}

/// `scoop export`: JSON `{"apps":[{"Name","Version","Source"}]}` (current
/// Scoop) or text lines `name (v:1.2.3) [bucket]` (older Scoop).
pub fn parse_scoop(stdout: &str) -> Result<Vec<PackageRecord>, String> {
    let text = stdout.trim().trim_start_matches('\u{feff}');
    if text.starts_with('{') {
        let v: serde_json::Value =
            serde_json::from_str(text).map_err(|e| format!("invalid JSON from scoop: {e}"))?;
        let apps = v
            .get("apps")
            .and_then(|a| a.as_array())
            .ok_or("scoop export has no apps list")?;
        return Ok(apps
            .iter()
            .filter_map(|a| {
                let name = s(a, "Name")?;
                let mut rec =
                    PackageRecord::new(PackageManagerId::Scoop, "app", &name, s(a, "Version"));
                rec.attrs.description = s(a, "Source").map(|b| format!("bucket: {b}"));
                Some(rec)
            })
            .collect());
    }
    Ok(text
        .lines()
        .filter_map(|l| {
            let mut parts = l.split_whitespace();
            let name = parts.next()?;
            let version = parts
                .next()
                .and_then(|v| v.strip_prefix("(v:"))
                .map(|v| v.trim_end_matches(')').to_string());
            version
                .is_some()
                .then(|| PackageRecord::new(PackageManagerId::Scoop, "app", name, version))
        })
        .collect())
}

/// `choco list --limit-output`: `name|version` per line.
pub fn parse_choco(stdout: &str) -> Vec<PackageRecord> {
    stdout
        .lines()
        .filter_map(|l| {
            let (name, version) = l.trim().split_once('|')?;
            (!name.is_empty()).then(|| {
                PackageRecord::new(
                    PackageManagerId::Chocolatey,
                    "package",
                    &name.to_lowercase(),
                    Some(version.trim().to_string()).filter(|v| !v.is_empty()),
                )
            })
        })
        .collect()
}

/// `flatpak list --app --columns=application,version,origin`: tab-separated.
pub fn parse_flatpak(stdout: &str) -> Vec<PackageRecord> {
    stdout
        .lines()
        .filter_map(|l| {
            let mut cols = l.split('\t').map(str::trim);
            let app = cols
                .next()
                .filter(|a| !a.is_empty() && *a != "Application ID")?;
            let version = cols.next().filter(|v| !v.is_empty()).map(str::to_string);
            let mut rec = PackageRecord::new(PackageManagerId::Flatpak, "app", app, version);
            rec.attrs.description = cols
                .next()
                .filter(|o| !o.is_empty())
                .map(|o| format!("remote: {o}"));
            Some(rec)
        })
        .collect()
}

/// `pacman -Qi` (LC_ALL=C): one `Field : value` block per package, blocks
/// separated by a blank line; a value that wraps continues on indented lines.
///
/// "Depends On" names can carry a version constraint (`glibc>=2.38`) or be a
/// virtual name another package provides (`sh` from bash, `libreadline.so=8-64`
/// from readline). Each is resolved to the installed package that satisfies
/// it, so impact analysis follows real packages; names nothing provides are
/// dropped.
pub fn parse_pacman(stdout: &str) -> Vec<PackageRecord> {
    fn bare(token: &str) -> &str {
        token.split(['<', '>', '=']).next().unwrap_or(token).trim()
    }
    fn names(value: &str) -> Vec<String> {
        if value.trim() == "None" {
            return Vec::new();
        }
        value
            .split_whitespace()
            .map(bare)
            .filter(|n| !n.is_empty())
            .map(str::to_string)
            .collect()
    }

    let mut blocks: Vec<Vec<(String, String)>> = Vec::new();
    let mut fields: Vec<(String, String)> = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            if !fields.is_empty() {
                blocks.push(std::mem::take(&mut fields));
            }
        } else if line.starts_with(char::is_whitespace) {
            if let Some((_, v)) = fields.last_mut() {
                v.push(' ');
                v.push_str(line.trim());
            }
        } else if let Some((k, v)) = line.split_once(':') {
            fields.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    if !fields.is_empty() {
        blocks.push(fields);
    }

    let mut out = Vec::new();
    let mut provides: Vec<(String, Vec<String>)> = Vec::new();
    for block in blocks {
        let get = |k: &str| {
            block
                .iter()
                .find(|(key, _)| key == k)
                .map(|(_, v)| v.as_str())
                .filter(|v| !v.is_empty() && *v != "None")
        };
        let Some(name) = get("Name") else { continue };
        let mut rec = PackageRecord::new(
            PackageManagerId::Pacman,
            "package",
            name,
            get("Version").map(str::to_string),
        );
        rec.attrs.description = get("Description").map(str::to_string);
        rec.attrs.homepage = get("URL").map(str::to_string);
        rec.attrs.license = get("Licenses").map(str::to_string);
        rec.attrs.installed_on_request = get("Install Reason").map(|r| r.starts_with("Explicitly"));
        rec.attrs.upstream = rec
            .attrs
            .homepage
            .as_deref()
            .and_then(parse_github_homepage);
        rec.depends_on = names(get("Depends On").unwrap_or("None"));
        provides.push((name.to_string(), names(get("Provides").unwrap_or("None"))));
        out.push(rec);
    }

    // A real package name wins over a virtual one; among providers, the first listed.
    let mut provider_of: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for (pkg, virtuals) in &provides {
        for v in virtuals {
            provider_of.entry(v.clone()).or_insert_with(|| pkg.clone());
        }
    }
    for rec in &out {
        provider_of.insert(rec.name.clone(), rec.name.clone());
    }
    let provider = |dep: &str| provider_of.get(dep).cloned();
    for rec in &mut out {
        let mut deps: Vec<String> = Vec::new();
        for d in &rec.depends_on {
            if let Some(p) = provider(d)
                && p != rec.name
                && !deps.contains(&p)
            {
                deps.push(p);
            }
        }
        rec.depends_on = deps;
    }
    out
}

/// `snap list`: whitespace table `Name Version Rev Tracking Publisher Notes`.
pub fn parse_snap(stdout: &str) -> Vec<PackageRecord> {
    stdout
        .lines()
        .filter(|l| !l.starts_with("Name ") && !l.trim().is_empty())
        .filter_map(|l| {
            let mut cols = l.split_whitespace();
            let name = cols.next()?;
            let version = cols.next().map(str::to_string);
            let notes = l.split_whitespace().nth(5).unwrap_or("");
            let kind =
                if notes.contains("base") || notes.contains("core") || notes.contains("snapd") {
                    "base"
                } else {
                    "snap"
                };
            Some(PackageRecord::new(
                PackageManagerId::Snap,
                kind,
                name,
                version,
            ))
        })
        .collect()
}

/// Read every package manager the platform supports and build an ingest batch.
pub fn scan_packages(
    platform: &dyn Platform,
    runner: &dyn CommandRunner,
    progress: ProgressFn<'_>,
) -> IngestBatch {
    let mut batch = IngestBatch::new(ScanKind::Packages);
    let managers = platform.supported_package_managers();
    let total = managers.len() as u32;
    let app_dirs: Vec<PathBuf> = {
        let mut v = vec![PathBuf::from("/Applications")];
        if let Some(h) = platform.home_dir() {
            v.push(h.join("Applications"));
        }
        v
    };

    for (i, support) in managers.iter().enumerate() {
        let id = support.id;
        progress(ScanProgress {
            phase: "packages".into(),
            done: i as u32,
            total: Some(total),
            current: Some(id.display_name().into()),
        });
        let manager_entity_id = format!("package_manager:{}", id.as_str());
        let binary = runner.resolve(id.binary());
        let mut attrs = PackageManagerAttrs {
            manager: id,
            display_name: id.display_name().into(),
            state: ManagerState::NotInstalled,
            package_count: None,
            inventory_command: inventory_command(id).map(|c| c.display()),
        };
        let mut evidence = Vec::new();

        match (&binary, support.inventory_implemented) {
            (None, _) => {
                evidence.push(EvidenceInput::new(
                    "executable_missing",
                    format!(
                        "`{}` was not found in the searched directories",
                        id.binary()
                    ),
                    "PATH search",
                    Confidence::Verified,
                ));
            }
            (Some(bin), false) => {
                attrs.state = ManagerState::NotImplemented {
                    binary: bin.display().to_string(),
                };
                batch.issues.push(ScanIssue::new(
                    IssueKind::Unsupported,
                    id.display_name(),
                    "installed, but reading its inventory is not implemented in this build",
                ));
            }
            (Some(bin), true) => {
                let version = runner
                    .run(&version_command(id))
                    .ok()
                    .and_then(|o| extract_version(&format!("{}\n{}", o.stdout, o.stderr)));
                let cmd = inventory_command(id).expect("implemented managers have a command");
                let choco_v1 = id == PackageManagerId::Chocolatey
                    && version.as_deref().is_some_and(|v| {
                        v.split('.')
                            .next()
                            .and_then(|m| m.parse::<u32>().ok())
                            .is_some_and(|m| m < 2)
                    });
                let result = if choco_v1 {
                    Err("Chocolatey 1.x lists remote packages by default; AGASTHY only reads Chocolatey 2.x so that no network query is made".to_string())
                } else {
                    run_inventory(runner, &cmd, id)
                };
                match result {
                    Ok(records) => {
                        attrs.package_count = Some(records.len() as u32);
                        attrs.state = ManagerState::Read {
                            binary: bin.display().to_string(),
                            version: version.clone(),
                        };
                        evidence.push(EvidenceInput::new(
                            "inventory_command",
                            format!("{} packages listed", records.len()),
                            cmd.display(),
                            Confidence::Verified,
                        ));
                        for rec in records {
                            push_package(&mut batch, rec, &manager_entity_id, &cmd, &app_dirs);
                        }
                        batch.prune.push(PruneScope {
                            kind: EntityKind::Package,
                            source: Some(id.as_str().into()),
                        });
                    }
                    Err(message) => {
                        batch.issues.push(ScanIssue::new(
                            IssueKind::CommandFailed,
                            id.display_name(),
                            message.clone(),
                        ));
                        attrs.state = ManagerState::Failed {
                            binary: bin.display().to_string(),
                            message,
                        };
                    }
                }
            }
        }

        batch.entities.push(EntityInput {
            id: manager_entity_id,
            kind: EntityKind::PackageManager,
            name: id.display_name().into(),
            path: binary.as_ref().map(|b| b.display().to_string()),
            version: match &attrs.state {
                ManagerState::Read { version, .. } => version.clone(),
                _ => None,
            },
            source: "package_managers".into(),
            attributes: serde_json::to_value(&attrs).unwrap_or_default(),
            evidence,
        });
    }
    batch.prune.push(PruneScope {
        kind: EntityKind::PackageManager,
        source: None,
    });
    progress(ScanProgress {
        phase: "done".into(),
        done: total,
        total: Some(total),
        current: None,
    });
    batch
}

fn run_inventory(
    runner: &dyn CommandRunner,
    cmd: &CommandSpec,
    id: PackageManagerId,
) -> Result<Vec<PackageRecord>, String> {
    let out = runner.run(cmd).map_err(|e| match e {
        CommandError::TimedOut { after_ms, .. } => {
            format!(
                "`{}` did not finish within {} s",
                cmd.display(),
                after_ms / 1000
            )
        }
        other => other.to_string(),
    })?;
    if out.truncated {
        return Err(format!(
            "output of `{}` exceeded the size limit",
            cmd.display()
        ));
    }
    // npm and pnpm exit non-zero for peer-dependency warnings but still print
    // valid JSON, so the parser decides.
    match parse_inventory(id, &out.stdout) {
        Ok(r) => Ok(r),
        Err(parse_err) if !out.success() => Err(format!(
            "`{}` exited with {:?}: {}",
            cmd.display(),
            out.exit_code,
            out.stderr
                .lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or(&parse_err)
        )),
        Err(e) => Err(e),
    }
}

fn push_package(
    batch: &mut IngestBatch,
    rec: PackageRecord,
    manager_entity_id: &str,
    cmd: &CommandSpec,
    app_dirs: &[PathBuf],
) {
    let manager = rec.attrs.manager;
    batch.relationships.push(RelationshipInput {
        attributes: serde_json::Value::Null,
        from_id: rec.id.clone(),
        to_id: manager_entity_id.to_string(),
        kind: RelationKind::ManagedBy,
        confidence: Confidence::Verified,
        evidence: vec![EvidenceInput::new(
            "inventory_command",
            format!("listed by {}", manager.display_name()),
            cmd.display(),
            Confidence::Verified,
        )],
    });
    for dep in &rec.depends_on {
        batch.relationships.push(RelationshipInput {
            from_id: rec.id.clone(),
            to_id: format!("package:{}:{dep}", manager.as_str()),
            kind: RelationKind::DependsOn,
            confidence: Confidence::Verified,
            attributes: serde_json::Value::Null,
            evidence: vec![EvidenceInput::new(
                "package_dependency",
                format!(
                    "{} lists `{dep}` as a dependency of `{}`",
                    manager.display_name(),
                    rec.name
                ),
                cmd.display(),
                Confidence::Verified,
            )],
        });
    }
    if let Some(up) = &rec.attrs.upstream {
        let rid = up.entity_id();
        if !batch.entities.iter().any(|e| e.id == rid) {
            batch
                .entities
                .push(remote_entity(&rid, up, "package_metadata"));
        }
        let conf = confidence_for(ProvenanceSource::PackageMetadata);
        batch.relationships.push(RelationshipInput {
            attributes: serde_json::Value::Null,
            from_id: rec.id.clone(),
            to_id: rid,
            kind: RelationKind::UpstreamProject,
            confidence: conf,
            evidence: vec![EvidenceInput::new(
                "package_homepage",
                format!(
                    "{} metadata gives homepage {}",
                    manager.display_name(),
                    rec.attrs.homepage.as_deref().unwrap_or("")
                ),
                cmd.display(),
                conf,
            )],
        });
    }
    if rec.attrs.package_kind == "cask" {
        for app in &rec.attrs.provides {
            if let Some(path) = app_dirs
                .iter()
                .map(|d| d.join(app))
                .find(|p| Path::new(p).is_dir())
            {
                batch.relationships.push(RelationshipInput {
                    attributes: serde_json::Value::Null,
                    from_id: rec.id.clone(),
                    to_id: app_id(&path.display().to_string()),
                    kind: RelationKind::Provides,
                    confidence: Confidence::Strong,
                    evidence: vec![EvidenceInput::new(
                        "cask_artifact",
                        format!(
                            "cask lists `{app}` as an app artifact and it exists at {}",
                            path.display()
                        ),
                        cmd.display(),
                        Confidence::Strong,
                    )],
                });
            }
        }
    }
    batch.entities.push(EntityInput {
        id: rec.id,
        kind: EntityKind::Package,
        name: rec.name,
        path: rec.attrs.install_path.clone(),
        version: rec.version,
        source: manager.as_str().into(),
        attributes: serde_json::to_value(&rec.attrs).unwrap_or_default(),
        evidence: vec![EvidenceInput::new(
            "package_manager_inventory",
            format!("listed by {}", manager.display_name()),
            cmd.display(),
            Confidence::Verified,
        )],
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use agasthy_platform::{CommandOutput, MockCommandRunner};

    // Recorded-shape samples (trimmed). Development fixtures only.
    const BREW: &str = r#"{"formulae":[{"name":"jq","full_name":"jq","dependencies":["oniguruma"],"desc":"Lightweight and flexible command-line JSON processor","license":"MIT","homepage":"https://jqlang.github.io/jq/","versions":{"stable":"1.7.1"},"installed":[{"version":"1.7.1","installed_on_request":true}]},{"name":"ripgrep","desc":"Search tool","license":"Unlicense","homepage":"https://github.com/BurntSushi/ripgrep","versions":{"stable":"14.1.1"},"dependencies":["pcre2@11"],"installed":[{"version":"14.1.1","installed_on_request":false,"runtime_dependencies":[{"full_name":"pcre2","version":"10.44","declared_directly":true},{"full_name":"indirect-lib","declared_directly":false}]}]}],"casks":[{"token":"visual-studio-code","name":["Microsoft Visual Studio Code"],"desc":"Open-source code editor","homepage":"https://code.visualstudio.com/","version":"1.96.0","installed":"1.95.3","artifacts":[{"app":["Visual Studio Code.app"]},{"binary":["code"]}]}]}"#;

    #[test]
    fn brew_parsing() {
        let r = parse_brew(BREW).unwrap();
        assert_eq!(r.len(), 3);
        let jq = &r[0];
        assert_eq!(jq.id, "package:homebrew:jq");
        assert_eq!(jq.version.as_deref(), Some("1.7.1"));
        assert_eq!(jq.attrs.installed_on_request, Some(true));
        assert!(
            jq.attrs.upstream.is_none(),
            "github.io homepage is not a repo"
        );
        assert_eq!(
            jq.depends_on,
            vec!["oniguruma"],
            "no runtime_dependencies: formula list"
        );
        assert_eq!(
            r[1].depends_on,
            vec!["pcre2"],
            "installed keg's direct runtime deps win"
        );
        let rg = &r[1];
        assert_eq!(
            rg.attrs.upstream.as_ref().unwrap().key(),
            "github.com/burntsushi/ripgrep"
        );
        let code = &r[2];
        assert_eq!(code.id, "package:homebrew-cask:visual-studio-code");
        assert_eq!(
            code.version.as_deref(),
            Some("1.95.3"),
            "installed, not latest"
        );
        assert_eq!(code.attrs.provides, vec!["Visual Studio Code.app"]);
        assert!(parse_brew("not json").is_err());
    }

    #[test]
    fn npm_and_pnpm_parsing() {
        let npm = r#"{"name":"lib","dependencies":{"typescript":{"version":"5.9.3"},"@anthropic-ai/claude-code":{"version":"2.1.0"}}}"#;
        let r = parse_npm(npm, PackageManagerId::Npm).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].id, "package:npm:@anthropic-ai/claude-code");
        let pnpm = r#"[{"path":"/x","dependencies":{"vercel":{"version":"39.0.0","path":"/x/node_modules/vercel"}}}]"#;
        let r = parse_pnpm(pnpm).unwrap();
        assert_eq!(r[0].name, "vercel");
        assert_eq!(
            r[0].attrs.install_path.as_deref(),
            Some("/x/node_modules/vercel")
        );
        assert!(parse_pnpm("").unwrap().is_empty());
    }

    #[test]
    fn uv_cargo_pip_parsing() {
        let uv = "ruff v0.6.9\n- ruff\nblack v24.1.0\n- black\n- blackd\n";
        let r = parse_uv(uv);
        assert_eq!(r.len(), 2);
        assert_eq!(r[1].attrs.provides, vec!["black", "blackd"]);
        assert_eq!(r[0].version.as_deref(), Some("0.6.9"));
        assert!(parse_uv("No tools installed\n").is_empty());

        let cargo = "cargo-watch v8.5.2:\n    cargo-watch\nmytool v0.1.0 (/Users/u/src/mytool):\n    mytool\n";
        let r = parse_cargo(cargo);
        assert_eq!(r.len(), 2);
        assert_eq!(
            r[1].attrs.install_path.as_deref(),
            Some("/Users/u/src/mytool")
        );
        assert_eq!(r[0].attrs.provides, vec!["cargo-watch"]);

        let pip = r#"[{"name":"Requests","version":"2.32.3"},{"name":"pip","version":"25.2"}]"#;
        let r = parse_pip(pip).unwrap();
        assert_eq!(r[0].id, "package:pip:requests");
    }

    #[test]
    fn windows_and_linux_manager_parsing() {
        let json = "\u{feff}{\"buckets\":[],\"apps\":[{\"Name\":\"git\",\"Version\":\"2.45.1\",\"Source\":\"main\"},{\"Name\":\"nodejs-lts\",\"Version\":\"20.14.0\",\"Source\":\"main\"}]}";
        let r = parse_scoop(json).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].id, "package:scoop:git");
        assert_eq!(r[1].version.as_deref(), Some("20.14.0"));
        let old = parse_scoop("git (v:2.45.1) [main]\n7zip (v:24.06) [main]\n").unwrap();
        assert_eq!(old[1].version.as_deref(), Some("24.06"));

        let choco = parse_choco("chocolatey|2.3.0\r\nGit|2.45.1\r\n\r\n");
        assert_eq!(choco.len(), 2);
        assert_eq!(choco[1].id, "package:chocolatey:git");

        let fp = parse_flatpak("org.mozilla.firefox\t127.0\tflathub\ndev.zed.Zed\t\tflathub\n");
        assert_eq!(fp.len(), 2);
        assert_eq!(fp[1].version, None);

        let snap = parse_snap(
            "Name    Version   Rev    Tracking       Publisher   Notes\ncore22  20240408  1380   latest/stable  canonical   base\ncode    1.90.0    160    latest/stable  vscode      classic\n",
        );
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].attrs.package_kind, "base");
        assert_eq!(snap[1].name, "code");
    }

    #[test]
    fn pacman_database_parsing() {
        // Recorded shape of `LC_ALL=C pacman -Qi`, trimmed to the fields used.
        let out = "\
Name            : bash
Version         : 5.2.037-1
Description     : The GNU Bourne Again shell
Architecture    : x86_64
URL             : https://www.gnu.org/software/bash/bash.html
Licenses        : GPL-3.0-or-later
Groups          : None
Provides        : sh
Depends On      : readline  libreadline.so=8-64  glibc  ncurses
Optional Deps   : bash-completion: for tab completion
                  bash-docs: for documentation
Install Reason  : Installed as a dependency for another package

Name            : readline
Version         : 8.2.013-1
Description     : GNU readline library
URL             : https://tiswww.case.edu/php/chet/readline/rltop.html
Licenses        : GPL-3.0-or-later
Provides        : libhistory.so=8-64  libreadline.so=8-64
Depends On      : glibc  ncurses  libncursesw.so=6-64
Install Reason  : Installed as a dependency for another package

Name            : glibc
Version         : 2.40+r16+gaa533d58ff-2
Description     : GNU C Library
URL             : https://www.gnu.org/software/libc
Licenses        : GPL-2.0-or-later  LGPL-2.1-or-later
Provides        : None
Depends On      : linux-api-headers>=4.10  tzdata  filesystem
Install Reason  : Installed as a dependency for another package

Name            : ncurses
Version         : 6.5-3
Description     : System V Release 4.0 curses emulation library
URL             : https://invisible-island.net/ncurses/ncurses.html
Licenses        : MIT-open-group
Provides        : libncursesw.so=6-64  libformw.so=6-64
Depends On      : glibc  gcc-libs
Install Reason  : Installed as a dependency for another package

Name            : lazygit
Version         : 0.44.1-1
Description     : Simple terminal UI for git commands
URL             : https://github.com/jesseduffield/lazygit
Licenses        : MIT
Provides        : None
Depends On      : git
                  glibc
Install Reason  : Explicitly installed

Name            : git
Version         : 2.47.1-1
Description     : the fast distributed version control system
URL             : https://git-scm.com/
Licenses        : GPL-2.0-only
Provides        : None
Depends On      : curl  expat  perl  zlib  glibc
Install Reason  : Explicitly installed
";
        let r = parse_pacman(out);
        assert_eq!(r.len(), 6);
        let by = |n: &str| r.iter().find(|p| p.name == n).unwrap();

        let bash = by("bash");
        assert_eq!(bash.id, "package:pacman:bash");
        assert_eq!(bash.version.as_deref(), Some("5.2.037-1"));
        assert_eq!(bash.attrs.installed_on_request, Some(false));
        assert_eq!(
            bash.attrs.homepage.as_deref(),
            Some("https://www.gnu.org/software/bash/bash.html")
        );
        // `libreadline.so=8-64` resolves to readline, which is listed once.
        assert_eq!(bash.depends_on, vec!["readline", "glibc", "ncurses"]);

        // A virtual soname resolves to its provider, not to itself.
        assert_eq!(by("readline").depends_on, vec!["glibc", "ncurses"]);
        // Version constraints are stripped; packages not installed are dropped.
        assert!(by("glibc").depends_on.is_empty());
        assert_eq!(by("ncurses").depends_on, vec!["glibc"]);
        assert_eq!(
            by("glibc").attrs.license.as_deref(),
            Some("GPL-2.0-or-later  LGPL-2.1-or-later")
        );

        // A wrapped "Depends On" continues on indented lines.
        let lazygit = by("lazygit");
        assert_eq!(lazygit.depends_on, vec!["git", "glibc"]);
        assert_eq!(lazygit.attrs.installed_on_request, Some(true));
        assert_eq!(
            lazygit.attrs.upstream.as_ref().map(|u| u.key()),
            Some("github.com/jesseduffield/lazygit".to_string())
        );
        assert_eq!(by("git").depends_on, vec!["glibc"]);

        assert!(parse_pacman("").is_empty());
        assert!(parse_pacman("error: something\n").is_empty());
    }

    /// Runs the real command on an Arch system (CI runs it in an Arch Linux
    /// container): `cargo test -p agasthy-discovery pacman_on_arch -- --ignored`.
    #[test]
    #[ignore = "needs pacman; run on Arch Linux"]
    fn pacman_on_arch() {
        let cmd = inventory_command(PackageManagerId::Pacman).unwrap();
        let mut c = std::process::Command::new("pacman");
        c.args(["-Qi", "--color", "never"]).env("LC_ALL", "C");
        let out = c.output().expect("pacman runs");
        assert!(out.status.success(), "{} failed", cmd.display());
        let stdout = String::from_utf8(out.stdout).unwrap();
        let r = parse_pacman(&stdout);
        let listed = std::process::Command::new("pacman")
            .arg("-Qq")
            .output()
            .unwrap();
        let count = String::from_utf8_lossy(&listed.stdout).lines().count();
        assert_eq!(r.len(), count, "every installed package is parsed");
        let by = |n: &str| r.iter().find(|p| p.name == n).unwrap();
        assert!(by("glibc").version.is_some());
        assert!(by("bash").depends_on.contains(&"readline".to_string()));
        assert!(by("bash").depends_on.contains(&"glibc".to_string()));
        assert!(by("pacman").attrs.description.is_some());
        let names: std::collections::HashSet<&str> = r.iter().map(|p| p.name.as_str()).collect();
        for p in &r {
            for d in &p.depends_on {
                assert!(names.contains(d.as_str()), "{} -> {d} is installed", p.name);
            }
        }
        println!("parsed {} pacman packages", r.len());
    }

    #[test]
    fn missing_failed_and_unimplemented_managers_are_reported_honestly() {
        let m = MockCommandRunner::new();
        // brew present and works; npm present but fails; others absent.
        m.on(
            "brew",
            &["--version"],
            Ok(CommandOutput::ok("Homebrew 7.0.12")),
        );
        m.on(
            "brew",
            &["info", "--json=v2", "--installed"],
            Ok(CommandOutput::ok(BREW)),
        );
        m.on("npm", &["--version"], Ok(CommandOutput::ok("11.6.0")));
        m.on(
            "npm",
            &["ls", "-g", "--depth=0", "--json"],
            Err(CommandError::TimedOut {
                program: "npm".into(),
                after_ms: 60_000,
            }),
        );
        let platform = agasthy_platform::current();
        let batch = scan_packages(platform.as_ref(), &m, &crate::no_progress);

        let mgr = |id: &str| {
            batch
                .entities
                .iter()
                .find(|e| e.id == format!("package_manager:{id}"))
                .map(|e| e.attributes["state"]["state"].as_str().unwrap().to_string())
        };
        if platform
            .supported_package_managers()
            .iter()
            .any(|s| s.id == PackageManagerId::Homebrew)
        {
            assert_eq!(mgr("homebrew").as_deref(), Some("read"));
            assert!(
                batch
                    .entities
                    .iter()
                    .any(|e| e.id == "package:homebrew:ripgrep")
            );
            assert!(
                batch
                    .prune
                    .iter()
                    .any(|p| p.source.as_deref() == Some("homebrew"))
            );
        }
        assert_eq!(mgr("npm").as_deref(), Some("failed"));
        assert_eq!(mgr("pnpm").as_deref(), Some("not_installed"));
        // npm failed, so its previously stored packages must not be pruned.
        assert!(
            !batch
                .prune
                .iter()
                .any(|p| p.source.as_deref() == Some("npm"))
        );
        assert!(batch.issues.iter().any(|i| i.subject.contains("npm")));
    }
}
