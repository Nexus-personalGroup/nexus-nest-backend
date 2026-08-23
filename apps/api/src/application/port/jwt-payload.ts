/** JWT Token 的 payload（輕量，只存 memberId + token 類型 + 標準時間欄位） */
export interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
  /** 簽發時的 token 版本；與 member.tokenVersion 不符即視為已撤銷（refresh 重用連坐） */
  tokenVersion?: number;
  /**
   * 簽發的側別。
   *
   * **optional 是為了相容**：本欄位上線前簽出的 token 沒有它，後台的驗證
   * 把「缺少 side」視為 admin，避免部署當下所有人被登出。
   *
   * **這是有時效的相容措施**——部署時間超過 refresh token 效期（預設 7 天）之後，
   * 所有流通中的 token 都會帶 side，屆時可以改成拒絕。沒有這句話它會變成永久的後門。
   *
   * 側別的第一道防線是**各側各自的 secret**，本欄位是第二道：
   * 它讓驗證失敗時能說出「這是另一側的 token」而不是只有「簽章無效」。
   */
  side?: 'admin' | 'front';
  iat?: number;
  exp?: number;
}
