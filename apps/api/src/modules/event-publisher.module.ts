import { Module } from '@nestjs/common';
import { SocketIoEventPublisher } from '@app/adapter/out/socketio/SocketIoEventPublisher';
import { EVENT_PUBLISHER_PORT } from '@app/application/port/out/EventPublisherPort';

/**
 * 事件送出的傳輸層（`EVENT_PUBLISHER_PORT`）。
 *
 * 從 `ChatWsModule` 抽出來，是為了讓「只想送一個事件」的模組不必把整個連線層
 * （gateway、連線限流、Socket.IO adapter）拉進 DI 圖。抽得掉的原因是
 * `SocketIoEventPublisher` **沒有任何建構子相依**——它的 server 是 gateway
 * 在 `afterInit` 時 `bind()` 進來的，不是 DI 注入的。
 *
 * ⚠️ **單例性是這個拆法成立的前提。** 需要它的模組一律 `imports: [EventPublisherModule]`，
 * **絕不可自己再 provide 一次** `SocketIoEventPublisher`——那會產生第二個實例，
 * 而只有 gateway `bind()` 過的那一個持有 server。另一個會**永遠靜默地送不出事件**：
 * 該 adapter 在未綁定時刻意記警告而非拋錯（事件送不出去不該讓業務流程整個失敗），
 * 於是症狀是「某些推播就是沒有到」，而沒有任何錯誤指向這裡。
 */
@Module({
  providers: [
    SocketIoEventPublisher,
    { provide: EVENT_PUBLISHER_PORT, useExisting: SocketIoEventPublisher },
  ],
  // SocketIoEventPublisher 本身也匯出：gateway 的 afterInit 要拿到具體型別呼叫 bind()
  exports: [EVENT_PUBLISHER_PORT, SocketIoEventPublisher],
})
export class EventPublisherModule {}
