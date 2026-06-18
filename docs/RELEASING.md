# Release and Signing

## Unsigned Local Builds

These commands produce local distribution artifacts without requiring signing credentials:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Unsigned macOS and Windows artifacts can trigger Gatekeeper or SmartScreen warnings.

## macOS Signed and Notarized Build

The signed macOS path uses `electron-builder.signed.cjs`, which enables `forceCodeSigning` and `mac.notarize`.

Required credentials:

- Developer ID Application certificate available through `CSC_LINK` / `CSC_KEY_PASSWORD` or a matching local keychain identity
- Apple notarization credentials via either:
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  - or App Store Connect API key credentials supported by electron-builder

Build:

```bash
npm run dist:mac:signed
```

Verify:

```bash
spctl --assess --verbose --type exec release/mac-arm64/PokeFollower.app
xcrun stapler validate release/mac-arm64/PokeFollower.app
codesign --verify --deep --strict --verbose=2 release/mac-arm64/PokeFollower.app
```

## Windows Signed Build

For Windows signing, inject certificate material through CI or local environment variables. When cross-building from macOS, prefer Windows-specific variables:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Build:

```bash
npm run dist:win:signed
```

The signed config sets `forceCodeSigning`, so the build fails rather than silently shipping unsigned artifacts when credentials are missing.

## References

- Electron code signing docs: https://electronjs.org/docs/latest/tutorial/code-signing
- electron-builder code signing docs: https://www.electron.build/docs/features/code-signing/
- electron-builder macOS notarization docs: https://www.electron.build/docs/features/code-signing/notarization/
