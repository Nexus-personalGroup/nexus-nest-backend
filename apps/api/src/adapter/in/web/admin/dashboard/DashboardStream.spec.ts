import { DashboardStream } from './DashboardStream';
import type {
  DashboardSnapshot,
  GetDashboardSnapshotUseCase,
} from '@app/application/port/in/admin/dashboard/DashboardUseCases';
import { getEnv } from '@app/infrastructure/validate-env';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(),
}));

const mockGetEnv = jest.mocked(getEnv);

const snapshot = (): DashboardSnapshot => ({
  onlineMembers: 1,
  pendingReports: 2,
  totalRooms: 3,
  totalMembers: 4,
  messagesToday: 5,
  generatedAt: new Date(0),
});

describe('DashboardStream', () => {
  let getSnapshot: jest.Mocked<GetDashboardSnapshotUseCase>;
  let stream: DashboardStream;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // clearAllMocks 不會還原 mockReturnValue，每支測試都要重設
    mockGetEnv.mockReturnValue({
      DASHBOARD_STREAM_INTERVAL_SEC: 5,
    } as unknown as ReturnType<typeof getEnv>);
    getSnapshot = {
      execute: jest.fn().mockResolvedValue(snapshot()),
    };
    stream = new DashboardStream(getSnapshot);
  });

  afterEach(() => {
    stream.onModuleDestroy();
    jest.useRealTimers();
  });

  // 讓客戶端空等一個間隔，那段空白會被當成「壞掉了」
  it('訂閱時立即推一次，不等第一個間隔', async () => {
    const received: DashboardSnapshot[] = [];
    stream.subscribe().subscribe((value) => received.push(value));

    await Promise.resolve();
    await Promise.resolve();

    expect(getSnapshot.execute).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
  });

  /**
   * **一個實例只跑一個計時器。**
   *
   * 寫成「每個連線各自 setInterval」是最直覺的實作，而它會讓 10 個管理員
   * 變成 10 倍的資料庫負載——那種放大在開發時看不出來，因為自己只開一個分頁。
   */
  it('⭐ 三個訂閱者，一個週期只查一次', async () => {
    const counts = [0, 0, 0];
    stream.subscribe().subscribe(() => (counts[0] += 1));
    stream.subscribe().subscribe(() => (counts[1] += 1));
    stream.subscribe().subscribe(() => (counts[2] += 1));
    await Promise.resolve();
    getSnapshot.execute.mockClear();

    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(getSnapshot.execute).toHaveBeenCalledTimes(1);
    // 一次查詢，三個人都收到
    expect(counts.every((count) => count > 0)).toBe(true);
  });

  /**
   * 沒有訂閱者就停掉計時器。
   *
   * 漏了這一步**完全沒有症狀**——功能照常、使用者毫無感覺，
   * 只是一個沒有人在看的頁面持續打資料庫，直到有人去看查詢日誌才發現。
   */
  it('⭐ 最後一個訂閱者離開後停止查詢', async () => {
    const first = stream.subscribe().subscribe();
    const second = stream.subscribe().subscribe();
    await Promise.resolve();
    expect(stream.isRunning).toBe(true);

    first.unsubscribe();
    expect(stream.isRunning).toBe(true);

    second.unsubscribe();
    expect(stream.isRunning).toBe(false);
    expect(stream.subscriberCount).toBe(0);
  });

  it('再有人訂閱時重新啟動', async () => {
    stream.subscribe().subscribe().unsubscribe();
    expect(stream.isRunning).toBe(false);

    stream.subscribe().subscribe();
    await Promise.resolve();

    expect(stream.isRunning).toBe(true);
  });

  /**
   * 查詢失敗不中斷連線。
   *
   * 資料庫短暫不可用時把所有管理員踢下線，只會讓他們同時重連——
   * 而重連的瞬間又是一波查詢。
   */
  it('⭐ 單次查詢失敗 → 連線保持，下一週期照常重試', async () => {
    getSnapshot.execute.mockRejectedValueOnce(new Error('資料庫掛了'));
    const received: DashboardSnapshot[] = [];
    const errors: unknown[] = [];
    stream.subscribe().subscribe({
      next: (value) => received.push(value),
      error: (error) => errors.push(error),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(errors).toHaveLength(0);
    expect(received).toHaveLength(0);

    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(received).toHaveLength(1);
  });

  it('間隔來自環境變數，不寫死', async () => {
    mockGetEnv.mockReturnValue({
      DASHBOARD_STREAM_INTERVAL_SEC: 60,
    } as unknown as ReturnType<typeof getEnv>);
    const fresh = new DashboardStream(getSnapshot);
    fresh.subscribe().subscribe();
    await Promise.resolve();
    getSnapshot.execute.mockClear();

    jest.advanceTimersByTime(5_000);
    expect(getSnapshot.execute).not.toHaveBeenCalled();

    jest.advanceTimersByTime(55_000);
    expect(getSnapshot.execute).toHaveBeenCalledTimes(1);
    fresh.onModuleDestroy();
  });
});
