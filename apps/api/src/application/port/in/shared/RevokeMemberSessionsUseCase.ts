export const REVOKE_MEMBER_SESSIONS_USE_CASE =
  'REVOKE_MEMBER_SESSIONS_USE_CASE';

/**
 * 中止某個 ID 既有的所有 WebSocket 連線。
 *
 * 存在的理由是一個「每一層都正確、但沒有人負責銜接」的缺口：
 * 連線層的認證只在 handshake 執行一次，之後的事件只驗資源層級的授權。
 * 帳號停用之後，既有的連線仍然可以繼續操作——**被停權的人只要連線還開著，
 * 就能繼續送訊息**。
 *
 * **這一支不分側別，也不需要分。** 它只做「對個人房間廣播再斷線」，
 * 完全不查任何一張帳號表——實際會有連線的只有前台使用者，
 * 拿管理員的 ID 呼叫它是無害的無操作。兩個停權入口各自複製一份實作，
 * 換來的只是兩份會各自漂移的相同程式碼。
 *
 * 帳號管理側（停後台帳號）仍然呼叫它：目前必然是無操作，
 * 但那是「後台帳號沒有 WS 連線」這個事實的結果，不是這一層可以假設的前提。
 */
export interface RevokeMemberSessionsUseCase {
  execute(memberId: string): Promise<void>;
}
