//! Linux adapter (unvalidated).
//!
//! Implemented and unit-tested, not yet run on Linux hardware: path
//! resolution, application inventory (`.desktop` entries, including Flatpak and
//! Snap exports), Flatpak / Snap package inventory, and the pacman database
//! (Arch Linux and derivatives such as Omarchy and Manjaro). GPU information
//! returns `Unsupported`.

pub mod apps;

use std::path::{Path, PathBuf};

use agasthy_core::{Availability, IssueKind, ScanIssue};

use crate::command::CommandRunner;
use crate::common::{process_path_dirs, push_unique, push_well_known_user_dirs};
use crate::types::*;
use crate::{AppInventory, AppScan, Platform, ProbePolicy, SystemPaths};

#[derive(Default)]
pub struct Linux;

impl Linux {
    pub fn new() -> Self {
        Self
    }
}

impl SystemPaths for Linux {
    fn executable_search_dirs(&self) -> Vec<SearchDir> {
        let mut out = process_path_dirs();
        for p in [
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/home/linuxbrew/.linuxbrew/bin",
        ] {
            let p = PathBuf::from(p);
            if p.is_dir() {
                push_unique(&mut out, p, SearchDirOrigin::WellKnown);
            }
        }
        push_well_known_user_dirs(&mut out, dirs::home_dir().as_deref());
        out
    }

    fn executable_file_names(&self, tool: &str) -> Vec<String> {
        vec![tool.to_string()]
    }

    fn is_protected_scan_root(&self, path: &Path) -> bool {
        let s = path.to_string_lossy();
        let s = s.trim_end_matches('/');
        let s = if s.is_empty() { "/" } else { s };
        matches!(
            s,
            "/" | "/proc"
                | "/sys"
                | "/dev"
                | "/usr"
                | "/bin"
                | "/sbin"
                | "/etc"
                | "/boot"
                | "/var"
                | "/run"
                | "/lib"
                | "/lib64"
                | "/tmp"
        ) || ["/proc/", "/sys/", "/dev/", "/usr/", "/etc/", "/boot/"]
            .iter()
            .any(|p| s.starts_with(p))
    }
}

impl AppInventory for Linux {
    fn list_applications(&self) -> AppScan {
        let (found, failed) = apps::read_all(&apps::entry_dirs(self.home_dir().as_deref()));
        AppScan {
            apps: Availability::available(found),
            issues: failed
                .into_iter()
                .map(|f| ScanIssue::new(IssueKind::PermissionDenied, "applications", f))
                .collect(),
        }
    }
}

impl ProbePolicy for Linux {
    fn may_probe_version(&self, _tool: &str, _path: &Path) -> Result<(), String> {
        Ok(())
    }
}

impl Platform for Linux {
    fn info(&self) -> PlatformInfo {
        PlatformInfo {
            os: "linux".into(),
            os_version: None,
            arch: std::env::consts::ARCH.into(),
            support_level: SupportLevel::Unvalidated,
        }
    }

    fn supported_package_managers(&self) -> Vec<PackageManagerSupport> {
        use PackageManagerId::*;
        [Homebrew, Npm, Pnpm, Uv, Pip, Cargo, Flatpak, Snap, Pacman]
            .into_iter()
            .map(|id| PackageManagerSupport {
                id,
                inventory_implemented: true,
            })
            .chain(std::iter::once(PackageManagerSupport {
                id: Yarn,
                inventory_implemented: false,
            }))
            .collect()
    }

    fn gpus(&self, _runner: &dyn CommandRunner) -> Availability<Vec<GpuInfo>> {
        Availability::unsupported("linux")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protected_roots() {
        let l = Linux::new();
        assert!(l.is_protected_scan_root(Path::new("/")));
        assert!(l.is_protected_scan_root(Path::new("/proc/1")));
        assert!(!l.is_protected_scan_root(Path::new("/home/dev/code")));
    }
}
