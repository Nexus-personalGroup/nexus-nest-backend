## Why

前台使用者與後台管理員目前是**同一張表、同一支登入端點、同一種 token**。

`apps/api/src/modules/front/` 沒有 auth module，`JwtPayload` 是
`{ sub, type, tokenVersion }`——沒有任何側別欄位。也就是說今天能通過
`/api/front/*` 認證的 token，全都是 `/api/admin/auth/login` 簽出來的；
反過來也成立：**未來前台使用者的 token 一樣能通過 `/api/admin/*` 的 `JwtAuthGuard`**。

前後台的邊界完全靠 `@Permissions` 撐著，而 `@Public()` 的存在意味著
「沒有權限碼的端點」在設計上就允許存在——那道邊界只要有一個端點忘記表態就破了。

**前台真的開出去之前是補這件事成本最低的時候**，而我們正好在那個時間點上。

分表本身還有一個更根本的理由：聊天領域裡的每一個「member」**指的從頭到尾都是
前台使用者**，不是管理員。而 `members` 帶著 `roleId` / `lockedAt` / `isDefault` /
`failedLoginCount` / `lastPasswordChange` 這些 RBAC 與後台專屬的欄位，
前台使用者一個都不需要；反過來前台需要的（顯示名稱、頭像、信箱驗證狀態）後台也沒有。

## What Changes

- **Schema**：新增 `users` 表（前台使用者），與 `members` 完全獨立。
- **後端**：新增 `/api/front/auth/login`、`/refresh`、`/logout`、`/api/front/me`。
- **後端**：`JwtPayload` 加 `side: 'admin' | 'front'`；**前台與後台使用各自的 secret**
  （見 design.md D2）。
- **後端**：`ResolveMemberContextService` 拒絕非 admin 側的 token。
- **Seed**：幾個測試用的前台帳號。

**這個 change 刻意是「純新增」的**：

- 既有的 `/api/front/chat/*` 與 WS 連線**仍然吃 admin token**，不在本 change 切換。
  切換是 `migrate-chat-to-front-users`（路線圖第 4 項）的事，那一步一旦開始就不能留半套狀態。
- 因此 3a 做完之後，前台 token 能用的只有 `/api/front/auth/*` 與 `/api/front/me`。
  **觀察 A 的另一半（前台端點拒絕 admin token）要等 change 4。**

**不做**：

- **註冊、信箱驗證、密碼重設**——那是 `add-front-user-registration`（3b）。
  3b 有自己一整套「防濫用」問題要想（重複註冊是否洩漏帳號存在、驗證信節流、
  token 的時效與一次性），塞進來會讓這個 change 大到無法 review。
- **後台的前台使用者管理 CRUD**。3a 用 seed 建帳號就夠驗證登入、側別與 change 4 的遷移。
- **前台使用者的帳號鎖定**。`members` 那套（`failedLoginCount` + `lockedAt`）剛在
  `fix-unauthenticated-surface` 被證明是 DoS 面，而前台的暴力破解防護
  已經有全域 throttle 與 IP 封鎖。不複製一個剛修過的東西。

## Capabilities

### New Capabilities

- `api-front-auth`：前台認證端點契約（登入 / 更新 / 登出 / 個人資料）。
- `platform-token-scope`：token 的作用域規則——哪一側簽的、哪一側驗得過、
  以及新增受保護端點時的表態方式。

### Modified Capabilities

- `api-auth`：後台登入簽發的 token 帶側別；後台端點拒絕前台 token。

## Impact

- **Migration**：新增 `users` 表。**不動 `members`**，既有資料不受影響。
- **環境變數**：新增 `FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET`
  （production 必填，見 design.md D2）。
- **後端**：新增 `src/modules/front/auth.module.ts`、前台的
  controller / facade / service / port / adapter 一整套（`gen:module --front` 產生骨架）；
  `JwtPayload`、`ResolveMemberContextService`、admin 的 `LoginService` / `RefreshTokenService`。
- **既有 token 的相容性**：部署前簽出的 token 沒有 `side`，一律視為 `admin`
  （見 design.md D3）。
- **前端不受影響**：後台 SPA 的登入流程與 token 儲存都沒有變。
