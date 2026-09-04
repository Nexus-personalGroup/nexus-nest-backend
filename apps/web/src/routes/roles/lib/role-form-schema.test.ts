import { describe, it, expect } from 'vitest';
import { normalizePermissionCodes } from './role-form-schema';

/** 後端實際提供的碼：ROLE 有 VIEW/EDIT，ATTACHMENT 只有 EDIT */
const AVAILABLE = new Set([
  'BACKEND:ROLE:VIEW',
  'BACKEND:ROLE:EDIT',
  'BACKEND:ATTACHMENT:EDIT',
]);

describe('normalizePermissionCodes', () => {
  it('module 同時有 VIEW 與 EDIT → 補上缺少的 VIEW', () => {
    const result = normalizePermissionCodes(['BACKEND:ROLE:EDIT'], AVAILABLE);

    expect(result).toEqual(['BACKEND:ROLE:EDIT', 'BACKEND:ROLE:VIEW']);
  });

  /**
   * 這條才是抓得到 bug 的那一半。
   *
   * 只測正向（有補 VIEW）的話，「凡 EDIT 就補 VIEW」的字串推導實作也會綠——
   * 而那個實作會合成 `BACKEND:ATTACHMENT:VIEW`（後端沒有這個碼），
   * 導致整個角色存不起來。
   */
  it('⭐ module 只有 EDIT → 不補（那個 VIEW 碼不存在）', () => {
    const result = normalizePermissionCodes(
      ['BACKEND:ATTACHMENT:EDIT'],
      AVAILABLE,
    );

    expect(result).toEqual(['BACKEND:ATTACHMENT:EDIT']);
    expect(result).not.toContain('BACKEND:ATTACHMENT:VIEW');
  });

  it('⭐ 清單未載入 → 不補，送出使用者實際勾的內容', () => {
    const result = normalizePermissionCodes(['BACKEND:ROLE:EDIT'], undefined);

    expect(result).toEqual(['BACKEND:ROLE:EDIT']);
  });

  it('混合情況：該補的補、不該補的不補', () => {
    const result = normalizePermissionCodes(
      ['BACKEND:ATTACHMENT:EDIT', 'BACKEND:ROLE:EDIT'],
      AVAILABLE,
    );

    expect(result).toEqual([
      'BACKEND:ATTACHMENT:EDIT',
      'BACKEND:ROLE:EDIT',
      'BACKEND:ROLE:VIEW',
    ]);
  });

  it('既有行為不變：排序與去重', () => {
    const result = normalizePermissionCodes(
      ['BACKEND:ROLE:VIEW', 'BACKEND:ROLE:EDIT', 'BACKEND:ROLE:VIEW'],
      AVAILABLE,
    );

    expect(result).toEqual(['BACKEND:ROLE:EDIT', 'BACKEND:ROLE:VIEW']);
  });

  it('已含 VIEW 時不重複加入', () => {
    const result = normalizePermissionCodes(
      ['BACKEND:ROLE:EDIT', 'BACKEND:ROLE:VIEW'],
      AVAILABLE,
    );

    expect(result).toHaveLength(2);
  });
});
