import type { ResponseCode } from './response-codes';

/**
 * 對外錯誤訊息（單一真相）。
 *
 * 所有 domain exception 的訊息都取自此處，exception 本身不得內嵌文案字面值 ——
 * 集中後才能一眼審視全部對外用詞，未來要換語系也只需替換本表。
 *
 * 值為字串者為「靜態訊息」，`DomainException` 只需 `(code, kind)` 即可自動取用；
 * 值為函式者為「動態訊息」，型別會強制建立 exception 時傳入算好的訊息。
 *
 * `satisfies Record<ResponseCode, ...>` 確保每個已註冊的錯誤碼都有對應訊息 ——
 * 少一條就是 typecheck 失敗，不需要另外寫測試檢查完整性。
 */
export const ResponseMessages = {
  // 帳號
  MEMBER_NOT_FOUND: (id?: string) => (id ? `找不到帳號: ${id}` : '找不到帳號'),
  EMAIL_ALREADY_EXISTS: 'Email 已被使用',
  EMAIL_NOT_FOUND: '找不到該 email 對應的帳號',
  ACCOUNT_DISABLED: '帳號已停用',
  ACCOUNT_LOCKED: '帳號已被鎖定，請聯繫管理員解鎖',
  ACCOUNT_NOT_LOCKED: '帳號未處於鎖定狀態，無需解鎖',
  CANNOT_DELETE_SELF: '不可刪除登入中的自己帳號',
  CANNOT_DISABLE_SELF: '不可停用登入中的自己帳號',
  DEFAULT_MEMBER_NOT_DELETABLE: '預設帳號不可刪除',
  DEFAULT_MEMBER_NOT_EDITABLE: '預設帳號不可編輯',

  // 帳號輸入驗證（domain value object / model 拋出，對應 400）
  // 用對外可讀的說法，不使用 MemberId 這類內部型別名稱
  INVALID_MEMBER_ID: '無效的帳號 ID 格式',
  INVALID_EMAIL_FORMAT: 'Email 格式不正確',
  INVALID_MEMBER_NAME: '名稱不可為空',

  // 認證
  PASSWORD_CHANGE_REQUIRED: '密碼已過期，請更換密碼後再繼續操作',
  INVALID_REFRESH_TOKEN: '無效的 Refresh Token，請重新登入',

  // 角色與權限
  ROLE_NOT_FOUND: '角色不存在',
  DUPLICATE_ROLE_NAME: (name: string) => `角色名稱已存在：${name}`,
  DEFAULT_ROLE_NOT_DELETABLE: '預設角色不可刪除',
  DEFAULT_ROLE_NOT_EDITABLE: '預設角色不可編輯',
  DEFAULT_ROLE_NOT_FOUND: '系統未設定預設角色，請聯繫管理員',
  ROLE_HAS_MEMBERS: (count: number) =>
    `該角色仍有 ${count} 個帳號使用，無法刪除`,
  INVALID_PERMISSION_CODE: (codes: string[]) =>
    `Permission code 不存在：${codes.join(', ')}`,
  INVALID_PERMISSION_COMBINATION: (domain: string) =>
    `設定 ${domain}:EDIT 時必須同時設定 ${domain}:VIEW`,

  // 安全
  IP_LIST_NOT_FOUND: '找不到該 IP 名單紀錄',

  // 附件
  // 上傳失敗的原因由呼叫端決定（副檔名、大小上限等），故為恆等函式；
  // 若日後要讓前端針對不同原因分支，應拆成多個錯誤碼而非放寬此處
  INVALID_UPLOAD: (reason: string) => reason,
  ATTACHMENT_NOT_FOUND: '找不到附件',
  ATTACHMENT_FORBIDDEN: '沒有權限刪除此附件',
  // 「房間不存在」與「你不是成員」刻意共用同一個訊息：分開會讓它變成
  // 探測任意房間是否存在的工具
  CHAT_ROOM_NOT_FOUND: '聊天室不存在或你不是成員',
  CHAT_ROOM_SELF_DIRECT: '無法與自己建立私聊',
  CHAT_MESSAGE_RATE_LIMITED: '訊息發送過於頻繁，請稍後再試',
  WS_RATE_LIMITED: '操作過於頻繁，請稍後再試',
  // 「訊息不存在」與「不是你發的」刻意共用：分開會變成探測任意訊息是否存在的工具
  CHAT_MESSAGE_NOT_FOUND: '訊息不存在或不是你發送的',
  CHAT_MESSAGE_RETRACT_EXPIRED: '超過可撤回的時間',
  CHAT_REPORT_SELF: '無法檢舉自己發送的訊息',
  CHAT_REPORT_NOT_FOUND: '檢舉不存在',
  CHAT_REPORT_INVALID_TRANSITION: '無法將檢舉改回待處理',

  // 系統：刻意維持通用英文訊息，不洩漏內部實作細節
  INTERNAL_SERVER_ERROR: 'Internal server error',
} as const satisfies Record<
  ResponseCode,
  string | ((...args: never[]) => string)
>;

/**
 * 訊息不需參數的錯誤碼。
 *
 * 由訊息表推導而非手工維護第二份清單 —— 把某條訊息從字串改成函式時，
 * 對應的 exception 會立刻因為「少傳 message」而編譯失敗。
 */
export type StaticResponseCode = {
  [K in ResponseCode]: (typeof ResponseMessages)[K] extends string ? K : never;
}[ResponseCode];
