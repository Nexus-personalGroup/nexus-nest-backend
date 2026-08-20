#!/usr/bin/env bash
# =============================================================================
# Prisma schema 異動提醒（PostToolUse: Edit|Write）
# -----------------------------------------------------------------------------
# 改了 schema.prisma 後有三件事容易漏：跑 migrate、重生 client 型別、同步
# 對應的 domain model / mapper / port / seed。本檔只提醒，不阻擋。
#
# 注意：一律提醒「請使用者手動跑 migrate」——AI 不得自行對資料庫下 DDL。
# exit 0 = 一律。
# =============================================================================
set -uo pipefail

file="$(jq -r '.tool_input.file_path // ""')"

case "$file" in
  *schema.prisma)
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"schema.prisma 已修改。(1) 提醒使用者手動跑 pnpm --filter @app/api db:migrate，不要自己對資料庫下 DDL；(2) 跑 pnpm --filter @app/api db:generate 更新 Prisma Client 型別；(3) 同步檢查對應的 domain model / mapper / port 介面與 seed。"}}'
    ;;
esac

exit 0
