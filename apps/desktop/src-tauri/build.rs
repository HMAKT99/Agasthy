/// App commands exposed to the webview. Each one must also be granted in
/// `capabilities/default.json` (as `allow-<command-name>`), so nothing is
/// callable by accident.
const COMMANDS: &[&str] = &[
    "app_info",
    "telemetry",
    "gpus",
    "overview",
    "list_scan_roots",
    "add_scan_root",
    "remove_scan_root",
    "set_scan_root_enabled",
    "run_scan",
    "running_scans",
    "list_entities",
    "entity_detail",
    "list_scans",
    "list_audit",
    "graph_neighborhood",
    "graph_overview",
    "runtime_impact",
    "shared_dependencies",
    "list_edges",
    "agent_report",
    "agent_worktrees",
    "agent_usage",
    "insights",
    "scan_schedule",
    "set_auto_refresh",
    "diagnostics_report",
    "open_issue",
    "open_releases",
    "export_usage_csv",
    "processes",
    "disk_analysis",
    "cached_disk_analysis",
    "quarantine_list",
    "plan_action",
    "execute_action",
    "removal_impact",
    "snapshots_list",
    "snapshot_create",
    "snapshot_compare",
    "snapshot_reconstruction",
    "security_settings",
    "set_osv_enabled",
    "labs_list",
    "operator_settings",
    "operator_set_provider",
    "operator_set_key",
    "operator_delete_key",
    "operator_set_cloud_consent",
    "operator_ask",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
