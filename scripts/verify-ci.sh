#!/usr/bin/env bash
# =============================================================================
# 以容器重現 CI 的 e2e 環境並跑一次測試
# -----------------------------------------------------------------------------
# 起 compose.yml 的 postgres-verify（--profile verify）（healthcheck 等就緒）→ 用 CI 的環境變數組合
# 跑 e2e → 無論成敗都收掉容器。
#
# 用途：CI 的 e2e job 改動後先在本機驗證，減少「推上去才發現」的往返。
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() {
  echo "→ 收拾容器"
  # **不可用 `down -v`**：`-v` 移除的是**專案的所有 named volume**，
  # 不只這裡起的那個——包含 postgres-data、redis-data 與五個 node_modules volume。
  # 也就是說每跑一次就清掉開發環境的資料庫與已安裝的依賴，
  # 而症狀是下一次啟動時「找不到 .prisma/client」或「資料庫是空的」，
  # 完全指不到是這一行造成的。（本 change 的驗收階段真的踩到了。）
  #
  # 用 `rm -fsv <服務>` 只針對指定的服務：-f 不問、-s 先停、-v 移除該容器的
  # 匿名 volume。postgres-verify 用 tmpfs，容器一消失資料就跟著消失。
  docker compose --profile verify rm -fsv postgres-verify >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ 啟動 PostgreSQL（等 healthcheck 通過）"
docker compose --profile verify up -d --wait postgres-verify

echo "→ 執行 e2e（連線走環境變數，與 CI 的 job variables 等價）"
DB_HOST=127.0.0.1 \
DB_PORT=15432 \
DB_USERNAME=postgres \
DB_PASSWORD=verify-secret \
DB_DATABASE=nexus_verify_test \
DB_TEST_DATABASE=nexus_verify_test \
  pnpm --filter @app/api test:e2e

echo "✅ 本機 CI 驗證通過"
