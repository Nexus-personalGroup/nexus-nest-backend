/**
 * 權限碼片段（platform / module）的中文對照。
 *
 * 權限樹的群組標題是從 `BACKEND:ACCOUNT:VIEW` 拆出來的碼片段，直接顯示會是英文。
 * 對照表放前端而不是讓 API 多回欄位，是為了不動回應契約——那個標籤只有這一個畫面在用，
 * 為它改 swagger + api-client 不划算。代價是同一份分類法存在前後兩處，
 * 由 `permission-catalog-sync.spec.ts` 的
 * `it('每個 platform 與 module 都要有中文對照')`（api 側守則）雙向比對
 * `PERMISSION_CATALOG` 擋住漂移。
 *
 * ⚠️ **兩份常數的字面值會被守則以正規式讀取**，改寫成動態組裝（map / 迴圈 / 展開）
 * 會讓守則讀不到而失敗。要改結構的話守則也要一起改。
 *
 * 用語一律與側邊欄（`_nav-items.ts`）的分組一致——指派權限的人與使用後台的人
 * 是同一批，兩處不同的用語等於要他們自己做一次翻譯。
 */
export const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  BACKEND: '後台',
};

export const MODULE_LABELS: Readonly<Record<string, string>> = {
  ACCOUNT: '管理者帳號',
  ROLE: '角色權限',
  FRONT_USER: '會員管理',
  // 營運總覽 / 檢舉審閱 / 聊天室三個頁面共用這一個碼，所以用側邊欄的分組名而非單一頁名
  MODERATION: '聊天管理',
  // 目前沒有任何後台頁面在用 BACKEND:ATTACHMENT:EDIT（端點在 AttachmentController，
  // apps/web 沒有附件頁），所以勾了看不出差別。**不從權限樹移除**：它確實在保護那兩支端點，
  // 而附件管理頁在路線圖上。這裡不寫「（尚無對應頁面）」之類的 UI 文字——
  // 那會隨功能上線而過期，卻沒有任何東西會提醒你回來改它
  ATTACHMENT: '附件',
};

/**
 * 取 platform 的中文名，查不到時退回原始碼片段
 * @param platform - 權限碼的第一段，如 `BACKEND`
 */
export const platformLabel = (platform: string): string =>
  PLATFORM_LABELS[platform] ?? platform;

/**
 * 取 module 的中文名，查不到時退回原始碼片段
 *
 * 退回英文而不是空字串：標題空白的卡片看起來像壞掉，英文標題至少還讀得出是哪一組。
 * @param module - 權限碼的第二段，如 `ACCOUNT`
 */
export const moduleLabel = (module: string): string =>
  MODULE_LABELS[module] ?? module;
