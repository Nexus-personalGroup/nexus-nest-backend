/**
 * WebSocket 事件名稱的單一真相來源
 *
 * **不在 `emit()` / `@SubscribeMessage()` 直接寫字串字面值。** 前一版專案兩邊各自寫死，
 * 改名時編譯器不會有任何反應，要等執行期才發現事件永遠收不到。
 *
 * 命名分兩類：`CLIENT_EVENTS` 是客戶端送進來的，`SERVER_EVENTS` 是伺服器送出去的。
 */

/** 客戶端 → 伺服器 */
export const CLIENT_EVENTS = {
  JOIN_GROUP: 'joinGroup',
  LEAVE_GROUP: 'leaveGroup',
  PING: 'ping',
} as const;

/** 伺服器 → 客戶端 */
export const SERVER_EVENTS = {
  /** 連線建立且認證通過 */
  CONNECTED: 'connected',
  /** 認證失敗或事件處理失敗 */
  ERROR: 'error',
  /** 群組成員變動 */
  GROUP_JOINED: 'groupJoined',
  GROUP_LEFT: 'groupLeft',
} as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

/**
 * 個人房間的名稱
 *
 * 每條連線都會加入自己的個人房間，讓「送給某個成員的所有裝置」不必先查連線清單，
 * 直接對房間廣播即可——這也讓該操作自動具備跨實例能力。
 */
export const personalRoom = (memberId: string): string => `member:${memberId}`;
