export const TOKEN_BLACKLIST_PORT = 'TOKEN_BLACKLIST_PORT';

/**
 * token 進黑名單的原因。
 *
 * `rotated` 與 `logout` 必須分開：refresh 輪替後的舊 token 再次被使用是**遭竊訊號**，
 * 應撤銷該使用者所有 session；使用者登出的 token 再次被使用只是併發請求撞上登出
 * （前端共用 refreshPromise 時很常見），只該拒絕本次。
 * 兩者若不分，正常登出會把使用者在其他裝置上的 session 一起踢掉。
 */
export type BlacklistReason = 'rotated' | 'logout';

/**
 * 黑名單查詢結果。**三種狀態必須分開**，不能把後兩者都壓成 null：
 *
 * | 值 | 意義 | 呼叫端 |
 * | --- | --- | --- |
 * | `null` | 不在黑名單 | 放行 |
 * | `'rotated'` | 輪替後的舊 token 被重用 | 拒絕 + 撤銷全部 session |
 * | `'logout'` | 登出的 token 被重用 | 只拒絕本次 |
 * | `'unknown'` | 在黑名單，但值無法辨識（改用 reason 之前寫入的舊格式） | 只拒絕本次 |
 *
 * 曾把 `'unknown'` 與 `null` 混為一談：意圖是「少撤銷」，實際卻讓呼叫端連拒絕都跳過，
 * 部署當下所有既存的已登出 / 已輪替 refresh token 在剩餘 TTL 內（預設 7 天）全部復活。
 */
export type BlacklistLookup = BlacklistReason | 'unknown' | null;

export interface TokenBlacklistPort {
  /** 將 token 加入黑名單，TTL 配合 JWT 剩餘效期；reason 決定重用時的處置 */
  addToBlacklist(
    token: string,
    ttlSeconds: number,
    reason: BlacklistReason,
  ): Promise<void>;
  /** 檢查 token 是否在黑名單中（Redis 不可用時採 fail-closed，拋出 503） */
  isBlacklisted(token: string): Promise<boolean>;
  /**
   * 取出 token 進黑名單的原因。
   * @returns 不在黑名單為 `null`；在黑名單但值無法辨識為 `'unknown'`。
   *          兩者都不是 `'rotated'`，故都不觸發連坐撤銷——但 `'unknown'` 仍須拒絕本次。
   */
  getBlacklistReason(token: string): Promise<BlacklistLookup>;
}
