import { describe, expect, it } from 'vitest';

import {
  actionLabel,
  counterpartHeader,
  MESSAGE_COUNT_HINT,
  messageActionFor,
  parseRoomTypeFilter,
  roomTypeLabel,
  onlineLabel,
  parseReportRole,
  participantLabel,
  reasonLabel,
  roomLabel,
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

describe('onlineLabel', () => {
  // 不標明「查詢當下」的話，使用者會以為它即時，然後在它不變時懷疑系統壞了
  it('兩種狀態都標明是查詢當下的快照', () => {
    expect(onlineLabel(true)).toContain('查詢當下');
    expect(onlineLabel(false)).toContain('查詢當下');
  });

  it('分得出在線與離線', () => {
    expect(onlineLabel(true)).not.toBe(onlineLabel(false));
  });
});

describe('roomLabel', () => {
  it('有名稱就顯示名稱', () => {
    expect(roomLabel('工作群')).toBe('工作群');
  });

  // 私聊的顯示名由對方決定、不落庫，所以後端回 null
  it('null 或空字串 → 顯示「私聊」', () => {
    expect(roomLabel(null)).toBe('私聊');
    expect(roomLabel('')).toBe('私聊');
  });
});

describe('parseReportRole', () => {
  it('預設看被檢舉', () => {
    expect(parseReportRole(null)).toBe('TARGET');
    expect(parseReportRole(undefined)).toBe('TARGET');
  });

  it('可指定 REPORTER', () => {
    expect(parseReportRole('REPORTER')).toBe('REPORTER');
  });

  it('認不得的值落回 TARGET，不讓手改網址弄壞畫面', () => {
    expect(parseReportRole('whatever')).toBe('TARGET');
  });
});

describe('counterpartHeader', () => {
  // 對造是「另一邊」；顯示這個人自己等於每一列都印同一個 email
  it('兩個方向的對造不同', () => {
    expect(counterpartHeader('TARGET')).toBe('檢舉人');
    expect(counterpartHeader('REPORTER')).toBe('被檢舉人');
  });
});

describe('roomTypeLabel', () => {
  it('把類型轉成中文', () => {
    expect(roomTypeLabel('GROUP')).toBe('群組');
    expect(roomTypeLabel('DIRECT')).toBe('私聊');
  });

  it('認不得的值回原字串', () => {
    expect(roomTypeLabel('CHANNEL')).toBe('CHANNEL');
  });
});

describe('parseRoomTypeFilter', () => {
  it('沒帶參數 → undefined（不篩選）', () => {
    expect(parseRoomTypeFilter(null)).toBeUndefined();
    expect(parseRoomTypeFilter(undefined)).toBeUndefined();
  });

  it('兩個合法值原樣回傳', () => {
    expect(parseRoomTypeFilter('GROUP')).toBe('GROUP');
    expect(parseRoomTypeFilter('DIRECT')).toBe('DIRECT');
  });

  it('認不得的值落回不篩選', () => {
    expect(parseRoomTypeFilter('whatever')).toBeUndefined();
  });
});

describe('MESSAGE_COUNT_HINT', () => {
  // 不標明的話「訊息量」會被讀成「現在有幾則」，而撤回過訊息後兩者就不一樣了
  it('說明文字要點出「含已撤回與已移除」', () => {
    expect(MESSAGE_COUNT_HINT).toContain('已撤回');
    expect(MESSAGE_COUNT_HINT).toContain('已被移除');
  });
});
