import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsRateLimitedException } from '@app/domain/exception/WsRateLimitedException';
import { ConnectionThrottle } from './ConnectionThrottle';

/**
 * 連線層事件限流的攔截點
 *
 * **做成 guard 而非在每個 handler 加一行**，理由與這個 change 本身相同：
 * 逐個 handler 表態的規則會在新增 handler 時被忘記，而「忘記」正是它要防的缺口。
 * 掛在 gateway class 上之後，日後新增的 `@SubscribeMessage` 自動受涵蓋，
 * 沒有人需要記得任何事。
 *
 * **沒有例外清單，`ping` 也計入**（見 design.md D3）：單次無害不等於每秒一萬次無害，
 * 而例外清單一旦開了頭就會長大，每多一項就多一條不受限的路徑。
 */
@Injectable()
export class ConnectionThrottleGuard implements CanActivate {
  constructor(private readonly throttle: ConnectionThrottle) {}

  /**
   * 檢查這條連線是否超出事件速率
   *
   * @param context - 執行環境；本 guard 只掛在 gateway 上，故必為 ws
   * @returns 恆為 true——超過門檻時以例外中止，讓 `WsExceptionFilter` 統一回覆
   */
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();

    if (this.throttle.hitAndCheck(client.id)) {
      throw new WsRateLimitedException();
    }

    return true;
  }
}
