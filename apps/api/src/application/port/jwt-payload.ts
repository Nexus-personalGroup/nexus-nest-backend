/** JWT Token 的 payload（輕量，只存 memberId + token 類型 + 標準時間欄位） */
export interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
  /** 簽發時的 token 版本；與 member.tokenVersion 不符即視為已撤銷（refresh 重用連坐） */
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
