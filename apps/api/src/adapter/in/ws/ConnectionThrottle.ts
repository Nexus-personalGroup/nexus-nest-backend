import { Injectable } from '@nestjs/common';
import { getEnv } from '@app/infrastructure/validate-env';

/** 單一連線的計數狀態 */
type Counter = {
  /** 目前視窗的起點（epoch ms） */
  windowStartedAt: number;
  count: number;
};

/**
 * 連線層的事件限流。
 *
 * **計數放本實例的記憶體，不走 Redis。** 送訊息的限流走 Redis 是因為它是業務規則
 * （「這個人在這個房間發太多」與他連幾條線、連到哪個實例無關）；
 * 而這一道保護的是**這個行程的事件迴圈**，一條連線只存在於一個實例上。
 *
 * 走 Redis 會有三個代價且沒有對應收益：每個事件多一次網路往返（限流本身變成
 * 它要防的那種負載）、Redis 成為每個 WS 事件的單點、跨實例一致性沒有意義。
 *
 * **代價要認**：開 N 條連線就有 N 倍額度。那是「連線數」的問題，
 * 已經有 `WS_MAX_CONNECTIONS_PER_MEMBER` 管著——兩條防線各司其職，不要互相取代。
 */
@Injectable()
export class ConnectionThrottle {
  private readonly counters = new Map<string, Counter>();

  /**
   * 記錄一次事件並回報是否超過門檻
   *
   * 用**固定視窗**而非滑動視窗：固定視窗在邊界會允許兩倍的瞬時流量，
   * 但這道防線的門檻是「明顯失控」的界線而非精細控制，兩倍仍遠低於失控的量級。
   * 換來的是每條連線只需兩個數字，而不是一串時間戳——
   * 在數千連線時那個差異是實質的。
   *
   * @param connectionId - socket id
   * @returns true 代表已超過門檻，本次事件應被丟棄
   */
  hitAndCheck(connectionId: string): boolean {
    const { WS_CONNECTION_EVENT_LIMIT, WS_CONNECTION_EVENT_WINDOW_SEC } =
      getEnv();
    const windowMs = WS_CONNECTION_EVENT_WINDOW_SEC * 1_000;
    const now = Date.now();

    const existing = this.counters.get(connectionId);
    if (!existing || now - existing.windowStartedAt >= windowMs) {
      this.counters.set(connectionId, { windowStartedAt: now, count: 1 });
      return false;
    }

    existing.count += 1;
    return existing.count > WS_CONNECTION_EVENT_LIMIT;
  }

  /**
   * 連線斷開時清掉它的計數
   *
   * **不清就是記憶體洩漏**：Map 的鍵是 socket id，而 socket id 每次連線都不同。
   * 一個長期運行的實例會累積所有歷史連線的計數器，永遠不會被回收。
   */
  release(connectionId: string): void {
    this.counters.delete(connectionId);
  }

  /** 目前追蹤的連線數；供測試與診斷確認沒有洩漏 */
  get trackedConnections(): number {
    return this.counters.size;
  }
}
