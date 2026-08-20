import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { ServerOptions } from 'socket.io';
import { RedisService } from './redis/redis.service';

/**
 * 讓 Socket.IO 具備跨實例廣播能力
 *
 * 沒有這一層，`server.to(room).emit()` 只會送到**本行程持有的連線**。
 * 收件者連在哪個實例是隨機的，因此單機廣播的實際效果是隨機丟失訊息——
 * 前一版專案正是卡在這裡：功能看起來正常，開第二個實例才發現訊息會消失。
 *
 * 需要 **pub 與 sub 兩條獨立連線**：進入 subscribe 模式的 Redis 連線在協定上
 * 不能再發一般指令，共用一條會讓廣播與其他操作互相打架。兩條都由
 * `RedisService.createDedicatedClient()` 產生，以沿用同一份連線設定。
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  /** 建立 pub / sub 連線並組出 adapter。必須在 `app.listen()` 之前呼叫 */
  async connect(): Promise<void> {
    const pubClient = await this.redis.createDedicatedClient('socket.io-pub');
    const subClient = await this.redis.createDedicatedClient('socket.io-sub');
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.IO Redis adapter 已就緒（跨實例廣播啟用）');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as {
      adapter: (ctor: ReturnType<typeof createAdapter>) => void;
    };
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    } else {
      // 走到這裡代表 connect() 沒被呼叫或失敗了。不靜默略過——
      // 症狀會是「單機測試全過、上線後訊息隨機消失」，是最難追的那種
      this.logger.error(
        'Redis adapter 未就緒，WebSocket 廣播將只在單一實例內生效',
      );
    }
    return server;
  }
}
