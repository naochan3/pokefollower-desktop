# macOS front window helper

The macOS fullscreen detector uses `native/macos-frontwindow.swift`, a small
Swift Accessibility API helper. During development it can run through the Swift
interpreter automatically.

For faster startup, pre-compile the helper before packaging or local testing:

```sh
swiftc native/macos-frontwindow.swift -o native/macos-frontwindow
```

The JavaScript detector prefers the compiled `native/macos-frontwindow` binary
when it exists and falls back to `swift native/macos-frontwindow.swift`.
