# 機能開発ガバナンス

この文書は、メンバーが機能を実装・検証しやすくしつつ、ユーザーへローンチする判断を分離するための運用ルールです。

## 原則

- 実装と検証は前に進める。ローンチ判断は別ゲートで行う。
- ユーザーに見せる前提がない機能は、既定 OFF、隠し設定、開発用 entrypoint、または内部 docs に閉じる。
- 「検証完了」は「リリース可能」と同義ではない。PdM 観点で GO になるまで README の訴求、Release notes、既定 ON 化は行わない。
- 仕様・検証・判断ログは Issue / PR / docs に残し、あとから再開できる状態にする。

## 状態

| 状態 | 意味 | 次に必要なこと |
|---|---|---|
| `idea` | 価値仮説だけがある | 対象ユーザー、期待効果、非目標を書く |
| `experiment-ready` | 実装して検証する範囲が決まった | owner、検証環境、完了条件を決める |
| `implemented` | 実装済み | 自動テスト、手動検証、負荷/安全性確認を完了する |
| `validated` | 検証完了 | PdM 判断に必要な証跡を揃える |
| `launch-approved` | ユーザーへ出す判断が GO | docs、既定値、Release notes、配布物を更新する |
| `released` | ユーザーへ公開済み | フィードバックと不具合を追跡する |
| `parked` | 実装/検証済みだが今は出さない | 既定 OFF のまま維持し、再判断条件を書く |

## Issue に必ず書くこと

- 価値仮説: 誰の何が楽になるか。
- 成功条件: 何が起きたら成功と言えるか。
- 非目標: 今回やらないこと。
- 現在の状態: `idea` / `experiment-ready` / `implemented` / `validated` / `launch-approved` / `parked`。
- ローンチ判断: `未判断` / `GO: launch-approved に進める` / `NO-GO: parked にする` / `保留: validated のまま再判断`。
- 検証範囲: OS、画面、権限、設定、性能、失敗時挙動。
- リスク: 重くなる、邪魔になる、権限が強い、通知/個人情報に触れる、配布物に影響する、など。

## Triage 手順

新しい機能候補 Issue は、次の順で扱います。

- 価値仮説、非目標、リスクが空なら `feature:idea` のまま差し戻す。
- 実装・検証してよい範囲が揃ったら、`feature:experiment` を付けて `experiment-ready` にする。
- 性能、通知本文、権限、配布物に触れる場合は、対応する `risk:*` label を付ける。
- 実装 PR は、Issue の現在状態、検証結果、未確認項目を更新してからレビューに出す。
- `validated` になったら、PdM 判断コメントを Issue に残す。

## PR の完了条件

PR は、ローンチ判断前でも次を満たす必要があります。

- 実装が既定 OFF、または既存ユーザーの動線を変えない。
- `npm run verify:local` が通る。
- 関係する追加検証コマンドを PR 本文に記録している。
- 手動検証が必要な場合は、OS/環境/結果/未確認項目を Issue または docs に残している。
- Release notes や README のユーザー向け訴求は、`launch-approved` になるまで追加しない。

## PdM GO / NO-GO 判断

`validated` になった機能は、次の観点で判断します。

| 観点 | GO の目安 |
|---|---|
| ユーザー価値 | 主要ユーザーの作業が明確に楽になる、または楽しさが増える |
| 安全性 | 既定 OFF / 権限説明 / データ保存境界が明確 |
| 性能 | 常駐 CPU/RSS、起動時間、通知/描画負荷に許容できる証跡がある |
| 操作性 | 設定の ON/OFF、戻し方、失敗時の見え方が自然 |
| サポート | README / STATUS / 既知制限 / Issue が現在地と一致 |
| 配布 | Windows / macOS / Linux のうち、対象 OS の package smoke と配布物状態が一致 |

NO-GO または保留の場合は、実装を消す必要はありません。ただし既定 OFF のままにし、再判断条件を Issue に書きます。

### 状態と判断の対応

- `未判断`: `idea` / `experiment-ready` / `implemented` のまま検証を進める。
- `GO: launch-approved に進める`: `validated` から `launch-approved` へ進める。
- `NO-GO: parked にする`: `parked` にし、再判断条件または破棄理由を書く。
- `保留: validated のまま再判断`: `validated` のまま、追加検証や判断期限を書く。

### PdM 判断コメント

Issue には次の形で判断ログを残します。

```md
## PdM 判断

- 判断: GO / NO-GO / 保留
- 理由:
- 検証証跡:
- リリース対象:
- 追加で必要な対応:
- 再判断条件:
```

## ローンチ時に行うこと

- 既定値を変更する場合は、移行・復帰・既存設定への影響を検証する。
- README / STATUS / Release notes を更新する。
- `npm run verify:local` と対象 OS の package smoke を再実行する。
- 配布物を作る場合は `RELEASING.md` に沿って、Release asset と README link の整合を確認する。
- 未検証 OS や権限依存は、PASS と書かずに既知制限へ残す。

## ラベル運用

GitHub labels は次の意味で使います。

- `feature:idea`: 価値仮説段階。
- `feature:experiment`: `experiment-ready` 以降で、実装・検証してよい段階。Issue triage 時に `feature:idea` から付け替える。
- `feature:validated`: 実装と検証が完了し、PdM 判断待ち。
- `feature:launch-approved`: ローンチ GO。
- `feature:parked`: 実装または検証済みだが出さない。
- `risk:performance`: 常駐負荷・起動時間・描画負荷の確認が必要。
- `risk:privacy`: 通知本文、権限、個人情報境界の確認が必要。
- `risk:release`: 配布物、署名、公証、Release asset の確認が必要。
