#!/bin/bash
#
# PokeFollower macOS 起動修正スクリプト
#
# ダウンロード後に「"PokeFollower" は壊れているため開けません」や、
# 起動しても一瞬で終了する（Gatekeeper に落とされる）場合に使います。
# このファイルを Finder で **ダブルクリック** すると自動で修正します。
#
# やっていること:
#   1. ブラウザが付けた検疫フラグ (com.apple.quarantine) を外す
#   2. ad-hoc 署名を付け直して署名の整合性を回復する
# どちらも「このアプリを自分で信頼して起動する」ための標準的な操作です。

set -euo pipefail

echo "PokeFollower 起動修正を開始します..."

find_app() {
  # 1) /Applications 配下
  if [ -d "/Applications/PokeFollower.app" ]; then
    echo "/Applications/PokeFollower.app"
    return 0
  fi
  # 2) このスクリプトと同じフォルダ（dmg 内 / ダウンロードフォルダを想定）
  local here
  here="$(cd "$(dirname "$0")" && pwd)"
  if [ -d "$here/PokeFollower.app" ]; then
    echo "$here/PokeFollower.app"
    return 0
  fi
  return 1
}

if ! APP="$(find_app)"; then
  echo "エラー: PokeFollower.app が見つかりません。" >&2
  echo "先に PokeFollower.app をアプリケーションフォルダに入れてから、もう一度実行してください。" >&2
  echo ""
  read -r -p "Enter キーで閉じます..." _ || true
  exit 1
fi

echo "対象: $APP"

echo "1/2 検疫フラグを除去..."
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
xattr -cr "$APP" 2>/dev/null || true

echo "2/2 ad-hoc 署名を付け直し..."
codesign --force --deep --sign - "$APP"

echo ""
echo "完了しました。PokeFollower を起動できます。"
echo "（このウィンドウは閉じて構いません）"
echo ""
read -r -p "Enter キーで閉じます..." _ || true
