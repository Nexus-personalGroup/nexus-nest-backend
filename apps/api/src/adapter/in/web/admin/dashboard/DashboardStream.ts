import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import {
  GET_DASHBOARD_SNAPSHOT_USE_CASE,
  DashboardSnapshot,
  GetDashboardSnapshotUseCase,
} from '@app/application/port/in/admin/dashboard/DashboardUseCases';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 營運快照的推送來源。
 *
 * **一個實例只跑一個計時器**，查完的快照廣播給該實例上的所有訂閱者。
 * 寫成「每個連線各自 setInterval」是最直覺的實作，而它會讓 10 個管理員
 * 變成 10 倍的資料庫負載——那種放大在開發時看不出來，因為自己只開一個分頁。
 *
 * 沒有訂閱者時停掉計時器：一個沒有人在看的頁面不該持續打資料庫。
 */
@Injectable()
export class DashboardStream implements OnModuleDestroy {
  private readonly logger = new Logger(DashboardStream.name);
  private readonly subject = new Subject<DashboardSnapshot>();
  private timer: NodeJS.Timeout | null = null;
  private subscribers = 0;

  constructor(
    @Inject(GET_DASHBOARD_SNAPSHOT_USE_CASE)
    private readonly getSnapshot: GetDashboardSnapshotUseCase,
  ) {}

  onModuleDestroy(): void {
    this.stop();
    this.subject.complete();
  }

  /**
   * 訂閱快照推送
   *
   * @returns 快照的 Observable；訂閱時立即推一次，取消訂閱時可能停掉計時器
   */
  subscribe(): Observable<DashboardSnapshot> {
    return new Observable<DashboardSnapshot>((observer) => {
      const inner = this.subject.subscribe(observer);
      this.subscribers += 1;
      this.start();
      // 立即推一次：讓客戶端空等一個間隔，那段空白會被當成「壞掉了」
      void this.publish();

      return () => {
        inner.unsubscribe();
        this.subscribers -= 1;
        if (this.subscribers <= 0) this.stop();
      };
    });
  }

  /** 目前的訂閱者數；供測試確認計時器的啟停條件 */
  get subscriberCount(): number {
    return this.subscribers;
  }

  /** 計時器是否運作中；供測試確認「沒有訂閱者就停」 */
  get isRunning(): boolean {
    return this.timer !== null;
  }

  private start(): void {
    if (this.timer) return;
    const intervalMs = getEnv().DASHBOARD_STREAM_INTERVAL_SEC * 1_000;
    this.timer = setInterval(() => void this.publish(), intervalMs);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * 查一次並廣播。
   *
   * **查詢失敗不中斷連線**：資料庫短暫不可用時把所有管理員踢下線，
   * 只會讓他們同時重連——而重連的瞬間又是一波查詢。
   */
  private async publish(): Promise<void> {
    try {
      this.subject.next(await this.getSnapshot.execute());
    } catch (error) {
      this.logger.error(
        `營運快照查詢失敗: ${
          error instanceof Error ? error.message : '未知錯誤'
        }`,
      );
    }
  }
}
