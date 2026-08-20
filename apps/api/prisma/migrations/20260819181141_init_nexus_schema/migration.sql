-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "member_id" TEXT,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "method" TEXT,
    "url" TEXT,
    "request" TEXT,
    "response" TEXT,
    "status_code" INTEGER,
    "exec_time" DOUBLE PRECISION,
    "request_time" TIMESTAMPTZ(3) NOT NULL,
    "response_time" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "role_code" VARCHAR(50),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" VARCHAR(36),
    "updated_by" VARCHAR(36),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "permission_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "sub_module" TEXT,
    "action" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "member" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role_id" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(3),
    "last_password_change" TIMESTAMPTZ(3),
    "created_by" VARCHAR(36),
    "updated_by" VARCHAR(36),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_logs" (
    "id" TEXT NOT NULL,
    "member_id" TEXT,
    "email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_whitelist" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_blacklist" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "reason" TEXT,
    "is_auto_block" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_type" VARCHAR(50) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "related_table" VARCHAR(50) NOT NULL,
    "related_id" VARCHAR(36) NOT NULL,
    "uploaded_by" VARCHAR(36),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seed_history" (
    "id" SERIAL NOT NULL,
    "seed_name" VARCHAR(255) NOT NULL,
    "executed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seed_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_system_logs_created" ON "system_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_system_logs_member_created" ON "system_logs"("member_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_permission_code_key" ON "permissions"("permission_code");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "idx_auth_logs_created" ON "auth_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_auth_logs_email_created" ON "auth_logs"("email", "created_at");

-- CreateIndex
CREATE INDEX "idx_auth_logs_member_created" ON "auth_logs"("member_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ip_whitelist_ip_address_key" ON "ip_whitelist"("ip_address");

-- CreateIndex
CREATE UNIQUE INDEX "ip_blacklist_ip_address_key" ON "ip_blacklist"("ip_address");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_password_reset_member" ON "password_reset_tokens"("member_id");

-- CreateIndex
CREATE INDEX "idx_password_reset_expires" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_related" ON "attachments"("related_table", "related_id");

-- CreateIndex
CREATE INDEX "idx_uploaded_by" ON "attachments"("uploaded_by");

-- CreateIndex
CREATE UNIQUE INDEX "seed_history_seed_name_key" ON "seed_history"("seed_name");

-- CreateIndex
CREATE INDEX "idx_seed_name" ON "seed_history"("seed_name");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 欄位描述
-- ----------------------------------------------------------------------------
-- 來源是 schema.prisma 的 `///` 註解。Prisma 只會把它們放進 Client 的 JSDoc，
-- 不會產生 COMMENT ON，因此這段是手動維護的——改了 `///` 就要一起更新這裡。
-- 產生方式見 openspec/changes/refactor-switch-to-postgres/design.md。
-- ============================================================================

COMMENT ON TABLE "system_logs" IS 'HTTP 請求稽核紀錄。由全域 interceptor 寫入，涵蓋所有進到 API 的請求';
COMMENT ON COLUMN "system_logs"."member_id" IS '發動請求的帳號。未登入請求（登入、忘記密碼等）為 null，故不建外鍵也不可當必填關聯鍵';
COMMENT ON COLUMN "system_logs"."action" IS '業務動作代碼，供「某帳號做過哪些操作」的彙總查詢；由路由推導而非使用者輸入';
COMMENT ON COLUMN "system_logs"."ip_address" IS '來源 IP。已依 TRUST_PROXY 設定解析出真實客戶端位址，不是 proxy 的位址';
COMMENT ON COLUMN "system_logs"."method" IS 'HTTP 方法';
COMMENT ON COLUMN "system_logs"."url" IS '完整請求路徑（含 query string）';
COMMENT ON COLUMN "system_logs"."request" IS '請求內容的 JSON 字串。敏感鍵已由 sanitize 以子字串比對遮蔽（password / newPassword 等變形一併涵蓋）';
COMMENT ON COLUMN "system_logs"."response" IS '回應內容的 JSON 字串，同樣經過遮蔽';
COMMENT ON COLUMN "system_logs"."status_code" IS '回應的 HTTP 狀態碼';
COMMENT ON COLUMN "system_logs"."exec_time" IS '處理耗時（毫秒），用於抓出慢請求';
COMMENT ON COLUMN "system_logs"."request_time" IS '請求進入時間。與 responseTime 分開存而非只存耗時，是為了能重建完整時間軸';
COMMENT ON COLUMN "system_logs"."response_time" IS '回應送出時間';
COMMENT ON COLUMN "system_logs"."created_at" IS '寫入時間。日誌保留排程以此欄位為界分批刪除，故必須有索引';

COMMENT ON TABLE "roles" IS '角色。權限的授予單位，成員透過角色取得權限而非直接掛權限';
COMMENT ON COLUMN "roles"."name" IS '角色顯示名稱，唯一。僅供顯示，程式判斷一律用 roleCode';
COMMENT ON COLUMN "roles"."status" IS '啟用狀態。停用後不能再指派給新成員，但既有持有者不受影響';
COMMENT ON COLUMN "roles"."role_code" IS '程式判斷用的穩定代碼（如 SUPERADMIN）。與顯示名稱解耦，改名不影響授權邏輯';
COMMENT ON COLUMN "roles"."is_default" IS '系統預設角色，不可刪除。新建成員未指定角色時落到這一個';
COMMENT ON COLUMN "roles"."created_by" IS '建立者的成員 ID。稽核用途，刻意不建外鍵——刪除帳號時不應被稽核紀錄卡住';
COMMENT ON COLUMN "roles"."updated_by" IS '最後修改者的成員 ID，同樣不建外鍵';
COMMENT ON COLUMN "roles"."deleted_at" IS '軟刪除標記。所有查詢必須帶 deletedAt: null，漏帶會撈出已刪除的角色';

COMMENT ON TABLE "permissions" IS '權限項目。由 seed 定義，不開放後台新增——新增權限意味著程式碼要有對應的檢查點';
COMMENT ON COLUMN "permissions"."permission_code" IS '權限碼，格式 `PLATFORM:MODULE:ACTION`（如 `BACKEND:MEMBER:EDIT`）。程式以此字串比對，是唯一的判斷依據';
COMMENT ON COLUMN "permissions"."name" IS '權限的顯示名稱，僅供後台權限樹呈現';
COMMENT ON COLUMN "permissions"."platform" IS '權限適用面："FRONTEND" | "BACKEND"';
COMMENT ON COLUMN "permissions"."module" IS '所屬模組，供後台權限樹的第一層分組';
COMMENT ON COLUMN "permissions"."sub_module" IS '子模組，供權限樹的第二層分組；無子分組時為 null';
COMMENT ON COLUMN "permissions"."action" IS '動作類型："VIEW"（讀） | "EDIT"（寫） | "ACCESS"（進入）';
COMMENT ON COLUMN "permissions"."status" IS '啟用狀態。停用的權限不會出現在後台權限樹，也不會通過授權檢查';

COMMENT ON TABLE "role_permissions" IS '角色與權限的多對多關聯。整組覆寫而非增量更新——授權變更要能一次看出最終狀態';
COMMENT ON COLUMN "role_permissions"."created_at" IS '授予時間，供「這個角色何時拿到這個權限」的稽核';

COMMENT ON TABLE "members" IS '後台成員的持久化模型

只存在於 adapter/out/persistence 層，與 domain 的 Member 完全分離——
兩者透過 MemberMapper 轉換，資料庫欄位變動不會直接穿透到領域模型';
COMMENT ON COLUMN "members"."member" IS '成員顯示名稱';
COMMENT ON COLUMN "members"."password" IS 'bcrypt 雜湊後的密碼。輪數由 BCRYPT_ROUNDS 控制，生產環境強制 >= 12';
COMMENT ON COLUMN "members"."email" IS '登入帳號，唯一';
COMMENT ON COLUMN "members"."role_id" IS '所屬角色。一個成員只能有一個角色，權限完全由角色決定';
COMMENT ON COLUMN "members"."status" IS '啟用狀態。false 時登入直接拒絕，且既有 token 在下次請求即失效';
COMMENT ON COLUMN "members"."is_default" IS '系統預設帳號，不可刪除';
COMMENT ON COLUMN "members"."failed_login_count" IS '連續登入失敗次數。達門檻觸發鎖定；登入成功或管理員解鎖時歸零';
COMMENT ON COLUMN "members"."token_version" IS 'JWT 失效世代

JwtAuthGuard 每次請求比對 token 內的版本與此欄位現值，不符即拒絕。
改密碼、強制登出、refresh token 重用連坐撤銷時 +1——
這是「立即讓該帳號所有裝置的既發 token 失效」的唯一機制';
COMMENT ON COLUMN "members"."locked_at" IS '帳號鎖定的起算時間。null 表示未鎖定

用時間戳而非布林旗標，才能算出「還剩多久自動解鎖」；解鎖是清成 null';
COMMENT ON COLUMN "members"."last_password_change" IS '最後一次變更密碼的時間，供密碼到期策略計算下次強制更換日';
COMMENT ON COLUMN "members"."created_by" IS '建立者的成員 ID，稽核用，不建外鍵';
COMMENT ON COLUMN "members"."updated_by" IS '最後修改者的成員 ID，不建外鍵';
COMMENT ON COLUMN "members"."last_login_at" IS '最後一次登入成功的時間。判斷閒置帳號用';
COMMENT ON COLUMN "members"."deleted_at" IS '軟刪除標記。所有查詢必須帶 deletedAt: null';

COMMENT ON TABLE "auth_logs" IS '認證事件稽核。與 system_logs 分開，因為登入失敗的查詢頻率與保留需求都不同';
COMMENT ON COLUMN "auth_logs"."member_id" IS '對應的成員 ID。帳號不存在的登入嘗試為 null';
COMMENT ON COLUMN "auth_logs"."email" IS '被嘗試的登入帳號

刻意與 memberId 並存：登入失敗時可能查無此帳號、memberId 為 null，
但稽核仍必須知道「有人在試哪個 email」——這正是偵測撞庫的依據';
COMMENT ON COLUMN "auth_logs"."action" IS '事件類型：LOGIN_SUCCESS | LOGIN_FAILURE | LOGOUT | PASSWORD_RESET | REFRESH';
COMMENT ON COLUMN "auth_logs"."ip_address" IS '來源 IP，已依 TRUST_PROXY 解析';
COMMENT ON COLUMN "auth_logs"."user_agent" IS '瀏覽器 UA 字串，供辨識異常裝置';
COMMENT ON COLUMN "auth_logs"."detail" IS '補充說明，如失敗原因。MUST NOT 寫入密碼或 token';
COMMENT ON COLUMN "auth_logs"."created_at" IS '事件時間。保留排程以此為界分批刪除';

COMMENT ON TABLE "ip_whitelist" IS 'IP 白名單。設定後僅允許名單內的 IP 存取後台';
COMMENT ON COLUMN "ip_whitelist"."ip_address" IS '允許的 IP 位址，唯一';
COMMENT ON COLUMN "ip_whitelist"."description" IS '用途說明，供管理員辨識這條規則為何存在';
COMMENT ON COLUMN "ip_whitelist"."created_by" IS '新增者的成員 ID';

COMMENT ON TABLE "ip_blacklist" IS 'IP 黑名單。名單內的 IP 一律拒絕，且 Redis 不可用時採 fail-closed';
COMMENT ON COLUMN "ip_blacklist"."ip_address" IS '封鎖的 IP 位址，唯一';
COMMENT ON COLUMN "ip_blacklist"."reason" IS '封鎖原因';
COMMENT ON COLUMN "ip_blacklist"."is_auto_block" IS '是否為系統自動封鎖（相對於管理員手動加入）

兩者的處置不同：自動封鎖可由排程或條件解除，手動封鎖只能由管理員移除';
COMMENT ON COLUMN "ip_blacklist"."created_by" IS '新增者的成員 ID。自動封鎖時為 null';

COMMENT ON TABLE "password_reset_tokens" IS '密碼重設 token';
COMMENT ON COLUMN "password_reset_tokens"."member_id" IS '申請重設的成員 ID';
COMMENT ON COLUMN "password_reset_tokens"."token" IS 'token 的 **sha256 雜湊**，不是明文

寄給使用者的是明文，資料庫只留雜湊——資料庫外洩不等於可以重設任何人的密碼。
token 本身是高熵隨機值，單向雜湊即足夠，不需要 bcrypt 的加鹽與慢雜湊';
COMMENT ON COLUMN "password_reset_tokens"."expires_at" IS '失效時間。過期的 token 由排程依此欄位清理';
COMMENT ON COLUMN "password_reset_tokens"."used_at" IS '使用時間。非 null 即代表已作廢

使用後保留紀錄而非刪除，才查得到「這個 token 何時被誰用掉」';

COMMENT ON TABLE "attachments" IS '上傳檔案的中繼資料。實體檔案存在 local 或 S3，由 STORAGE_DRIVER 決定';
COMMENT ON COLUMN "attachments"."file_name" IS '原始檔案名稱。存入前已做 latin1→UTF-8 轉換，否則中文檔名會變亂碼';
COMMENT ON COLUMN "attachments"."file_url" IS '檔案的公開存取 URL，前綴由 AWS_MEDIA_LIBRARY_ROOT 決定';
COMMENT ON COLUMN "attachments"."file_type" IS 'MIME 類型。上傳時已用 magic byte（sniffMime）比對實際內容，與宣告不符會被拒絕';
COMMENT ON COLUMN "attachments"."file_size" IS '檔案大小（bytes）';
COMMENT ON COLUMN "attachments"."related_table" IS '關聯的資料表名稱。多型關聯的一半，刻意不建外鍵';
COMMENT ON COLUMN "attachments"."related_id" IS '關聯的資料列 ID。與 relatedTable 合為複合索引，供「某筆資料的所有附件」查詢';
COMMENT ON COLUMN "attachments"."uploaded_by" IS '上傳者的成員 ID

刪除時的擁有者檢查依據：非上傳者只有 SUPERADMIN 能刪。
少了這個欄位，任何持有 ATTACHMENT:EDIT 的帳號都能刪掉別人的附件（IDOR）';

COMMENT ON TABLE "seed_history" IS 'seed 執行紀錄。seed-runner 據此跳過已跑過的檔案，使 db:seed 可重複執行';
COMMENT ON COLUMN "seed_history"."id" IS '自增主鍵。這張表不對外，不需要 UUID';
COMMENT ON COLUMN "seed_history"."seed_name" IS '已執行的 seed 檔名，唯一。檔名帶 timestamp 前綴以確保執行順序';
COMMENT ON COLUMN "seed_history"."executed_at" IS '執行完成時間';

