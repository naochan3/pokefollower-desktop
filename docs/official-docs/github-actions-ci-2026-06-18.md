# GitHub Actions CI Evidence

- Retrieval date: 2026-06-18
- Local target: `package.json` v1.0.2, Node `>=22.12.0`, Electron `^42.4.1`
- Sources:
  - GitHub Docs, Workflow syntax for GitHub Actions: https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions
  - GitHub Docs, Building and testing Node.js: https://docs.github.com/actions/guides/building-and-testing-nodejs
  - GitHub Docs, Control workflow concurrency: https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs
  - `actions/setup-node` official action README: https://github.com/actions/setup-node

## Decision

Add `.github/workflows/ci.yml` with:

- `pull_request`, `push` to `main`, and `workflow_dispatch` triggers.
- `permissions.contents: read` because the workflow only checks out, installs dependencies, tests, builds, and packages.
- `concurrency` by workflow and ref to cancel stale runs on the same branch.
- Node `22.12.0` to match the package engine floor.
- Dependency metadata checks that keep `package.json`, `package-lock.json`, locked tool versions, and CI Node version aligned.
- Asset consistency checks that validate the current sprite index, pack JSON metadata, UI PNGs, Japanese names, raw animation sheet references, and direction rows.
- CI workflow consistency checks that guard the required validation jobs and package smoke matrix from accidental removal.
- Electron security consistency checks that keep the custom app protocol constrained to assets and both renderer windows sandboxed with context isolation.
- IPC routing consistency checks that keep per-overlay frame routing and hide-transition suppression in `main.js`.
- Repository hygiene checks that keep generated package outputs ignored while requiring `package-lock.json` and the committed WASM artifact to stay tracked.
- Roadmap checks that keep README/STATUS issue links, current-version text, and known limitations aligned with the tracked open work.
- WASM artifact checks that validate the committed artifact header, tracking status, and Rust build/copy wiring before deeper rebuild checks.
- Platform-support consistency checks that keep Linux AppImage build support, macOS arm64 dmg/zip build support, Windows-only fullscreen detection, and README/STATUS limitation text aligned.
- Signing-status consistency checks that keep electron-builder signing config and README/STATUS unsigned warnings aligned while #16 remains open.
- Installer UX consistency checks that keep the Windows NSIS build intentionally one-click and aligned with README install wording.
- Overlay DOM/cache consistency checks that keep the renderer from rebuilding DOM every frame and keep meta/frame IPC narrow.
- Runtime guard consistency checks that keep single-instance locking, packaged-only startup registration, display-rebuild hooks, and 70px offset defaults aligned.
- Settings UI consistency checks that keep DOM IDs, numeric control ranges, preload IPC surface, key mapping, and search behavior aligned.
- Unit tests on Windows, macOS, and Linux.
- A static docs consistency job that checks README / STATUS release-version text against `package.json`.
- The docs consistency job also checks that RELEASING documents Windows `latest/download` links separately from macOS versioned release links.
- A dedicated Windows `rust-wasm-artifact` job that installs the WASM target, runs `cargo fmt --check`, rebuilds the Rust WASM artifact, and fails if `native/pokefollower_core.wasm` is stale.
- A package smoke matrix that runs `electron-builder --dir` for Windows, macOS arm64, and Linux without publishing artifacts.
- A package smoke verifier that inspects the packaged `app.asar` and fails unless:
  - exactly one target-platform `app.asar` is present in the expected unpacked output directory.
  - packaged `package.json` name, version, and main entry match the repository root `package.json`.
  - `native/pokefollower_core.wasm` is present.
  - required main-process, overlay, settings, pack metadata, representative sprite asset files, and tray/app icons are present.
  - the packaged `@koromix/koffi-<platform>-<arch>` native dependency matches the runner target platform.
  - the platform-native `koffi.node` binary exists in `app.asar.unpacked`.
- The package smoke job depends on static checks, unit tests, and WASM artifact consistency, so packaging only runs after cheap regressions fail fast.

## Verification

Run locally after editing:

```powershell
npm ci
npm test
npm run test:rust
npm run build:rust
npm run dist:win -- --dir
```

Observed local verification on Windows:

- `npm ci`: passed, audit reported 0 vulnerabilities.
- `npm run verify:assets`: passed for the current 493-entry Gen 1-4 asset set.
- `npm run verify:ci`: passed, confirming the workflow still contains the expected static checks, unit tests, WASM stale check, package smoke matrix, extracted fullscreen/frame-routing/pack-reader regression test files, dependency metadata, Electron security plus hygiene/IPC/overlay/roadmap/runtime/settings/WASM guard verifiers, and that `verify:local` bundles all static gates plus `npm test`.
- `npm run verify:docs`: passed after updating README / STATUS to v1.0.2 and adding guards for stale Windows installer examples plus RELEASING link-rule drift.
- `npm run verify:local`: passed locally as the bundled non-runtime validation entrypoint (`verify:assets`, `verify:ci`, `verify:deps`, `verify:docs`, `verify:electron`, `verify:hygiene`, `verify:installer`, `verify:ipc`, `verify:overlay`, `verify:platform`, `verify:roadmap`, `verify:runtime`, `verify:settings`, `verify:signing`, `verify:wasm`, `npm test`).
- `npm run verify:platform`: passed, confirming docs and code still describe fullscreen detection as Windows-only and Linux as AppImage-build-only / runtime-unverified.
- `npm run verify:signing`: passed, confirming signing/notarization config is absent and README/STATUS still warn that Windows/macOS builds are unsigned.
- `npm run bench:interval`: passed locally as a reproducible #15 measurement helper; intentionally not added to CI because timer results are runner-load-sensitive.
- `npm run verify:release`: passed locally against GitHub latest Release `v1.0.2`, expected assets, and README download links; intentionally not added to CI because it depends on external release state and should not block normal PRs.
- `npm test`: passed, 45 Vitest tests, including Gen 1-9 asset-path boundary tests, extracted fullscreen policy, app-protocol path boundary tests, frame-routing regression tests, settings compatibility/sanitization tests, pack-reader asset metadata tests, WASM-missing JS fallback tests, and Rust-vs-JS follower golden trajectory test.
- `npm run test:rust`: passed, 2 Rust tests.
- `cargo fmt --manifest-path crates/follower_core/Cargo.toml --check`: passed.
- `npm run build:rust` followed by `git diff --exit-code -- native/pokefollower_core.wasm`: passed.
- `CARGO_TARGET_DIR=<temp> npm run build:rust` followed by `git diff --exit-code -- native/pokefollower_core.wasm`: passed after updating `scripts/copy-rust-core.cjs` to honor redirected Cargo target directories.
- `npm run dist:win -- --dir`: passed.
- `npm run dist:linux -- --dir`: package creation passed as a cross-package smoke check on Windows, but target-platform verification correctly failed because the package contained `@koromix/koffi-win32-x64` instead of `@koromix/koffi-linux-x64`. This confirms Linux package validation must run on a Linux runner.
- `npm run dist:mac -- --arm64 --dir`: not supported from Windows; must be verified on GitHub's `macos-latest` runner.
- `npx asar list` confirmed `native/pokefollower_core.wasm` exists inside the Windows and Linux `app.asar` smoke packages.
- `node scripts/verify-package-smoke.cjs win32 x64`: passed after Windows `dist:win -- --dir`, including `app.asar.unpacked` `koffi.node` verification.
- `node scripts/verify-package-smoke.cjs win32`: later failed when only stale `release/linux-unpacked` remained, proving the verifier no longer accepts the wrong platform directory.
- `node scripts/verify-package-smoke.cjs linux x64`: failed after Windows cross-built Linux `--dir`, proving the verifier catches wrong native dependency packaging.

Workflow-level verification still requires a GitHub Actions run after the branch is pushed.

## Risk

- macOS packaging smoke must run on macOS; Electron Builder rejects macOS packaging from Windows. The workflow passes `--arm64` and verifies `@koromix/koffi-darwin-arm64` because the published macOS assets are Apple Silicon arm64.
- Linux native dependency packaging must run on Linux for authoritative validation. Windows cross-packaging can create a Linux Electron bundle with Windows-only `koffi` native files.
- `rustup` is used directly instead of a third-party Rust setup action to avoid adding another action dependency.
- `git diff --exit-code -- native/pokefollower_core.wasm` intentionally fails when Rust source changes without committing the regenerated WASM.
- The docs consistency check is intentionally static; it prevents package-version drift in repo docs, but does not prove that a GitHub Release asset exists. Release asset presence remains a separate release checklist / `gh release view` check.

## Rollback

Remove `.github/workflows/ci.yml` and this evidence file.

## Next Refresh

Refresh this evidence when changing Node/Electron major versions, workflow permissions, release publishing, or GitHub Actions major action versions.
