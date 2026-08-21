export const METRICS_PORT = 'METRICS_PORT';

/** WS 事件的結果；標籤只用這兩個值，避免基數擴散 */
export type WsEventOutcome = 'success' | 'error';

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
}
