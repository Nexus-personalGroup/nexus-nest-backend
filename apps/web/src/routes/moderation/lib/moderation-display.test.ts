import { describe, expect, it } from 'vitest';

import {
  actionLabel,
  messageActionFor,
  participantLabel,
  reasonLabel,
  statusBadgeClass,
  statusLabel,
} from './moderation-display';

describe('reasonLabel', () => {
  it('把列舉轉成中文', () => {
    expect(reasonLabel('HARASSMENT')).toBe('騷擾');
    expect(reasonLabel('SPAM')).toBe('洗版');
    expect(reasonLabel('INAPPROPRIATE')).toBe('不當內容');
    expect(reasonLabel('OTHER')).toBe('其他');
  });

  // 後端新增列舉值時前端會先收到沒見過的字串；顯示原字串比顯示「未知」有用
  it('認不得的值回原字串', () => {
    expect(reasonLabel('IMPERSONATION')).toBe('IMPERSONATION');
  });
});

describe('statusLabel', () => {
  it('把狀態轉成中文', () => {
    expect(statusLabel('PENDING')).toBe('待處理');
    expect(statusLabel('REVIEWED')).toBe('已處理');
    expect(statusLabel('DISMISSED')).toBe('已駁回');
  });
});

describe('statusBadgeClass', () => {
  it('三種狀態各有不同樣式', () => {
    const classes = ['PENDING', 'REVIEWED', 'DISMISSED'].map(statusBadgeClass);
    expect(new Set(classes).size).toBe(3);
  });

  it('認不得的狀態有預設樣式，不會回 undefined', () => {
    expect(statusBadgeClass('WHATEVER')).toBeTruthy();
  });
});

describe('participantLabel', () => {
  it('有 email 就顯示 email', () => {
    expect(participantLabel('alice@example.com', 'id-1')).toBe(
      'alice@example.com',
    );
  });

  /**
   * 這是整個佇列頁最容易 render 出空白格的地方。
   *
   * 帳號被刪除時後端回 `null`——那是刻意的（`chat_reports` 不建外鍵就是為了
   * 帳號消失後檢舉仍可審閱）。直接 render 會變成空白，看起來像資料壞掉。
   */
  it('email 為 null → 顯示「已刪除的帳號」與 id 尾碼', () => {
    expect(participantLabel(null, '550e8400-e29b-41d4-a716-446655440000')).toBe(
      '已刪除的帳號（55440000）',
    );
  });

  it('email 與 id 都沒有 → 仍給得出可讀的字串', () => {
    expect(participantLabel(null, undefined)).toBe('已刪除的帳號');
  });

  it('空字串 email 視同沒有', () => {
    expect(participantLabel('', 'abcdefgh')).toBe('已刪除的帳號（abcdefgh）');
  });
});

describe('actionLabel', () => {
  it('把稽核行為轉成中文', () => {
    expect(actionLabel('MESSAGE_REMOVED')).toBe('訊息被移除');
    expect(actionLabel('MEMBER_SUSPENDED')).toBe('帳號被停權');
  });

  it('認不得的行為回原字串', () => {
    expect(actionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('messageActionFor', () => {
  it('未移除 → 顯示移除', () => {
    expect(messageActionFor(null)).toBe('remove');
  });

  it('已移除 → 顯示還原', () => {
    expect(messageActionFor('2026-08-21T06:00:00.000Z')).toBe('restore');
  });

  // 訊息已不存在時後端也回 null，與「未被移除」同樣顯示「移除」——
  // 移除一則不存在的訊息會得到 404，那是正確的回饋
  it('undefined 視同未移除', () => {
    expect(messageActionFor(undefined)).toBe('remove');
  });
});
