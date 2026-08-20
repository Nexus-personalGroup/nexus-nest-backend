# =============================================================================
# 開發用映像（api 與 web 共用同一份）
# -----------------------------------------------------------------------------
# 只有 dev target：原始碼由 compose 以 bind mount 掛進來，映像本身只負責提供
# 「Linux 平台的 node_modules 與工具鏈」。
#
# **刻意不含 production target**：沒有被任何指令使用、也沒被驗證過的建置階段，
# 就是本專案反覆踩到的「設定寫了但沒有執行路徑」。要做正式映像時再補，
# 並同時補上會使用它的 compose 或 CI job。
#
# 那個 target **必須跑非 root**（dev 用 root 是為了 bind mount 的檔案所有權好處理，
# 正式環境沒有這個理由）：
#   RUN useradd --create-home --shell /bin/bash app
#   USER app
#
# 用 node:22 而非 20：packageManager 釘的 pnpm 11 需要 Node >= 22.13，
# Node 20 會因缺少 node:sqlite 內建模組而在 pnpm install 當場失敗。
# 用 slim（glibc）而非 alpine：bcrypt 是原生模組，glibc 有官方預編譯檔，
# musl（alpine）得在映像內裝 python3/make/g++ 現場編譯，建置慢且容易壞。
# =============================================================================
FROM node:22-slim AS dev

# openssl 供 Prisma；ca-certificates 供對外 TLS 連線
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# husky 的 prepare script 在沒有 .git 的容器內無事可做，關掉避免噪音
ENV HUSKY=0
ENV CI=true

RUN corepack enable

WORKDIR /app

# 依賴層與原始碼層分開：只要 lockfile 與各 package.json 沒變，
# 改 code 重建時這一層就能命中快取，不必重跑 pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN pnpm install --frozen-lockfile

# 其餘原始碼。dev 模式會被 bind mount 蓋掉，這層只是讓映像有一份完整的樹可用；
# **不足以單獨跑測試**——.dockerignore 排除了 openspec / .agents / *.md，
# 而 openspec-schema、openspec-spec-format、project-docs、hook-scripts 四支守則
# 直接讀那些路徑。要讓映像能單獨跑測試，得先放寬 .dockerignore。
COPY . .

# 實際指令由 compose 的 command 指定（api 與 web 用同一個映像、不同指令）
CMD ["pnpm", "--filter", "@app/api", "dev"]
