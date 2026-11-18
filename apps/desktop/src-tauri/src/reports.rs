//! Shareable outputs:
//! * a "Report a problem" summary for GitHub issues (redacted Markdown the
//!   user reviews and edits before it goes anywhere);
//! * a token-usage CSV export.
//!
//! The web view never chooses a file path: the save dialog is opened from
//! Rust, and only the file the user picks there is written. The issue link can
//! only open this project's GitHub "new issue" page.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};

use agasthy_core::ScanStatus;
use agasthy_discovery::ai::usage::DayUsage;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::state::{AppState, Inner};

type CmdResult<T> = Result<T, String>;

pub const ISSUES_URL: &str = "https://github.com/HMAKT99/Agasthy/issues/new";
pub const RELEASES_URL: &str = "https://github.com/HMAKT99/Agasthy/releases/latest";
const LOG_LINES: usize = 40;
const MAX_ISSUE_BODY: usize = 6000;

fn gb(b: u64) -> String {
    format!("{:.0} GB", b as f64 / 1024.0 / 1024.0 / 1024.0)
}

fn ago(now: i64, t: i64) -> String {
    let m = (now - t) / 60_000;
    match m {
        m if m < 60 => format!("{m} min ago"),
        m if m < 48 * 60 => format!("{} h ago", m / 60),
        m => format!("{} days ago", m / 1440),
    }
}

/// Replace the home folder with `~` (and the user name, if it appears on its own in a path).
pub fn redact(text: &str, home: Option<&Path>) -> String {
    let mut out = text.to_string();
    if let Some(h) = home
        .map(|h| h.display().to_string())
        .filter(|h| h.len() > 1)
    {
        out = out.replace(&h, "~");
        if let Some(user) = Path::new(&h)
            .file_name()
            .map(|u| u.to_string_lossy().to_string())
            .filter(|u| u.len() > 2)
        {
            out = out
                .replace(&format!("/Users/{user}"), "~")
                .replace(&format!("/home/{user}"), "~")
                .replace(&format!("\\Users\\{user}"), "~");
        }
    }
    out
}

/// The report: environment, scan health, settings, a few counts and the tail
/// of the diagnostics log. No hostname, no project names, no paths outside `~`.
pub fn diagnostics_markdown(inner: &Inner) -> CmdResult<String> {
    let now = agasthy_core::time::now_ms();
    let info = inner.platform.info();
    let home = inner.platform.home_dir();
    let mut md = String::new();
    let t = inner
        .monitor
        .lock()
        .map_err(|_| "telemetry lock poisoned")?
        .sample();
    // The chip name does not need a CPU-usage sample.
    let cpu = sysinfo::System::new_with_specifics(
        sysinfo::RefreshKind::nothing().with_cpu(sysinfo::CpuRefreshKind::nothing()),
    )
    .cpus()
    .first()
    .map(|c| c.brand().trim().to_string())
    .filter(|b| !b.is_empty())
    .unwrap_or_else(|| "unknown CPU".into());
    let mem = t
        .memory
        .value()
        .map(|m| gb(m.total_bytes))
        .unwrap_or_else(|| "unknown".into());

    let _ = writeln!(md, "### Environment\n");
    let _ = writeln!(md, "- AGASTHY {}", env!("CARGO_PKG_VERSION"));
    let _ = writeln!(
        md,
        "- {} {} ({}), {cpu}, {mem} memory",
        match info.os.as_str() {
            "macos" => "macOS",
            "windows" => "Windows",
            "linux" => "Linux",
            o => o,
        },
        info.os_version.clone().unwrap_or_default(),
        info.arch
    );
    let _ = writeln!(md, "- Platform support: {:?}", info.support_level);

    {
        let s = inner.store.lock().map_err(|_| "database lock poisoned")?;
        let _ = writeln!(
            md,
            "\n### Scans\n\n| Area | Status | Finished | Found | Issues |\n|---|---|---|---|---|"
        );
        for r in s.latest_scans().unwrap_or_default() {
            let status = match r.status {
                ScanStatus::Running => "running",
                ScanStatus::Completed => "ok",
                ScanStatus::CompletedWithIssues => "ok with issues",
                ScanStatus::Failed => "failed",
            };
            let _ = writeln!(
                md,
                "| {} | {status} | {} | {} | {} |",
                r.kind.as_str(),
                r.finished_at
                    .map(|f| ago(now, f))
                    .unwrap_or_else(|| "—".into()),
                r.entities_found,
                r.issues.len()
            );
        }
        let roots = s.list_scan_roots().unwrap_or_default();
        let counts = s.counts_by_kind().unwrap_or_default();
        let _ = writeln!(md, "\n### Data\n");
        let _ = writeln!(md, "- Project folders added: {}", roots.len());
        let _ = writeln!(
            md,
            "- Items: {}",
            counts
                .iter()
                .filter(|c| c.count > 0)
                .map(|c| format!("{} {}", c.count, c.kind.as_str()))
                .collect::<Vec<_>>()
                .join(", ")
        );
        let setting = |k: &str| s.get_setting(k).ok().flatten();
        let ai = setting("ai.provider")
            .and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok())
            .and_then(|v| v.get("preset").and_then(|p| p.as_str()).map(str::to_string))
            .unwrap_or_else(|| "none (built-in only)".into());
        let _ = writeln!(md, "\n### Settings\n");
        let _ = writeln!(
            md,
            "- Background refresh: {}",
            if setting("scans.auto_refresh").as_deref() == Some("false") {
                "off"
            } else {
                "on"
            }
        );
        let _ = writeln!(
            md,
            "- OSV.dev checks: {}",
            if setting("security.osv_enabled").as_deref() == Some("true") {
                "on"
            } else {
                "off"
            }
        );
        let _ = writeln!(md, "- AI model: {ai}");
    }

    if let Ok(a) = crate::agents::latest(inner) {
        let mut by: std::collections::BTreeMap<&str, u32> = Default::default();
        for s in &a.sessions {
            *by.entry(s.label.as_str()).or_default() += 1;
        }
        let _ = writeln!(md, "\n### Agents\n");
        let _ = writeln!(
            md,
            "- Sessions: {} ({}); left running: {}; port data: {}",
            a.sessions.len(),
            by.iter()
                .map(|(l, n)| format!("{l} ×{n}"))
                .collect::<Vec<_>>()
                .join(", "),
            a.leftovers.len(),
            if a.port_data_available {
                "available"
            } else {
                "unavailable"
            }
        );
    }

    let log = crate::diag::log_dir(&inner.data_dir).join("agasthy.log");
    let tail: Vec<String> = std::fs::read_to_string(&log)
        .map(|t| {
            t.lines()
                .rev()
                .take(LOG_LINES)
                .map(str::to_string)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect()
        })
        .unwrap_or_default();
    let _ = writeln!(md, "\n### Recent diagnostics log\n\n```text");
    if tail.is_empty() {
        let _ = writeln!(md, "(empty)");
    }
    for l in tail {
        let _ = writeln!(md, "{l}");
    }
    let _ = writeln!(md, "```");
    Ok(redact(&md, home.as_deref()))
}

#[tauri::command]
pub async fn diagnostics_report(state: State<'_, AppState>) -> CmdResult<String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || diagnostics_markdown(&st.0))
        .await
        .map_err(|e| e.to_string())?
}

/// Percent-encode for a URL query value.
pub fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => {
                let _ = write!(out, "%{b:02X}");
            }
        }
    }
    out
}

/// Open the project's "new issue" page with the user's (reviewed) text.
#[tauri::command]
pub fn open_issue(
    app: AppHandle,
    state: State<'_, AppState>,
    title: String,
    body: String,
) -> CmdResult<()> {
    let title: String = title.trim().chars().take(200).collect();
    let mut body: String = body.chars().take(MAX_ISSUE_BODY).collect();
    if body.len() < body.chars().count() || body.chars().count() == MAX_ISSUE_BODY {
        body.push_str(
            "\n\n(Report shortened to fit a link; paste the full copy from AGASTHY if needed.)",
        );
    }
    let url = format!(
        "{ISSUES_URL}?title={}&body={}",
        url_encode(if title.is_empty() {
            "Problem report"
        } else {
            &title
        }),
        url_encode(&body)
    );
    if let Ok(s) = state.0.store.lock() {
        let _ = s.audit("user", "report.open_issue", "github.com", "ok", None);
    }
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| e.to_string())
}

/// Opens AGASTHY's latest release in the browser, for a copy that cannot
/// update itself. A fixed URL: the page cannot choose what is opened.
#[tauri::command]
pub fn open_releases(app: AppHandle) -> CmdResult<()> {
    app.opener()
        .open_url(RELEASES_URL, None::<String>)
        .map_err(|e| e.to_string())
}

// ----- token usage CSV -----

fn csv_field(s: &str) -> String {
    // Also neutralise spreadsheet formulas.
    let s = if s.starts_with(['=', '+', '-', '@']) {
        format!("'{s}")
    } else {
        s.to_string()
    };
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s
    }
}

pub fn usage_csv(days: &[DayUsage], home: Option<&Path>) -> String {
    let mut out = String::from(
        "day,agent,project_folder,model,input_tokens,output_tokens,cache_write_tokens,cache_read_tokens,requests,estimated_cost_usd\n",
    );
    let mut rows: Vec<&DayUsage> = days.iter().collect();
    rows.sort_by(|a, b| {
        (&b.day, &a.agent, &a.cwd, &a.model).cmp(&(&a.day, &b.agent, &b.cwd, &b.model))
    });
    for d in rows {
        let folder = d
            .cwd
            .as_deref()
            .map(|c| redact(c, home))
            .unwrap_or_default();
        let _ = writeln!(
            out,
            "{},{},{},{},{},{},{},{},{},{}",
            csv_field(&d.day),
            csv_field(&d.agent),
            csv_field(&folder),
            csv_field(&d.model),
            d.tokens.input,
            d.tokens.output,
            d.tokens.cache_write,
            d.tokens.cache_read,
            d.tokens.requests,
            d.estimated_cost_usd
                .map(|c| format!("{c:.4}"))
                .unwrap_or_default()
        );
    }
    out
}

/// Ask where to save, then write the CSV. Returns the saved path (with `~`),
/// or `None` if the user cancelled.
#[tauri::command]
pub async fn export_usage_csv(
    app: AppHandle,
    state: State<'_, AppState>,
    window_days: Option<u32>,
) -> CmdResult<Option<String>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let home = crate::ops::home(&st.0)?;
        let days = window_days.unwrap_or(30).clamp(1, 90);
        let report =
            st.0.usage
                .lock()
                .map_err(|_| "usage index lock poisoned")?
                .refresh(&home, days, agasthy_core::time::now_ms());
        let csv = usage_csv(&report.days, Some(&home));
        let name = format!(
            "agasthy-token-usage-{}d-{}.csv",
            days,
            crate::insights::date_of(agasthy_core::time::now_ms())
        );
        let Some(picked) = app
            .dialog()
            .file()
            .set_title("Export token usage")
            .set_file_name(&name)
            .add_filter("CSV", &["csv"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let mut path: PathBuf = picked.into_path().map_err(|e| e.to_string())?;
        if path
            .extension()
            .is_none_or(|e| !e.eq_ignore_ascii_case("csv"))
        {
            path.set_extension("csv");
        }
        std::fs::write(&path, csv).map_err(|e| format!("could not write the file: {e}"))?;
        if let Ok(s) = st.0.store.lock() {
            let _ = s.audit(
                "user",
                "export.usage_csv",
                &redact(&path.display().to_string(), Some(&home)),
                "ok",
                Some(&format!("{} rows, {days} days", report.days.len())),
            );
        }
        Ok(Some(redact(&path.display().to_string(), Some(&home))))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use agasthy_discovery::ai::usage::TokenCounts;

    #[test]
    fn redaction_and_encoding() {
        let home = Path::new("/Users/alice");
        assert_eq!(
            redact("/Users/alice/code/x and /Users/alice", Some(home)),
            "~/code/x and ~"
        );
        assert_eq!(url_encode("a b&c=d/é"), "a%20b%26c%3Dd%2F%C3%A9");
    }

    #[test]
    fn csv_rows_are_escaped_and_paths_shortened() {
        let t = TokenCounts {
            input: 1,
            output: 2,
            cache_write: 3,
            cache_read: 4,
            requests: 5,
        };
        let days = vec![
            DayUsage {
                day: "2026-11-15".into(),
                agent: "claude-code".into(),
                cwd: Some("/Users/alice/code/a,b".into()),
                model: "claude-opus-5-5".into(),
                tokens: t,
                estimated_cost_usd: Some(0.5),
            },
            DayUsage {
                day: "2026-11-16".into(),
                agent: "codex".into(),
                cwd: None,
                model: "=HYPERLINK(\"x\")".into(),
                tokens: t,
                estimated_cost_usd: None,
            },
        ];
        let csv = usage_csv(&days, Some(Path::new("/Users/alice")));
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 3);
        assert!(
            lines[1].starts_with("2026-11-16,codex,,"),
            "newest first: {}",
            lines[1]
        );
        assert!(
            lines[1].contains("\"'=HYPERLINK(\"\"x\"\")\""),
            "formula neutralised and quoted: {}",
            lines[1]
        );
        assert!(lines[1].ends_with(",5,"), "no price → empty cost");
        assert!(lines[2].contains("\"~/code/a,b\""));
        assert!(lines[2].ends_with(",5,0.5000"));
    }
}

/// Manual check: `AGASTHY_LIVE_DATA=<copy of data dir> cargo test -p agasthy-desktop live_report -- --ignored --nocapture`
#[cfg(test)]
mod live {
    #[test]
    #[ignore]
    fn live_report() {
        let Ok(dir) = std::env::var("AGASTHY_LIVE_DATA") else {
            return;
        };
        let st = crate::state::AppState::open(dir.into()).unwrap();
        println!("{}", super::diagnostics_markdown(&st.0).unwrap());
    }
}
