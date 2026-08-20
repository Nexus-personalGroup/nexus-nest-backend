import { beforeEach, describe, expect, it } from 'vitest';

import { tokenStorage } from './storage';

describe('tokenStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('未設定時 get() 回傳 null', () => {
    expect(tokenStorage.get()).toBeNull();
  });

  it('set() 後 get() 拿到同一個值', () => {
    tokenStorage.set('abc123');
    expect(tokenStorage.get()).toBe('abc123');
  });

  it('clear() 後 get() 回傳 null', () => {
    tokenStorage.set('abc123');
    tokenStorage.clear();
    expect(tokenStorage.get()).toBeNull();
  });
});
