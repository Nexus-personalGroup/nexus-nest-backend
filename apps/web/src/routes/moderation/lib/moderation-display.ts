/** 檢舉原因 */
export type ReportReason = 'HARASSMENT' | 'SPAM' | 'INAPPROPRIATE' | 'OTHER';

/** 檢舉狀態 */
export type ReportStatus = 'PENDING' | 'REVIEWED' | 'DISMISSED';

const REASON_LABELS: Record<ReportReason, string> = {
  HARASSMENT: '騷擾',
  SPAM: '洗版',
  INAPPROPRIATE: '不當內容',
  OTHER: '其他',
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: '待處理',
  REVIEWED: '已處理',
  DISMISSED: '已駁回',
};

/**
 * 檢舉原因的中文標籤
 *
 * 吃 `string` 而非 `ReportReason`：後端日後新增列舉值時，
 * 前端會先收到一個沒見過的字串。回傳原字串至少讓人看得出是什麼，
 * 比顯示「未知」或整頁壞掉好。
 *
 * @param reason - 後端回的原因列舉
 * @returns 中文標籤；認不得時回原字串
 */
export const reasonLabel = (reason: string): string =>
  REASON_LABELS[reason as ReportReason] ?? reason;

/**
 * 檢舉狀態的中文標籤
 *
 * @param status - 後端回的狀態列舉
 * @returns 中文標籤；認不得時回原字串
 */
export const statusLabel = (status: string): string =>
  STATUS_LABELS[status as ReportStatus] ?? status;

/** 狀態徽章的樣式；待處理刻意用最醒目的顏色——佇列的重點是「還有什麼沒處理」 */
export const statusBadgeClass = (status: string): string => {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    case 'REVIEWED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    case 'DISMISSED':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

/**
 * 當事人的顯示名稱
 *
 * **email 為 null 代表帳號已被刪除**（`chat_reports` 刻意不建外鍵，
 * 就是為了帳號消失後檢舉仍可審閱）。此時顯示「已刪除的帳號」加上 id 尾碼——
 * 直接 render `null` 會變成空白格，看起來像資料壞掉，
 * 而審閱者無從判斷是「沒有這個人」還是「系統沒抓到」。
 *
 * @param email - 後端回的 email，帳號已刪除時為 null
 * @param id - 當事人 ID，用於在 email 缺席時提供可辨識的線索
 * @returns 可直接顯示的字串
 */
export const participantLabel = (
  email: string | null | undefined,
  id: string | undefined,
): string => {
  if (email) return email;
  const suffix = id ? id.slice(-8) : '';
  return suffix ? `已刪除的帳號（${suffix}）` : '已刪除的帳號';
};

/** 稽核行為的中文標籤 */
const ACTION_LABELS: Record<string, string> = {
  ROOM_JOINED: '加入房間',
  ROOM_LEFT: '離開房間',
  MESSAGE_RETRACTED: '撤回訊息',
  MESSAGE_RETRACT_REJECTED: '撤回被拒',
  MESSAGE_RATE_LIMITED: '訊息被限流',
  REPORT_SUBMITTED: '提出檢舉',
  REPORT_VIEWED: '檢舉被查看',
  MESSAGE_REMOVED: '訊息被移除',
  MESSAGE_RESTORED: '訊息被還原',
  MEMBER_SUSPENDED: '帳號被停權',
  MEMBER_REINSTATED: '帳號被解除停權',
};

/**
 * 稽核行為的中文標籤
 *
 * @param action - 後端回的行為列舉
 * @returns 中文標籤；認不得時回原字串
 */
export const actionLabel = (action: string): string =>
  ACTION_LABELS[action] ?? action;

/**
 * 依訊息的移除時間決定該顯示哪一個處置動作
 *
 * **兩者互斥。** 同時顯示「移除」與「還原」會讓管理員必須自己判斷
 * 訊息現在是什麼狀態——而那正是後端補 `targetMessageRemovedAt` 要解決的問題。
 *
 * @param removedAt - 訊息的移除時間；未被移除或訊息已不存在時為 null
 * @returns 該顯示的動作
 */
export const messageActionFor = (
  removedAt: string | null | undefined,
): 'remove' | 'restore' => (removedAt ? 'restore' : 'remove');
