# 通知コンパニオンの取得境界

最終更新: 2026-06-22

PokéFollower の通知コンパニオンは、既定 OFF です。現在サポートする入力は、アプリ内イベントと Codex `notify` payload です。OS 全体の通知本文を常時監視する実装は入れていません。

## 現在実装済み

- Codex `notify` から渡された JSON payload を短く正規化して表示します。
- `input-messages` は保存しません。
- `last-assistant-message` 由来の要約通知だけを、ユーザーのローカル queue に最大64件保存します。
- 通知コンパニオン OFF、全画面中、アプリ無効中、または邪魔しない busy reaction 中は表示しません。
- Work Watch などのアプリ内イベントも同じ overlay 表示経路を使います。

## OS 別の扱い

| OS | 現時点の扱い | 根拠 | 実装方針 |
|---|---|---|---|
| macOS | OS 全体の通知本文取得は未採用 | Apple の UserNotifications はアプリが通知を出す/許可を得る API。公式 docs は `UNUserNotificationCenter` で通知許可を要求する流れを示しており、他アプリ通知を一般に読み取る API としては扱わない | まずはアプリ内/Codex 明示 payload のみ。macOS 側は通知を「読む」より、PokéFollower 自身の通知表示/抑制に限定 |
| Windows | OS 通知 listener は追加調査対象 | Microsoft Learn の Notification listener は他アプリ通知へアクセスできるが、User Notification Listener capability とユーザー許可が必要 | Electron/NSIS 配布で capability/packaged identity を満たせるか検証するまで実装しない。明示許可 UI と OFF 復帰を必須にする |
| Linux | 汎用的な通知履歴取得はデスクトップ環境依存 | freedesktop.org Desktop Notifications Specification はアプリが通知サーバーへ passive popup を送る仕様であり、全通知履歴を安全に読む共通 API ではない。XDG portal の Notification も送信/撤回向けで、表示されたかの取得もできない | AppImage では OS 全体の通知取得を前提にしない。アプリ内/Codex 明示 payload を優先し、DE 個別連携は後続 Issue 化 |

## 方針

- OS 通知本文を扱う場合は、明示的な設定 ON と取得範囲の説明を必須にします。
- 通知本文をリポジトリ、Issue、ログ、共有ファイルへ保存しません。
- OS 側で安全に取得できない通知は、アプリ内イベント通知へフォールバックします。
- Windows listener を採用する場合も、PokéFollower は通知を read-only に扱います。`RemoveNotification` / `ClearNotifications` など、OS 側の通知状態を変更する API は使いません。

## 公式 docs

- Apple Developer Documentation, `UNUserNotificationCenter.requestAuthorization(options:completionHandler:)`, retrieved 2026-06-22: https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/requestauthorization%28options%3Acompletionhandler%3A%29
- Microsoft Learn, `Notification listener - Windows apps`, retrieved 2026-06-22: https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener
- freedesktop.org, `Desktop Notifications Specification 1.3`, retrieved 2026-06-22: https://specifications.freedesktop.org/notification/1.3
- XDG Desktop Portal, `org.freedesktop.portal.Notification`, retrieved 2026-06-22: https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Notification.html
