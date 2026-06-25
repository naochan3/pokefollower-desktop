# PR #11 Manual Validation

PR #11 includes lower simulation interval, cross-monitor frame filtering, overlay DOM caching, Rust WASM follower core, and packaging changes. These checks require a desktop session and cannot be fully covered by unit tests.

## Baseline

- Date:
- OS / GPU:
- Branch or build:
- Display layout:
- DPI scale per display:
- Test duration:

## GUI End-to-End

- Launch the baseline `win-unpacked` build.
- Launch the PR `win-unpacked` build.
- Move the cursor across normal paths and monitor boundaries for at least 5 minutes each.
- Record Task Manager CPU %, memory, and visible smoothness notes.

Expected:

- No obvious stutter regression.
- No monitor-boundary warp or flicker.
- Memory remains stable after 5 minutes.

## Multi-Monitor Boundary

- Sprite half-overlaps a display boundary.
- Displays use different resolution or DPI scaling.
- A display is connected and disconnected while the app is running.

Expected:

- No stuck hidden sprite.
- No duplicate sprite except during the intended single-frame overlap while crossing displays.
- Overlay windows are rebuilt after `display-added`, `display-removed`, and `display-metrics-changed`.

## Fullscreen Auto-Hide

- Start a true fullscreen game or fullscreen test app.
- Confirm the follower hides within the fullscreen polling interval.
- Exit fullscreen and confirm the follower returns.
- Confirm ordinary maximized desktop apps do not hide the follower.

Expected:

- True fullscreen hides the follower.
- Maximized windows and shell windows do not hide it.

## Settings Compatibility

- Fresh install with no `settings.json`: default distance is 70.
- Upgrade with existing `settings.json`: saved `offset` remains unchanged.

Expected:

- Fresh and upgrade behavior are intentionally different.
- Existing user settings are not overwritten.

## Installer UX

- Install with `PokeFollower Setup 1.0.0.exe`.

Expected:

- One-click install is intentional for this branch.
- If install-location selection is required again, set `build.nsis.oneClick` back to `false` before release.

## Linux GUI

- Run the AppImage on X11.
- Run the AppImage on Wayland.

Expected:

- Transparent overlay and click-through behavior are verified separately per desktop environment.

## macOS Distribution

- Build x64 and arm64 artifacts.
- Sign and notarize before public distribution.

Expected:

- Both Intel and Apple Silicon builds are available.
- Unsigned artifacts are not presented as production-ready macOS releases.
