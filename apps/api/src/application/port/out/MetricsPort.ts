export const METRICS_PORT = 'METRICS_PORT';

/** WS 事件的結果；標籤只用這兩個值，避免基數擴散 */
export type WsEventOutcome = 'success' | 'error';

/**
 * 會在相依不可用時降級放行的安全防護；封閉集合，標籤基數可控。
 *
 * `account-lock` 是帳號層的登入失敗計數，`ip-block` 是 IP 層的。
 * 兩者共用同一個降級模式，但要分得開——只有一邊在降級是有意義的資訊。
 */
export type SecurityGuard = 'account-lock' | 'ip-block';

/**
 * 應用指標。
 *
 * 業務服務要能說「訊息送出了」「這次被限流擋下」，但不該知道那是 counter
 * 還是 histogram——換掉監控實作時不該動到任何業務程式碼。
 *
 * **標籤不得使用無界的值（例如房間 ID）。** 房間數是無界的，
 * 標籤基數爆炸會拖垮 Prometheus，那是監控系統最典型的自傷方式。
 */
export interface MetricsPort {
  /** 訊息送出計數 */
  incrementMessages(): void;

  /**
   * 訊息寫入耗時（秒）。
   *
   * 含配號的鎖等待——同一房間的寫入被序列化是刻意的設計，
   * 但熱門房間會不會因此排隊，只能靠這個指標看出來。
   */
  observeMessageWriteSeconds(seconds: number): void;

  /** 限流觸發計數 */
  incrementRateLimited(): void;

  /** WS 事件計數，依事件名與結果分類 */
  incrementWsEvent(event: string, outcome: WsEventOutcome): void;

  /** 目前連線數。Prometheus 依 scrape target 自動帶實例標籤，此處不加 */
  setConnections(count: number): void;

  /**
   * 單輪心跳的耗時（秒）。
   *
   * 心跳掛在固定週期的計時器上，「還有多少餘裕」不該靠猜——
   * 單輪耗時逼近週期時就是該擴實例或調參的訊號。
   */
  observeHeartbeatSeconds(seconds: number): void;

  /** 因上一輪未完成而被跳過的心跳輪數。持續增加代表續期已經跟不上 */
  incrementHeartbeatSkipped(): void;

  /**
   * 安全防護降級放行的次數。
   *
   * 暴力破解防護在 Redis 不可用時選擇放行（不擋），那是刻意的 graceful
   * degradation——擋下來等於把快取故障升級成全站故障。但**放行必須留下痕跡**：
   * 沒有這個指標，就無法回答「上週那波登入嘗試發生在防護有效還是失效的時候」。
   *
   * @param guard - 哪一道防護降級了
   */
  incrementSecurityDegraded(guard: SecurityGuard): void;
}
