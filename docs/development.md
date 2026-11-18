# Development

## Prerequisites

- Rust stable 1.90+ (`rust-toolchain.toml` selects stable)
- Node.js 20+ and pnpm 10
- macOS: Xcode Command Line Tools
- Linux: WebKitGTK and friends; see the `apt-get` line in `.github/workflows/ci.yml`
- Windows: WebView2 runtime and MSVC build tools

## Common tasks

| Task | Command |
|---|---|
| Install JS dependencies | `pnpm install` |
| Run the app | `pnpm dev` |
| Rust tests | `cargo test --workspace` |
| Lint Rust | `cargo clippy --workspace --all-targets -- -D warnings` |
| Format | `cargo fmt --all` · `pnpm format` |
| Frontend checks | `pnpm typecheck && pnpm lint && pnpm test` |
| UI end-to-end tests | `pnpm e2e` (once before: `pnpm e2e:setup` downloads Playwright's Chromium) |
| Regenerate TS types | `pnpm gen:types` (after changing a `#[ts(export)]` Rust type) |
| Check TS types are current | `pnpm check:types` |
| Release bundle (unsigned) | `pnpm build` |

## Tests

- **Rust unit tests** live next to the code. Command-output parsers are tested against recorded samples. Platform code is tested against the real OS where the test is read-only and harmless.
- **`crates/discovery/tests/repo_scan.rs`** creates real Git repositories in a temporary directory (clean, dirty, unborn, detached, duplicate clones, a credential in a remote URL, a symlink escaping the root, a nested repository in `node_modules`) and checks discovery and persistence end to end.
- **Frontend unit tests** use Vitest and Testing Library.
- **Playwright** (`apps/desktop/e2e`) runs the real UI in a browser against a clearly marked fixture IPC layer. Tauri's WebDriver does not support macOS WKWebView, so the packaged app's backend is covered by the Rust tests and by the CLI.

## Fixtures and mocks

Mocks exist only in tests: `MockCommandRunner` (Rust) and `e2e/fixtures/ipc.ts` (Playwright). Fixture values are labelled `fixture-…` and use `example.invalid`. The shipped UI never falls back to sample data.

## Adding a discovered thing

1. Add or extend a typed attributes struct in `crates/discovery/src/attrs.rs` with `#[ts(export)]`.
2. Produce `EntityInput`s with evidence in a discovery module; declare `PruneScope`s only for sources that were read successfully.
3. Run `pnpm gen:types`.
4. Render it in `apps/desktop/src/pages/discovery.tsx` (columns, filters) and `entity-detail.tsx`.
5. Add parser tests with a recorded sample.
