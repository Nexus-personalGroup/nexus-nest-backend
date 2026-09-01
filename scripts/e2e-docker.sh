#!/usr/bin/env bash
# =============================================================================
# 在容器內跑一次完整的 e2e
# -----------------------------------------------------------------------------
# 起 tmpfs 的 postgres-verify（等 healthcheck）→ 在容器內跑 jest → 無論成敗都收乾淨。
#
# 與 `pnpm --filter @app/api test:e2e`（host 跑）**並存而非取代**：
#   host  ── 最快，改一行就重跑，開發時用這條
#   容器  ── 密封，不依賴 host 的 Node / 套件 / .env，推上去之前用這條
#
# 建測試庫與 `prisma migrate deploy` 由 jest 的 globalSetup 負責，本腳本不重複做
# ——它讀的是 process.env 的 DB_*，而那些由 compose 的 environment 提供。
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 放 trap 而不是寫在最後一行：**失敗才是最需要重跑的時候**，
# 而殘留的容器與資料會讓下一次執行的結果不可信
cleanup() {
  echo "→ 收拾容器與資料"
  # **不可用 `down -v`**：`-v` 移除的是**專案的所有 named volume**，
  # 不只這裡起的那個——包含 postgres-data、redis-data 與五個 node_modules volume。
  # 也就是說每跑一次就清掉開發環境的資料庫與已安裝的依賴，
  # 而症狀是下一次啟動時「找不到 .prisma/client」或「資料庫是空的」，
  # 完全指不到是這一行造成的。（本 change 的驗收階段真的踩到了。）
  #
  # 用 `rm -fsv <服務>` 只針對指定的服務：-f 不問、-s 先停、-v 移除該容器的
  # 匿名 volume。postgres-verify 用 tmpfs，容器一消失資料就跟著消失。
  docker compose --profile e2e --profile verify rm -fsv e2e postgres-verify \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ 啟動 PostgreSQL（tmpfs，等 healthcheck 通過）"
docker compose --profile verify up -d --wait postgres-verify

echo "→ 在容器內執行 e2e"
# run --rm 讓退出碼直接是測試的退出碼；用 up 的話還要另外撈容器的退出碼，多一層容易寫錯
docker compose --profile e2e run --rm e2e

echo "容器內 e2e 通過"
