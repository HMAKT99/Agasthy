# Releasing

Releases are built by `.github/workflows/release.yml` when a tag `vX.Y.Z` is pushed: a macOS job (DMG + update archive), a Windows job (NSIS installer, which is also the update file; preview) and a publish job that writes one `latest.json` for both and creates the draft. The tag must match `version` in `apps/desktop/src-tauri/tauri.conf.json`. The workflow runs the tests, builds the app and DMG with `pnpm release:mac`, writes the updater manifest with `scripts/updater-manifest.mjs`, and creates a **draft** GitHub release. Publishing the draft makes it visible to the in-app updater.

## One-time setup

1. **Updater signing key.** Installed copies only accept updates signed with the private key whose public half is in `tauri.conf.json` (`plugins.updater.pubkey`). The key was generated with `pnpm tauri signer generate` and lives at `~/.tauri/agasthy-updater.key` on the maintainer's machine. **Never commit it.** Add its contents as the repository secret `TAURI_SIGNING_PRIVATE_KEY`. If the key is lost, existing installs can no longer be updated automatically; keep a backup in a password manager.
2. **Apple signing (optional).** Without it, macOS asks users to allow the app once (System Settings → Privacy & Security → Open Anyway). With an Apple Developer account, add these secrets and the workflow signs and notarizes the app, the DMG and the CLI, and fails the release if Gatekeeper does not accept the result. Step by step: [signing-macos.md](signing-macos.md). The secrets: `APPLE_CERTIFICATE` (base64 of a Developer ID Application `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.

## Cutting a release

```sh
# 1. bump the version in apps/desktop/src-tauri/tauri.conf.json, Cargo.toml,
#    skills/agasthy/SKILL.md, plugins/agasthy/.claude-plugin/plugin.json,
#    plugins/agasthy/.codex-plugin/plugin.json, plugins/agasthy/plugin.json, integrations/mcp/mcpb/manifest.json
#    and gemini-extension.json (CI checks they match), and the CHANGELOG
# 2. commit, then tag and push
git tag v0.2.0 && git push origin main v0.2.0
# 3. review the draft release on GitHub, then publish it
```

The draft includes the Claude Desktop extension `agasthy-mcp-X.Y.Z.mcpb`, built by `scripts/build-mcpb.sh` from the three CLI archives. Publishing the draft also runs two workflows:

- `.github/workflows/readme-links.yml` points the README's download buttons at the new release and commits to `main`.
- `.github/workflows/publish-channels.yml` publishes the version to the official MCP Registry (`integrations/mcp/server.json`, signed in with GitHub Actions OIDC, no secret) and points the Homebrew tap at it (`scripts/bump-homebrew-tap.py`). The tap step needs the repository secret `HOMEBREW_TAP_DEPLOY_KEY`: the private half of a write-enabled deploy key on `HMAKT99/homebrew-tap`, so it can push to that repository only. To replace it: `ssh-keygen -t ed25519 -N "" -f key`, `gh repo deploy-key add key.pub -R HMAKT99/homebrew-tap --allow-write`, `gh secret set HOMEBREW_TAP_DEPLOY_KEY -R HMAKT99/Agasthy < key`, then delete both files. Without it the step is skipped with a warning, and the tap can be updated by hand with the same script.

Registry versions cannot be deleted; check the draft before publishing.

## Building locally

```sh
pnpm release:mac                                   # unsigned DMG in dist/
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/agasthy-updater.key)" pnpm release:mac
node scripts/updater-manifest.mjs --repo HMAKT99/Agasthy   # dist/latest.json + update archive
```
