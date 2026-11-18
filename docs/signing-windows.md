# Windows: installing without the SmartScreen prompt

Downloaded installers that are not code-signed make Windows show *"Windows protected your PC"* (SmartScreen); users must click **More info → Run anyway**. Two free routes remove that.

## 1. winget (no certificate needed)

Installs through `winget install HMAKT99.AGASTHY` do not show the SmartScreen prompt, and winget is built into Windows 10 and 11.

- `scripts/winget-manifests.py <version> <sha256> <dir>` writes the three manifest files for a release.
- `.github/workflows/publish-channels.yml` (job **winget**) submits them to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) with `wingetcreate` whenever a release is published, **but only once the secret `WINGET_TOKEN` exists**. Until then it is skipped with a warning.

To start publishing:

1. Create a classic GitHub token with the `public_repo` scope (https://github.com/settings/tokens). wingetcreate forks winget-pkgs into that account and opens the pull request from it.
2. `gh secret set WINGET_TOKEN -R HMAKT99/Agasthy` and paste the token.
3. Run **Actions → Publish to Homebrew, the MCP Registry and winget → Run workflow** with the latest tag, or wait for the next release.

The first submission is reviewed by winget maintainers (validation pipeline plus a person), usually within a few days; later versions are merged faster. Follow-up comments on that pull request come to the token's account.

## 2. Code signing through SignPath Foundation (free for open source)

[SignPath Foundation](https://signpath.org) signs releases of open-source projects for free with its own certificate, so SmartScreen trusts the installer from the first download. Requirements, in short: an OSI licence (Apache-2.0 ✓), a public repository, builds from CI (✓), and a maintainer who reviews each signing request.

Apply at https://signpath.org/apply with:

- **Project:** AGASTHY, https://github.com/HMAKT99/Agasthy
- **Licence:** Apache-2.0
- **What is signed:** the Windows NSIS installer `AGASTHY_<version>_x64-setup.exe`, the app executable `agasthy-desktop.exe` inside it, and the CLI `agasthy.exe`
- **Build system:** GitHub Actions (`.github/workflows/release.yml`, job *Windows*), triggered by version tags
- **Description:** a local-first desktop app and read-only CLI that inventories a developer machine (repositories, runtimes, packages, AI coding agents) and shows token usage and what is safe to remove. No telemetry; nothing leaves the machine unless the user opts in.

### What changes in the release once approved

The order matters because of the in-app updater: its `.sig` file is a signature over the exact installer bytes, so Windows code signing must happen **before** the updater signature is made, or every installed copy would reject the update.

1. Sign `agasthy-desktop.exe` and `agasthy.exe` after `cargo build`, before NSIS packaging. Tauri's `bundle.windows.signCommand` can call the SignPath step for the app executable.
2. Build the NSIS installer, then sign the installer itself through SignPath (`signpath/github-action-submit-signing-request`, with an upload/download artifact round trip).
3. Re-create the updater signature over the **signed** installer with `pnpm tauri signer sign` (using `TAURI_SIGNING_PRIVATE_KEY`), and only then write `latest.json`.

These steps are added when the SignPath project exists (they need its organisation id, project and policy slugs and an API token as secrets), and tested on a draft release before a real one.
