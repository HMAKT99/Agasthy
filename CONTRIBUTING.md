# Contributing to AGASTHY

Thanks for your interest. AGASTHY is early-stage, and contributions of code, tests, platform adapters, documentation and bug reports are all welcome.

## Ground rules

These come from the product's purpose and apply to every change:

1. **No fabricated data.** Never show sample, mock or estimated machine data in the app. If something cannot be measured, return `Availability::Unavailable` (or `PermissionDenied` / `Unsupported`) with a reason.
2. **Evidence for claims.** A new relationship or provenance claim needs an evidence record and an honest confidence level.
3. **Read-only by default.** Discovery code must not modify the machine. Anything that mutates must be a new `ActionRequest` variant in `crates/actions` with a dry-run plan, re-validation at execution, verification and an audit entry, and must not be added without discussion in an issue first.
4. **No shells.** External programs run only through `CommandRunner`, with fixed argument arrays, and must be added to the allowlist deliberately.
5. **No secrets.** Never read secret values into storage or logs; detect presence only.
6. **Platform code stays in `crates/platform-adapters`.**
7. **No buttons that do nothing.** Unbuilt features do not appear in the UI.

## Workflow

1. Open an issue for anything non-trivial so the approach can be agreed first.
2. Create a branch, make the change, and add tests.
3. Run the checks:
   ```sh
   cargo fmt --all --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   pnpm typecheck && pnpm lint && pnpm test && pnpm e2e   # first time: pnpm e2e:setup
   pnpm check:types
   ```
4. Update `ROADMAP.md` and `CHANGELOG.md` when user-visible behaviour changes.
5. Open a pull request using the template.

See [docs/development.md](docs/development.md) for setup and [docs/architecture.md](docs/architecture.md) for the design.

## Commit messages

Use the imperative mood, with a short summary line (≤ 72 characters), a blank line, then the why.

## Licensing

By contributing you agree that your contributions are licensed under the Apache License 2.0.
