import { describe, it, expect } from 'vitest';
import { parseStatusParam, statusFilterToBoolean } from './status-filter';

describe('parseStatusParam', () => {
  it("'true' / 'false' → 原樣保留", () => {
    expect(parseStatusParam('true')).toBe('true');
    expect(parseStatusParam('false')).toBe('false');
  });

  it('null 或非法值 → undefined（不過濾）', () => {
    expect(parseStatusParam(null)).toBeUndefined();
    expect(parseStatusParam('xxx')).toBeUndefined();
  });
});

describe('statusFilterToBoolean', () => {
  it("'true' → true、'false' → false", () => {
    expect(statusFilterToBoolean('true')).toBe(true);
    expect(statusFilterToBoolean('false')).toBe(false);
  });

  it('undefined → undefined（不送 status 欄位）', () => {
    expect(statusFilterToBoolean(undefined)).toBeUndefined();
  });
});
