/**
 * 伺服器送出的 WebSocket 事件名稱
 *
 * 放在 application 的 out port 旁而非 `adapter/in/ws/`：決定「送出什麼事件」的是
 * 業務服務（例如成員離開房間要通知誰），而 application 不得相依 adapter。
 * 反向的 `CLIENT_EVENTS` 留在 adapter——那是純粹的傳輸入口，只有 gateway 認得。
 *
 * 不在 `emit()` 直接寫字串字面值：前一版專案兩邊各自寫死，改名時編譯器不會有任何反應，
 * 要等執行期才發現事件永遠收不到。
 */
export const SERVER_EVENTS = {
  /** 連線建立且認證通過 */
  CONNECTED: 'connected',
  /** 認證失敗或事件處理失敗 */
  ERROR: 'error',
  /** 本條連線已加入 / 離開某房間的 socket room（只回給發起的那條連線） */
  ROOM_JOINED: 'roomJoined',
  ROOM_LEFT: 'roomLeft',
  /** 房間成員加入或離開，送給該房間其餘成員 */
  ROOM_MEMBER_CHANGED: 'roomMemberChanged',
  /** 送訊息成功的回執，只回給送出的那條連線 */
  MESSAGE_ACK: 'messageAck',
  /** 新訊息，送給房間所有成員（含送出者自己） */
  MESSAGE_CREATED: 'messageCreated',
  /** 斷線補齊的結果，只回給要求補齊的那條連線 */
  ROOM_SYNCED: 'roomSynced',
  /** 某成員的已讀位置前進，送給房間其他成員 */
  ROOM_READ: 'roomRead',
  /** 訊息被撤回，送給房間所有成員；payload 不含內容 */
  MESSAGE_RETRACTED: 'messageRetracted',
  /**
   * 訊息被管理員移除。
   *
   * 與 MESSAGE_RETRACTED 是**兩個獨立事件**，不共用帶 action 的單一事件：
   * 兩者對使用者的語意不同，共用會讓客戶端在每個 handler 裡先分支，
   * 而它們的 payload 也確實不同
   */
  MESSAGE_REMOVED: 'messageRemoved',
  /** 被誤移除的訊息已還原；payload 帶還原後的撤回狀態 */
  MESSAGE_RESTORED: 'messageRestored',
} as const;

export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
