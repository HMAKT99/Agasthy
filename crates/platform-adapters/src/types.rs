use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PlatformInfo {
    /// `macos`, `windows` or `linux`.
    pub os: String,
    pub os_version: Option<String>,
    pub arch: String,
    /// What this build implements on this OS.
    pub support_level: SupportLevel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SupportLevel {
    /// Adapters implemented and exercised on real hardware.
    Implemented,
    /// Adapters implemented and unit-tested against recorded output, but not
    /// yet exercised on real hardware for this OS.
    Unvalidated,
    /// Builds and runs; most adapters return "unsupported".
    Skeleton,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SearchDirOrigin {
    /// Listed in this process's `PATH` environment variable.
    ProcessPath,
    /// Listed in `/etc/paths` or `/etc/paths.d` (what login shells add on macOS).
    SystemPathConfig,
    /// A conventional install location that exists but was not on `PATH`.
    WellKnown,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SearchDir {
    pub path: PathBuf,
    pub origin: SearchDirOrigin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum AppLocation {
    /// Shipped with the operating system.
    System,
    /// Installed for all users.
    Machine,
    /// Installed in the user's home directory.
    User,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
    pub bundle_id: Option<String>,
    pub version: Option<String>,
    pub build: Option<String>,
    pub location: AppLocation,
    /// Metadata file the facts were read from, e.g. `Contents/Info.plist`.
    pub metadata_source: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GpuInfo {
    pub model: String,
    pub vendor: Option<String>,
    pub cores: Option<u32>,
    pub vram: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PackageManagerId {
    Homebrew,
    Npm,
    Pnpm,
    Yarn,
    Uv,
    Pip,
    Cargo,
    Winget,
    Scoop,
    Chocolatey,
    Flatpak,
    Snap,
    Pacman,
}

impl PackageManagerId {
    pub fn as_str(&self) -> &'static str {
        match self {
            PackageManagerId::Homebrew => "homebrew",
            PackageManagerId::Npm => "npm",
            PackageManagerId::Pnpm => "pnpm",
            PackageManagerId::Yarn => "yarn",
            PackageManagerId::Uv => "uv",
            PackageManagerId::Pip => "pip",
            PackageManagerId::Cargo => "cargo",
            PackageManagerId::Winget => "winget",
            PackageManagerId::Scoop => "scoop",
            PackageManagerId::Chocolatey => "chocolatey",
            PackageManagerId::Flatpak => "flatpak",
            PackageManagerId::Snap => "snap",
            PackageManagerId::Pacman => "pacman",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            PackageManagerId::Homebrew => "Homebrew",
            PackageManagerId::Npm => "npm (global)",
            PackageManagerId::Pnpm => "pnpm (global)",
            PackageManagerId::Yarn => "Yarn (global)",
            PackageManagerId::Uv => "uv tools",
            PackageManagerId::Pip => "pip (default python3)",
            PackageManagerId::Cargo => "cargo install",
            PackageManagerId::Winget => "WinGet",
            PackageManagerId::Scoop => "Scoop",
            PackageManagerId::Chocolatey => "Chocolatey",
            PackageManagerId::Flatpak => "Flatpak",
            PackageManagerId::Snap => "Snap",
            PackageManagerId::Pacman => "pacman",
        }
    }

    /// The executable that must exist for this manager.
    pub fn binary(&self) -> &'static str {
        match self {
            PackageManagerId::Homebrew => "brew",
            PackageManagerId::Npm => "npm",
            PackageManagerId::Pnpm => "pnpm",
            PackageManagerId::Yarn => "yarn",
            PackageManagerId::Uv => "uv",
            PackageManagerId::Pip => "python3",
            PackageManagerId::Cargo => "cargo",
            PackageManagerId::Winget => "winget",
            PackageManagerId::Scoop => "scoop",
            PackageManagerId::Chocolatey => "choco",
            PackageManagerId::Flatpak => "flatpak",
            PackageManagerId::Snap => "snap",
            PackageManagerId::Pacman => "pacman",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PackageManagerSupport {
    pub id: PackageManagerId,
    /// `false` means AGASTHY knows about this manager on this OS but cannot
    /// read its inventory in this build.
    pub inventory_implemented: bool,
}
