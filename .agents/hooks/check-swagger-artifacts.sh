#!/usr/bin/env bash
# =============================================================================
# Swagger 產物同步守門（Stop hook）
# -----------------------------------------------------------------------------
# 連動契約：改了 docs/swagger 的來源 yaml，就必須重跑
#   pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate
# 否則 bundle 與 api-client 的型別會與來源脫節（前端拿到過期契約）。
#
# 判斷刻意保守——exit 2 會阻止對話結束，誤判的代價比漏判高：
#   只有「來源 yaml 有變更」AND「兩個產物都沒有變更」才擋。
#   來源與產物一起改、只有產物改、兩者都沒改，一律放行。
#
# 這裡只比對「檔案有沒有一起變動」（毫秒級）；內容層級的漂移由
# `pnpm --filter @app/api swagger:check` 與架構測試 swagger-sync.spec.ts 負責。
#
# 共用設計：邏輯放工具無關的 .agents/，各 AI 的設定只負責註冊呼叫本檔。
# exit 0 = 通過；exit 2 = 擋下並把 stderr 回饋給 AI。
# =============================================================================
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
cd "$ROOT" || exit 0

# 來源 yaml：排除 bundle 產物本身
source_changed="$(git status --porcelain -- 'apps/api/docs/swagger/**/*.yaml' 2>/dev/null \
  | grep -v 'openapi.bundle.yaml' || true)"
[ -n "$source_changed" ] || exit 0

bundle_changed="$(git status --porcelain -- 'apps/api/docs/swagger/*/openapi.bundle.yaml' 2>/dev/null || true)"
client_changed="$(git status --porcelain -- packages/api-client/src/schema.ts 2>/dev/null || true)"

if [ -z "$bundle_changed" ] && [ -z "$client_changed" ]; then
  echo "❌ 你改了 swagger 來源 yaml，但 bundle 與 api-client 產物都沒有更新。" >&2
  echo "" >&2
  echo "   變更的來源檔：" >&2
  echo "$source_changed" | sed 's/^/     /' >&2
  echo "" >&2
  echo "   請執行：" >&2
  echo "     pnpm --filter @app/api swagger:bundle" >&2
  echo "     pnpm --filter @app/api-client generate" >&2
  echo "" >&2
  echo "   確認同步：pnpm --filter @app/api swagger:check" >&2
  exit 2
fi

exit 0
