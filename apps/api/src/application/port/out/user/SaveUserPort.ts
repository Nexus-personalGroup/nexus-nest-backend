export const SAVE_USER_PORT = 'SAVE_USER_PORT';

/**
 * 前台使用者的寫入 out port。
 *
 * 與 `LoadUserPort` 分開，理由同 `member/` 下的 Load/Save 拆分：
 * 讀取的呼叫端遠多於寫入，把寫入方法掛在一個叫 Load 的介面上，
 * 等於讓每一個只想查東西的地方都拿到改東西的能力。
 */
export interface SaveUserPort {
  /**
   * 停用帳號並遞增 `tokenVersion`。
   *
   * **回傳「是否真的改變了狀態」**：對已停用的帳號重複呼叫要回 `false`，
   * 呼叫端才能據此跳過斷線與稽核。判定放在這裡而非「先讀再寫」，
   * 是因為條件式更新本身就是原子的——先讀再寫會有兩個請求同時通過的窗口，
   * 結果是同一次停權寫兩筆稽核。
   *
   * `tokenVersion` 的遞增是「立即讓所有裝置失效」的唯一機制：
   * 只改 `status` 的話，既有的 access token 在到期前仍然驗得過。
   */
  suspend(id: string): Promise<boolean>;
  /**
   * 重新啟用帳號。回傳「是否真的改變了狀態」，理由同 `suspend`。
   *
   * **不動 `tokenVersion`**：停權當下已經遞增過，舊 token 早就失效了，
   * 再遞增一次沒有任何東西會被撤銷。
   */
  reinstate(id: string): Promise<boolean>;
}
