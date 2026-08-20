#!/usr/bin/env bash
# =============================================================================
# 單檔 eslint 檢查（PostToolUse: Edit|Write）
# -----------------------------------------------------------------------------
# 對「剛改動的那一個 .ts / .tsx」跑該 workspace 的 eslint，只在檢出問題時回饋。
#
# 為什麼不跑全專案 typecheck：repo root 沒有 tsconfig.json 也沒裝 typescript，
# `npx tsc --noEmit` 只會吐 npx 的安裝廣告（這是本檔取代的舊寫法）。
# 型別檢查交給 Pre-Change Checklist 的 `pnpm typecheck`。
#
# 共用設計：邏輯放工具無關的 .agents/，各 AI 的設定只負責註冊呼叫本檔。
# exit 0 = 一律（不阻擋）；有問題時輸出 hookSpecificOutput 供 AI 參考。
# =============================================================================
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
file="$(jq -r '.tool_input.file_path // ""')"

case "$file" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

case "$file" in
  */apps/api/*) workspace='@app/api' ;;
  */apps/web/*) workspace='@app/web' ;;
  *) exit 0 ;;
esac

if ! (cd "$ROOT" && pnpm --filter "$workspace" exec eslint --no-warn-ignored "$file") >/dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"eslint 檢出 %s 有問題（型別 / 家規 / 格式）。細節跑：pnpm --filter %s exec eslint <該檔絕對路徑>；這塊做完記得跑 pnpm typecheck && pnpm lint。"}}' \
    "$file" "$workspace"
fi

exit 0
