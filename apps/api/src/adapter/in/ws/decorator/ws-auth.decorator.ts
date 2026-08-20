import { SetMetadata } from '@nestjs/common';

export const WS_AUTHENTICATED_KEY = 'wsAuthenticated';
export const WS_PUBLIC_KEY = 'wsPublic';

/**
 * 宣告此 gateway（或單一事件）的連線已通過認證
 *
 * 與 HTTP 的授權裝飾器同樣是「表態」而非「生效」——實際的認證發生在
 * `handleConnection`。標註的意義在於讓架構守則能區分「刻意公開」與「忘記處理」：
 * 未標註的 handler 一律視為缺陷。
 *
 * 標在 class 上即涵蓋其所有事件 handler。
 */
export const WsAuthenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(WS_AUTHENTICATED_KEY, true);

/**
 * 明示此事件不需要認證
 *
 * 使用時必須在旁註明理由。豁免一旦失去理由就會逐漸長大——這是本專案
 * 在 HTTP 端已經驗證過的模式。
 */
export const WsPublic = (): MethodDecorator => SetMetadata(WS_PUBLIC_KEY, true);
