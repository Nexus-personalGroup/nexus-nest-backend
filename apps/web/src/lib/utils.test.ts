import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('合併多個 class 字串', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('條件式 class（falsy 略過）', () => {
    const show = false;
    expect(cn('a', show && 'b', undefined, 'c')).toBe('a c');
  });

  it('tailwind 衝突時後者覆蓋前者', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
