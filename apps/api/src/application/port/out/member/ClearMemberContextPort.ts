export const CLEAR_MEMBER_CONTEXT_PORT = 'CLEAR_MEMBER_CONTEXT_PORT';

export interface ClearMemberContextPort {
  /** 登出後清除該會員的 MemberContext 快取，強制下次請求重新查詢 */
  clearMemberContext(memberId: string): Promise<void>;
}
