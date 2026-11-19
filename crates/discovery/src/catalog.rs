//! The curated catalogue of developer tools AGASTHY looks for on `PATH`.
//!
//! Discovery does not list every executable on `PATH` (there are thousands);
//! it looks for these names. A tool is reported only if an executable with
//! that name exists; its version comes from running the listed arguments.

use crate::attrs::ToolCategory;

#[derive(Debug, Clone, Copy)]
pub struct ToolSpec {
    pub id: &'static str,
    pub display_name: &'static str,
    pub category: ToolCategory,
    /// Arguments that print a version without side effects. `None` = do not run.
    pub version_args: Option<&'static [&'static str]>,
}

const fn t(
    id: &'static str,
    display_name: &'static str,
    category: ToolCategory,
    version_args: Option<&'static [&'static str]>,
) -> ToolSpec {
    ToolSpec {
        id,
        display_name,
        category,
        version_args,
    }
}

use ToolCategory::*;

const V: Option<&[&str]> = Some(&["--version"]);

pub const TOOLS: &[ToolSpec] = &[
    // Runtimes
    t("node", "Node.js", Runtime, V),
    t("deno", "Deno", Runtime, V),
    t("bun", "Bun", Runtime, V),
    t("python3", "Python 3", Runtime, V),
    t("python", "Python", Runtime, V),
    t("ruby", "Ruby", Runtime, V),
    t("go", "Go", Runtime, Some(&["version"])),
    t("rustc", "Rust compiler", Runtime, V),
    t("java", "Java", Runtime, Some(&["-version"])),
    t("php", "PHP", Runtime, V),
    t("perl", "Perl", Runtime, V),
    t("swift", "Swift", Runtime, V),
    t("dotnet", ".NET", Runtime, V),
    t("elixir", "Elixir", Runtime, V),
    t("lua", "Lua", Runtime, Some(&["-v"])),
    // Package managers
    t("brew", "Homebrew", PackageManager, V),
    t("npm", "npm", PackageManager, V),
    t("pnpm", "pnpm", PackageManager, V),
    t("yarn", "Yarn", PackageManager, V),
    t("pip3", "pip", PackageManager, V),
    t("uv", "uv", PackageManager, V),
    t("pipx", "pipx", PackageManager, V),
    t("poetry", "Poetry", PackageManager, V),
    t("conda", "Conda", PackageManager, V),
    t("cargo", "Cargo", PackageManager, V),
    t("rustup", "rustup", PackageManager, V),
    t("gem", "RubyGems", PackageManager, V),
    t("composer", "Composer", PackageManager, V),
    t("mise", "mise", PackageManager, V),
    t("asdf", "asdf", PackageManager, Some(&["version"])),
    t("winget", "WinGet", PackageManager, V),
    t("scoop", "Scoop", PackageManager, None),
    t("choco", "Chocolatey", PackageManager, V),
    t("pacman", "pacman", PackageManager, V),
    t("yay", "yay", PackageManager, V),
    t("paru", "paru", PackageManager, V),
    // Version control
    t("git", "Git", VersionControl, V),
    t("gh", "GitHub CLI", VersionControl, V),
    t("git-lfs", "Git LFS", VersionControl, V),
    // Build
    t("make", "Make", Build, V),
    t("cmake", "CMake", Build, V),
    t("ninja", "Ninja", Build, V),
    t("clang", "Clang", Build, V),
    t("gcc", "GCC", Build, V),
    t("bazel", "Bazel", Build, None),
    t("gradle", "Gradle", Build, None),
    t("mvn", "Maven", Build, None),
    // Containers & infrastructure
    t("docker", "Docker CLI", Container, V),
    t("podman", "Podman", Container, V),
    t("colima", "Colima", Container, V),
    t(
        "kubectl",
        "kubectl",
        Container,
        Some(&["version", "--client"]),
    ),
    t("helm", "Helm", Container, Some(&["version", "--short"])),
    t("terraform", "Terraform", Cloud, Some(&["-version"])),
    t("aws", "AWS CLI", Cloud, V),
    t("gcloud", "Google Cloud CLI", Cloud, None),
    t("az", "Azure CLI", Cloud, None),
    // Databases
    t("sqlite3", "SQLite", Database, V),
    t("psql", "PostgreSQL client", Database, V),
    t("postgres", "PostgreSQL server", Database, V),
    t("mysql", "MySQL client", Database, V),
    t("redis-server", "Redis server", Database, V),
    t("mongod", "MongoDB server", Database, V),
    // Editors (CLI launchers)
    t("code", "VS Code CLI", Editor, None),
    t("cursor", "Cursor CLI", Editor, None),
    t("zed", "Zed CLI", Editor, None),
    t("nvim", "Neovim", Editor, V),
    t("vim", "Vim", Editor, Some(&["--version"])),
    // AI tools (presence of the executable only; configuration is Phase 3)
    t("ollama", "Ollama", AiTool, V),
    t("claude", "Claude Code", AiTool, V),
    t("codex", "OpenAI Codex CLI", AiTool, V),
    t("gemini", "Gemini CLI", AiTool, V),
    t("aider", "Aider", AiTool, V),
    // Utilities
    t("jq", "jq", Utility, V),
    t("curl", "curl", Utility, V),
    t("ffmpeg", "FFmpeg", Utility, Some(&["-version"])),
    t("rg", "ripgrep", Utility, V),
    t("fzf", "fzf", Utility, V),
    t("tmux", "tmux", Utility, Some(&["-V"])),
];

/// Environment for version probes: suppress update checks, telemetry and
/// download prompts so a probe has no side effects beyond printing.
pub const PROBE_ENV: &[(&str, &str)] = &[
    ("NO_UPDATE_NOTIFIER", "1"),
    ("HOMEBREW_NO_AUTO_UPDATE", "1"),
    ("HOMEBREW_NO_ANALYTICS", "1"),
    ("HOMEBREW_NO_ENV_HINTS", "1"),
    ("DOTNET_CLI_TELEMETRY_OPTOUT", "1"),
    ("DOTNET_NOLOGO", "1"),
    ("DOTNET_SKIP_FIRST_TIME_EXPERIENCE", "1"),
    ("CHECKPOINT_DISABLE", "1"),
    ("COREPACK_ENABLE_DOWNLOAD_PROMPT", "0"),
    ("COREPACK_ENABLE_NETWORK", "0"),
    ("PIP_DISABLE_PIP_VERSION_CHECK", "1"),
    ("PYTHONDONTWRITEBYTECODE", "1"),
    ("DISABLE_AUTOUPDATER", "1"),
];

/// Every tool id, for building the command allowlist.
pub fn tool_ids() -> Vec<&'static str> {
    TOOLS.iter().map(|t| t.id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_safe() {
        let mut ids = tool_ids();
        ids.sort();
        let before = ids.len();
        ids.dedup();
        assert_eq!(before, ids.len(), "duplicate tool ids");
        for id in tool_ids() {
            assert!(
                id.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
                "{id}"
            );
            assert!(!["sh", "bash", "zsh", "env", "sudo"].contains(&id));
        }
    }
}
