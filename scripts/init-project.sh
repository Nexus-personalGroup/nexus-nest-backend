#!/usr/bin/env bash
#
# 從本 hexagonal monorepo 基座初始化一個新的衍生專案。
#
# 用法：
#   ./scripts/init-project.sh --name <project-name> [--yes]
#
#   --name <project-name>   新專案名稱（kebab-case，如 my-app）
#   --yes / -y              不互動確認，直接重置 git 歷史
#
# 動作：
#   1. 改寫「根」package.json 的 name / version(→0.1.0) / description
#      （不動 apps/* 與 packages/* 的 @app/* 套件名，scope 為通用）
#   2. 重置 tasks/todo.md 為空骨架（新專案無 backlog）
#      —— 保留 tasks/lessons.md（多為可重用的基建知識：Prisma / NestJS / hexagonal 慣例）
#   3. 重置 git 歷史（rm -rf .git && git init && 初始 commit）— 破壞性，需確認或 --yes
#   4. pnpm install
#
# 不動：.env（你的 DB / Redis / secret 設定）、openspec/、任何既有模組。
#
set -euo pipefail

usage() {
  sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

NAME=""
ASSUME_YES=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --yes | -y)
      ASSUME_YES=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "未知參數：$1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "錯誤：缺 --name <project-name>" >&2
  usage
  exit 1
fi
if [[ ! "$NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "錯誤：名稱須 kebab-case（小寫字母開頭），得到：$NAME" >&2
  exit 1
fi

# repo 根：本 script 位於 <root>/scripts/
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- 1. 根 package.json（用 node 改寫，避免 sed 對 JSON 脆弱）---
PROJECT_NAME="$NAME" node <<'NODE'
const fs = require('fs');
const name = process.env.PROJECT_NAME;
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.name = name;
pkg.version = '0.1.0';
pkg.description = `${name} monorepo`;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
NODE
echo "✓ package.json name → $NAME"

# --- 2. 重置 todo（保留 lessons）---
cat > tasks/todo.md <<'EOF'
# TODO

_跨 session 追蹤的待辦與跨模組事項。待處理依優先序在上，完成的歸到下方並按日期分組。_

---

## 待處理

## 完成項目
EOF
echo "✓ tasks/todo.md 已重置（tasks/lessons.md 保留）"

# --- 3. git 歷史（破壞性，需確認）---
DO_GIT=0
if [[ "$ASSUME_YES" -eq 1 ]]; then
  DO_GIT=1
elif [[ -t 0 ]]; then
  read -r -p "重置 git 歷史？rm -rf .git 不可回復 [y/N] " ans || ans=""
  [[ "$ans" == "y" || "$ans" == "Y" ]] && DO_GIT=1
fi

if [[ "$DO_GIT" -eq 1 ]]; then
  rm -rf .git
  git init -q
  git add -A
  git commit -q -m "chore: 從 hexagonal 基座初始化 $NAME"
  echo "✓ git 歷史已重置 + 初始 commit"
else
  echo "− 跳過 git 重置（非互動且未加 --yes，或你選了 N）"
fi

# --- 4. 安裝 ---
pnpm install
echo "✓ pnpm install 完成"

cat <<EOF

✅ 已初始化「$NAME」。後續：
  1. 設定 .env（DB / Redis / JWT secret 等；可參考 apps/api/.env.example）
  2. pnpm --filter @app/api db:migrate
  3. pnpm dev
EOF
