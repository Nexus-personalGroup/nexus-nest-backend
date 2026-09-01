/**
 * 後台存在、但無法透過角色指派的功能。
 *
 * 安全管理（IP 白名單 / IP 黑名單 / 帳號解鎖）由 `@Roles(RoleCode.SUPERADMIN)` 保護，
 * 沒有對應的權限碼，因此 `GET /roles/permissions` 不會回它們——**不畫在權限樹上的話，
 * 使用者會看到後台有 IP 白名單頁、權限設定裡卻找不到，合理地判斷成「權限漏設了」。**
 * 顯示成不可指派則當場回答了那個問題。
 *
 * 這是刻意的安全模型而非缺口：能改 IP 名單等同能繞過所有 IP 層防護，
 * 不存在「只給一半」的合理情境（見 `openspec/specs/api-security-management/spec.md`）。
 *
 * ⚠️ 清單寫死在前端，正確性依賴後端沒有改用 `PermissionsGuard`。
 * 改了的話這裡會繼續顯示「不可指派」而實際上已經可以指派——畫面對使用者說謊，
 * 且不會有任何測試失敗。由 `unassignable-permissions.spec.ts`（api 側守則）盯住那個守衛。
 */
export const UNASSIGNABLE_GROUP = {
  module: '安全管理',
  badge: '限超級管理者',
  /** tooltip 要說**為什麼**——只寫「無權限」的話使用者會去要那個權限，而它要不到 */
  reason:
    '安全設定限超級管理者：能改 IP 名單等同能繞過所有 IP 層防護，不開放細分授權',
  items: ['IP 白名單', 'IP 黑名單', '帳號解鎖'],
} as const;
