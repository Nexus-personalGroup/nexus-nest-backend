import { ConnectionThrottle } from './ConnectionThrottle';
import { getEnv } from '@app/infrastructure/validate-env';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(),
}));

const mockGetEnv = jest.mocked(getEnv);

describe('ConnectionThrottle', () => {
  let throttle: ConnectionThrottle;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    // clearAllMocks 不會還原 mockReturnValue，每支測試都要重設
    mockGetEnv.mockReturnValue({
      WS_CONNECTION_EVENT_LIMIT: 3,
      WS_CONNECTION_EVENT_WINDOW_SEC: 1,
    } as unknown as ReturnType<typeof getEnv>);
    throttle = new ConnectionThrottle();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('門檻內的事件全部放行', () => {
    expect(throttle.hitAndCheck('s1')).toBe(false);
    expect(throttle.hitAndCheck('s1')).toBe(false);
    expect(throttle.hitAndCheck('s1')).toBe(false);
  });

  it('超過門檻的事件被擋下', () => {
    for (let i = 0; i < 3; i += 1) throttle.hitAndCheck('s1');

    expect(throttle.hitAndCheck('s1')).toBe(true);
  });

  it('視窗過去後恢復放行', () => {
    for (let i = 0; i < 4; i += 1) throttle.hitAndCheck('s1');
    expect(throttle.hitAndCheck('s1')).toBe(true);

    jest.advanceTimersByTime(1_000);

    expect(throttle.hitAndCheck('s1')).toBe(false);
  });

  /**
   * 計數單位是**連線**而非成員。
   *
   * 若把鍵寫成 memberId，同一人的第二個裝置會共用額度——那是業務層限流的職責，
   * 不是這一道。兩者混淆的後果是「手機在用時電腦連不上」這種難以歸因的症狀。
   */
  it('兩條連線各自計數，互不影響', () => {
    for (let i = 0; i < 4; i += 1) throttle.hitAndCheck('s1');
    expect(throttle.hitAndCheck('s1')).toBe(true);

    expect(throttle.hitAndCheck('s2')).toBe(false);
  });

  /**
   * 這支測試釘的是記憶體洩漏，不是行為。
   *
   * 少了 `release()` 的實作在功能測試上**完全正常**——限流照樣生效、
   * 使用者毫無感覺，直到實例跑了幾週後記憶體才慢慢爬升。
   * 這類缺陷不會有人回報，只能靠測試在寫的當下釘住。
   */
  it('連線斷開後計數被清掉，不留殘骸', () => {
    throttle.hitAndCheck('s1');
    throttle.hitAndCheck('s2');
    expect(throttle.trackedConnections).toBe(2);

    throttle.release('s1');

    expect(throttle.trackedConnections).toBe(1);
  });

  it('清掉之後同一個 id 從頭計數', () => {
    for (let i = 0; i < 4; i += 1) throttle.hitAndCheck('s1');
    expect(throttle.hitAndCheck('s1')).toBe(true);

    throttle.release('s1');

    expect(throttle.hitAndCheck('s1')).toBe(false);
  });

  it('清掉未追蹤的連線不會出錯', () => {
    expect(() => throttle.release('never-seen')).not.toThrow();
  });
});
