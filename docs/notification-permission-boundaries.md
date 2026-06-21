# 通知コンパニオンの権限境界

最終更新: 2026-06-22

Issue #42 の OS 通知連携を進める前提として、PokéFollower が安全に扱える通知入力と、後続調査が必要な OS 境界を整理します。

## 現在の安全な入力

- アプリ内イベント: 設定画面のテスト通知、作業見守りタイマーなど、PokéFollower 自身が生成するイベント。
- Codex notify bridge: Codex から明示的に渡された JSON payload。`input-messages` は保存せず、`last-assistant-message` を短く要約して最大64件だけ queue に保持します。
- ユーザーが設定で通知コンパニオンを ON にした場合だけ watcher を動かします。OFF のときは従来挙動に戻します。

## OS 別の取得可否

| OS | 現時点の扱い | 根拠 | 実装方針 |
|---|---|---|---|
| macOS | OS 全体の通知本文取得は未採用 | Apple の UserNotifications はアプリが通知を出す/許可を得る API。公式 docs は `UNUserNotificationCenter` で通知許可を要求する流れを示しており、他アプリ通知を一般に読み取る API としては扱わない | まずはアプリ内/Codex 明示 payload のみ。macOS 側は通知を「読む」より、PokéFollower 自身の通知表示/抑制に限定 |
| Windows | OS 通知 listener は追加調査対象 | Microsoft Learn の Notification listener は他アプリ通知へアクセスできるが、User Notification Listener capability とユーザー許可が必要 | Electron/NSIS 配布で capability/packaged identity を満たせるか検証するまで実装しない。明示許可 UI と OFF 復帰を必須にする |
| Linux | 汎用的な通知履歴取得はデスクトップ環境依存 | freedesktop.org Desktop Notifications Specification はアプリが通知サーバーへ passive popup を送る仕様であり、全通知履歴を安全に読む共通 API ではない。XDG portal の Notification も送信/撤回向けで、表示されたかの取得もできない | AppImage では OS 全体の通知取得を前提にしない。アプリ内/Codex 明示 payload を優先し、DE 個別連携は後続 Issue 化 |

## 後続実装の条件

- 既定 OFF。ON にしたときだけ通知入力 watcher または OS listener を起動する。
- OS 通知本文はログ、Issue、共有ファイル、クラッシュレポートへ保存しない。
- 必要な権限は設定画面で説明してから要求する。
- 全画面、自動非表示、通知コンパニオン OFF、または DND 相当の状態ではポップアップを抑制する。
- OS listener が使えない環境では、アプリ内イベントと Codex notify bridge へフォールバックする。
- Windows listener を採用する場合も、PokéFollower は通知を read-only に扱う。`RemoveNotification` / `ClearNotifications` など、OS 側の通知状態を変更する API は使わない。

## 公式 docs

- Apple Developer Documentation, `UNUserNotificationCenter.requestAuthorization(options:completionHandler:)`, retrieved 2026-06-22: https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/requestauthorization%28options%3Acompletionhandler%3A%29
- Microsoft Learn, `Notification listener - Windows apps`, retrieved 2026-06-22: https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener
- freedesktop.org, `Desktop Notifications Specification 1.3`, retrieved 2026-06-22: https://specifications.freedesktop.org/notification/1.3
- XDG Desktop Portal, `org.freedesktop.portal.Notification`, retrieved 2026-06-22: https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Notification.html
