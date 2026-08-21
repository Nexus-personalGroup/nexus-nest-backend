export const REVOKE_MEMBER_SESSIONS_USE_CASE =
  'REVOKE_MEMBER_SESSIONS_USE_CASE';

/**
 * 中止某成員既有的所有 WebSocket 連線。
 *
 * 存在的理由是一個「每一層都正確、但沒有人負責銜接」的缺口：
 * 連線層的認證只在 handshake 執行一次，之後的事件只驗資源層級的授權。
 * 帳號停用之後，既有的連線仍然可以繼續操作——**被停權的人只要連線還開著，
 * 就能繼續送訊息**。
 */
export interface RevokeMemberSessionsUseCase {
  execute(memberId: string): Promise<void>;
}
