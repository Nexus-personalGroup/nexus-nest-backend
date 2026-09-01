import { describe, expect, it } from 'vitest';
import {
  MODULE_LABELS,
  PLATFORM_LABELS,
  moduleLabel,
  platformLabel,
} from './permission-labels';

/**
 * 中文對照的命中與退回。
 *
 * 「對照齊全」由 api 側的守則比對 `PERMISSION_CATALOG`（跨 workspace，這裡讀不到），
 * 本檔只驗這兩支函式本身的行為。
 */
describe('permission-labels', () => {
  it('命中時回中文', () => {
    expect(platformLabel('BACKEND')).toBe('後台');
    expect(moduleLabel('ACCOUNT')).toBe('管理者帳號');
    expect(moduleLabel('FRONT_USER')).toBe('會員管理');
  });

  /**
   * 退回原始碼片段而非空字串：標題空白的卡片看起來像壞掉，
   * 英文標題至少還讀得出是哪一組——而「對照缺項」本身由守則在合併前擋下。
   */
  it('⭐ 查無對照時退回原始碼片段，不是空字串', () => {
    expect(platformLabel('FRONTEND')).toBe('FRONTEND');
    expect(moduleLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  // 用語必須與側邊欄一致，這三個是 improve-admin-orientation 改過的
  it('⭐ 用語與側邊欄分組一致', () => {
    expect(MODULE_LABELS.ACCOUNT).toBe('管理者帳號');
    expect(MODULE_LABELS.FRONT_USER).toBe('會員管理');
    expect(MODULE_LABELS.MODERATION).toBe('聊天管理');
  });

  it('掃描範圍有效', () => {
    expect(Object.keys(PLATFORM_LABELS).length).toBeGreaterThan(0);
    expect(Object.keys(MODULE_LABELS).length).toBeGreaterThan(0);
  });
});
