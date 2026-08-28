export const MEMBER_CONTEXT_CACHE_PORT = 'MEMBER_CONTEXT_CACHE_PORT';

export interface MemberContextCachePort {
  /** 取得 memberId 對應的快取 MemberContext（JSON 字串），未命中回傳 null */
  getByMemberId(memberId: string): Promise<string | null>;
  /** 寫入 MemberContext 快取，TTL 配合 JWT 剩餘效期 */
  setByMemberId(
    memberId: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void>;
  /** 清除單一成員的快取，強制下次請求重新查詢 */
  clearByMemberId(memberId: string): Promise<void>;
  /**
   * 批次清除多名成員的快取（角色權限變更時使用）
   * @param memberIds - 要清除的成員 ID；空陣列為無操作
   */
  clearMany(memberIds: string[]): Promise<void>;
  /** Redis 是否可用（快取未命中時用來決定是否記錄降級警告） */
  readonly isAvailable: boolean;
}
