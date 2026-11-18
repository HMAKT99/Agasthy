//! AGASTHY desktop shell.
//!
//! This crate is deliberately thin: it owns application state, exposes typed
//! commands to the webview and forwards events. All product logic lives in the
//! `crates/` workspace members.

mod agents;
mod background;
mod commands;
mod diag;
mod insights;
mod intel;
mod operator;
mod ops;
mod reports;
mod state;

use tauri::Manager;

pub use commands::{AppInfo, Overview, ScanEvent, SearchDirInfo};
pub use intel::SecuritySettings;
pub use operator::OperatorSettings;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Checks only when the user (or the auto-check setting) asks; updates are signature-verified.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("could not resolve the app data directory: {e}"))?;
            let info = agasthy_platform::current().info();
            diag::init(
                &data_dir,
                agasthy_platform::current().home_dir().as_deref(),
                env!("CARGO_PKG_VERSION"),
                &format!(
                    "{} {} {}",
                    info.os,
                    info.os_version.unwrap_or_default(),
                    info.arch
                ),
            );
            let state = state::AppState::open(data_dir)
                .inspect_err(|e| diag::write("error", &format!("could not open state: {e}")))?;
            agents::start_sampler(state.0.clone());
            background::start_scheduler(app.handle().clone(), state.0.clone());
            if let Err(e) = background::build_tray(app.handle(), state.0.clone()) {
                eprintln!("menu bar item unavailable: {e}");
            }
            app.manage(state);
            Ok(())
        })
        // The menu-bar item keeps running when the window is closed; Quit is in its menu.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.app_handle().tray_by_id("agasthy").is_some()
            {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::telemetry,
            commands::gpus,
            commands::overview,
            commands::list_scan_roots,
            commands::add_scan_root,
            commands::remove_scan_root,
            commands::set_scan_root_enabled,
            commands::run_scan,
            commands::running_scans,
            commands::list_entities,
            commands::entity_detail,
            commands::list_scans,
            commands::list_audit,
            commands::graph_neighborhood,
            commands::graph_overview,
            commands::runtime_impact,
            commands::shared_dependencies,
            commands::list_edges,
            agents::agent_report,
            agents::agent_worktrees,
            agents::agent_usage,
            ops::processes,
            ops::disk_analysis,
            ops::cached_disk_analysis,
            ops::quarantine_list,
            ops::plan_action,
            ops::execute_action,
            intel::removal_impact,
            intel::snapshots_list,
            intel::snapshot_create,
            intel::snapshot_compare,
            intel::snapshot_reconstruction,
            intel::security_settings,
            intel::set_osv_enabled,
            intel::labs_list,
            operator::operator_settings,
            operator::operator_set_provider,
            operator::operator_set_key,
            operator::operator_delete_key,
            operator::operator_set_cloud_consent,
            operator::operator_ask,
            insights::insights,
            background::scan_schedule,
            background::set_auto_refresh,
            reports::diagnostics_report,
            reports::open_issue,
            reports::open_releases,
            reports::export_usage_csv,
        ])
        .build(tauri::generate_context!())
        .expect("error while building AGASTHY")
        .run(|app, event| {
            // Clicking the Dock icon brings the hidden window back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                background::show_main(app, None);
            }
            let _ = (app, event);
        });
}
