/**
 * WebSocket 事件名稱的單一真相來源
 *
 * **不在 `emit()` / `@SubscribeMessage()` 直接寫字串字面值。** 前一版專案兩邊各自寫死，
 * 改名時編譯器不會有任何反應，要等執行期才發現事件永遠收不到。
 *
 * 只放客戶端送進來的事件；伺服器送出的在 `application/port/out/server-events.ts`
 * ——那些名稱由業務服務決定，而 application 不得相依 adapter。
 */

/** 客戶端 → 伺服器 */
export const CLIENT_EVENTS = {
  JOIN_ROOM: 'joinRoom',
  LEAVE_ROOM: 'leaveRoom',
  PING: 'ping',
} as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];

export {
  SERVER_EVENTS,
  type ServerEvent,
} from '@app/application/port/out/server-events';

/**
 * 個人房間的名稱
 *
 * 每條連線都會加入自己的個人房間，讓「送給某個成員的所有裝置」不必先查連線清單，
 * 直接對房間廣播即可——這也讓該操作自動具備跨實例能力。
 */
export const personalRoom = (memberId: string): string => `member:${memberId}`;
