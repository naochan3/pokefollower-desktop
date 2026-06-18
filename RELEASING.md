# リリース手順

新しいバージョンを配布するときの手順をまとめます。
配布物（インストーラ）は **各 OS 上でしかビルドできない** ため、担当を分けて同じ GitHub Release に集約します。

---

## 担当（誰が何をビルドするか）

| プラットフォーム | 成果物 | ビルドできる人 |
|---|---|---|
| Windows (x64) | `PokeFollower-Setup.exe`（NSIS インストーラ） | Windows 環境を持つ人（`naochan3` 等） |
| macOS (Apple Silicon) | `PokeFollower-<ver>-arm64.dmg` / `-arm64-mac.zip` | **Mac を持つ人（[@Nicolas0315](https://github.com/Nicolas0315)）** |
| Linux | `PokeFollower-<ver>.AppImage` | Linux 環境を持つ人（任意） |

> Windows / macOS の両方が揃わないと「全OS最新」になりません。バージョンを上げたら、Windows 側と macOS 側の担当がそれぞれ同じ Release にアセットを追加してください。

---

## バージョニング

- [セマンティックバージョニング](https://semver.org/lang/ja/)（`MAJOR.MINOR.PATCH`）。
- バグ修正のみ → PATCH、機能追加 → MINOR、互換性のない変更 → MAJOR。
- `package.json` の `version` が唯一の真実。タグ名は `v<version>`（例: `v1.0.1`）。

---

## 手順

### 1. バージョンを上げる

```bash
# package.json の "version" を編集（例: 1.0.1 → 1.0.2）
git add package.json
git commit -m "release: v1.0.2"
git tag v1.0.2
git push origin main
git push origin v1.0.2
```

### 2. 各 OS で配布物をビルド

```bash
# Windows（Windows 上で）
npm run dist        # → release/PokeFollower Setup <ver>.exe

# macOS（Mac 上で）
npm run dist:mac    # → release/PokeFollower-<ver>-arm64.dmg, -arm64-mac.zip

# Linux（Linux 上で・任意）
npm run dist:linux  # → release/PokeFollower-<ver>.AppImage
```

> 追従計算の Rust→WASM（`native/pokefollower_core.wasm`）は **リポジトリに同梱済み**。`npm run dist` は同梱 WASM をそのまま使うため、**Rust ツールチェーンは不要**です（詳細は下記）。

### 3. GitHub Release を作成し、アセットを上げる

```bash
# Windows 担当が新規 Release を作成（exe は安定名にリネームして添付）
cp "release/PokeFollower Setup 1.0.2.exe" PokeFollower-Setup.exe
gh release create v1.0.2 PokeFollower-Setup.exe --title "PokéFollower v1.0.2" --notes "変更点..."
```

その後、macOS 担当が **同じ Release** に Mac アセットを追加：

```bash
gh release upload v1.0.2 \
  "release/PokeFollower-1.0.2-arm64.dmg" \
  "release/PokeFollower-1.0.2-arm64-mac.zip"
```

GitHub の Web からでも、Releases → 対象タグ → Edit → ドラッグ&ドロップで添付できます。

### 4. アセット名のルール（重要）

README のダウンロードリンクは `releases/latest/download/<アセット名>` で **常に最新を指す** 形にしています。リンクを壊さないため、アセット名は固定してください。

| README のリンク先 | 添付するアセット名 |
|---|---|
| Windows | `PokeFollower-Setup.exe`（バージョン番号を入れない） |
| macOS dmg | `PokeFollower-<ver>-arm64.dmg` |
| macOS zip | `PokeFollower-<ver>-arm64-mac.zip` |

> macOS のアセット名にはバージョンが入ります。バージョンを上げたら **README の macOS リンクのファイル名も更新** してください（Windows は固定名なので不要）。

---

## Rust コア（WASM）について

- 追従位置計算は Rust crate `crates/follower_core/` で実装し、`wasm32-unknown-unknown` 向けにビルドした `native/pokefollower_core.wasm` を **リポジトリにコミット** しています。
- `npm test` / `npm run dist` は同梱 WASM を使うだけなので、**cargo は不要**。
- **Rust ソースを変更したときだけ**、再ビルドして WASM を更新・コミットします（cargo + `wasm32-unknown-unknown` ターゲットが必要）：

```bash
rustup target add wasm32-unknown-unknown   # 初回のみ
npm run build:rust                          # crates/.../*.wasm → native/ にコピー
git add native/pokefollower_core.wasm
git commit -m "build: rebuild rust wasm core"
```

---

## 署名・公証（未対応）

- 現状、Windows / macOS とも **未署名** です。
  - Windows: 初回起動時に SmartScreen 警告（「詳細情報」→「実行」で回避）。
  - macOS: Gatekeeper でブロック（右クリック→「開く」、または設定で許可）。
- 正式配布で警告を消すには、Windows のコード署名証明書 / Apple Developer ID 署名＋公証が必要です（[STATUS](docs/STATUS.md) の今後対応を参照）。
