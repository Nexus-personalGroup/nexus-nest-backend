import type { MemberContext } from '../../member-context';

export const RESOLVE_MEMBER_CONTEXT_USE_CASE = Symbol(
  'ResolveMemberContextUseCase',
);

/**
 * 由 access token 解析出已認證的會員上下文
 *
 * **這是「這個 token 是否有效、對應哪個成員」的唯一判定入口。** HTTP 與 WebSocket
 * 兩條路徑都必須呼叫它，不得各自實作——前一版專案的 WS 認證重寫了一份，
 * 漏掉 tokenVersion 比對，導致帳號被強制登出後既有的 WS 連線仍然有效。
 * 那種分歧不會有任何徵兆。
 *
 * 兩條路徑允許不同的**取 token 方式**（header / handshake）與**失敗表現形式**
 * （HTTP 401 / WS 錯誤事件後斷線），但判定邏輯只有這一份。
 */
export interface ResolveMemberContextUseCase {
  /**
   * 驗證 token 並取得會員上下文
   *
   * @param token - access token 原始字串
   * @returns 通過驗證的會員上下文
   * @throws UnauthorizedException - token 無效、已撤銷、類型不符或會員不存在
   * @throws AccountDisabledException - 帳號已停用
   * @throws ServiceUnavailableException - Redis 不可用（黑名單無法查詢時採 fail-closed）
   */
  resolve(token: string): Promise<MemberContext>;
}
