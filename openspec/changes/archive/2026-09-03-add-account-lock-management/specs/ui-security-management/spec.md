## ADDED Requirements

### Requirement: 帳號鎖定頁路由與導航

`apps/web/` SHALL 提供 `/security/account-locks` 帳號鎖定頁，並在 Sidebar 的
「安全管理」群組加入入口。

- 路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- 授權沿用 security 模組的 SUPERADMIN role gate，**MUST NOT 以權限碼判斷**
  ——那與後端不一致（見 `api-security-management` 的 Purpose）。
- Sidebar 項目 MUST 與 IP 白名單 / 黑名單同組，圖示使用 `lucide-react` 的 `LockKeyhole`。

#### Scenario: 從 Sidebar 進入

- **WHEN** 超級管理者點「帳號鎖定」
- **THEN** 導向 `/security/account-locks` 並載入列表

#### Scenario: 非超級管理者

- **WHEN** 非 SUPERADMIN 的使用者直接輸入該網址
- **THEN** 與其他 security 頁面一致地被擋下

### Requirement: 帳號鎖定 DataTable

`/security/account-locks` SHALL 以 DataTable 顯示有鎖定紀錄的帳號，**5 欄**：
Email / 名稱 / 鎖定時間 / 自動解鎖時間 / 操作。

- **狀態 MUST 看得出來**：以 Badge 區分「鎖定中」與「已到期」，
  MUST NOT 只顯示時間讓使用者自己心算。
- 「自動解鎖時間」MUST 同時顯示相對時間（例如「還有 12 分鐘」）——
  管理員要判斷的是「還要等多久」，絕對時間要自己算。
- 狀態過濾 MUST 提供「鎖定中 / 已到期 / 全部」，**預設鎖定中**。
- 分頁與過濾狀態 MUST 同步到 URL query。
- 空狀態的文案 MUST 表達「目前沒有帳號被鎖定」，MUST NOT 只顯示「無資料」
  ——前者是一個好消息，後者看起來像載入失敗。
- **`lockEnabled` 為 `false` 時 MUST 顯示明顯的停用提示**，並說明如何啟用。
  帳號鎖定預設關閉，而關閉時系統不會產生任何鎖定紀錄——此時
  「目前沒有帳號被鎖定」是**錯的**：不是沒有人被鎖，是根本不會鎖。
  兩者在畫面上長得一模一樣，而它們的意義相反。

**解鎖 MUST 呼叫既有的 `POST /api/admin/security/unlock-account`**，
MUST NOT 新增解鎖端點——列表已經拿得到 email，兩支做同一件事的端點會各自演化。

- 解鎖 MUST 先經確認對話框，並說明後果（該帳號可立即再次嘗試登入，失敗計數歸零）。
- **已到期的列 MUST NOT 提供可按的解鎖**：後端對非鎖定中的帳號回 `409`，
  提供一個按下去必定失敗的按鈕比沒有按鈕更糟。
- 已到期的列 MUST 以 **disabled + 說明**（例如「已自動解鎖」）呈現，MUST NOT 隱藏。
  這與 `platform-frontend-conventions` 一致：**因資料狀態而不可操作時 disabled 並說明**，
  隱藏只用於權限不足。使用者需要知道「這個人已經可以登入了」，
  而不是以為功能不見了。

#### Scenario: 預設載入

- **WHEN** 使用者進入 `/security/account-locks`
- **THEN** 顯示狀態為「鎖定中」的帳號，依鎖定時間由新到舊

#### Scenario: ⭐ 解鎖一個鎖定中的帳號

- **WHEN** 管理員對鎖定中的列按下解鎖並確認
- **THEN** 呼叫 `POST /api/admin/security/unlock-account` 帶該列的 email，
  成功後列表重新載入且該列消失（狀態已不再是鎖定中）

#### Scenario: ⭐ 已到期的列

- **WHEN** 某列的狀態為「已到期」
- **THEN** 解鎖為 disabled 並顯示原因，MUST NOT 可按下

#### Scenario: ⭐ 帳號鎖定功能停用

- **WHEN** 回應的 `lockEnabled` 為 `false`
- **THEN** 頁面 MUST 顯示停用提示並說明啟用方式，
  MUST NOT 只顯示空清單——那會讓人以為防護正常運作

#### Scenario: 沒有帳號被鎖定

- **WHEN** 查詢結果為空
- **THEN** 顯示「目前沒有帳號被鎖定」，MUST NOT 顯示錯誤或空白畫面
