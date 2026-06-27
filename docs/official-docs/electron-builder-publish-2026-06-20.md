# Electron Builder Publish Evidence

- Retrieval date: 2026-06-20
- Local target: `package.json` v1.0.3, Electron Builder `^26.15.3`, GitHub Actions package-smoke matrix
- Sources:
  - Electron Builder, Publish: https://www.electron.build/docs/publish
  - Electron Builder, GitHub Actions CI/CD: https://www.electron.build/docs/features/github-actions/

## Decision

Package smoke jobs are validation gates, not release jobs. Add `--publish never` to every `electron-builder --dir` smoke command so CI does not attempt GitHub Release publication on branch or pull-request builds.

Keep this rule guarded by `scripts/verify-ci-workflow.cjs`, so future workflow edits do not accidentally re-enable publish behavior in smoke jobs.

## Verification

Run locally after editing:

```sh
npm run verify:ci
```

Observed current failure before the change:

- GitHub Actions run `27819470233`, job `82328959292`, `Package smoke (windows-latest)`.
- Windows packaging completed through `release\win-unpacked`, zip, and NSIS setup creation.
- The job then failed with `GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"`.

## Risk

This change prevents package-smoke jobs from uploading release assets. Actual release workflows must continue to pass `--publish always`, `--publish onTag`, or another explicit publish mode together with the intended token.

## Rollback

Remove `--publish never` from the three package-smoke matrix commands and revert the matching expectations in `scripts/verify-ci-workflow.cjs`.

## Next Refresh

Refresh this evidence when changing Electron Builder major versions, adding release automation, or changing GitHub Actions publish permissions.
