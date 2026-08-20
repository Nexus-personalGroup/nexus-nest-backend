/**
 * WebSocket 測試客戶端
 *
 * M1 沒有使用者介面（聊天前台是獨立 repo），這支腳本是**唯一能手動驗證連線行為的入口**，
 * 也是製造 M2 斷線補齊、M3 監控埋點所需情境的工具。因此照正式程式碼的標準寫，
 * 不是拋棄式腳本。
 *
 * 用法：
 *   pnpm --filter @app/api ws:client -- --token <accessToken>
 *   pnpm --filter @app/api ws:client -- --token <t> --url http://127.0.0.1:3001 --room <roomId>
 *   pnpm --filter @app/api ws:client -- --token <t> --clients 3      # 同時開 3 條連線
 *
 * 連上之後可用的互動指令（直接在 stdin 輸入）：
 *   join <roomId>      加入房間（必須是真實房間且你是成員）
 *   leave <roomId>     離開房間
 *   ping               往返探測
 *   drop               主動斷線（不重連，用於觀察 presence 的回收）
 *   quit               結束
 */
import * as readline from 'readline';
import { io, Socket } from 'socket.io-client';

interface Options {
  url: string;
  token: string;
  room?: string;
  clients: number;
}

/** 解析 `--key value` 形式的參數 */
const parseArgs = (argv: string[]): Options => {
  const get = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const token = get('token');
  if (!token) {
    console.error(
      '缺少 --token。取得方式：呼叫 POST /api/admin/auth/login 後取 data.accessToken',
    );
    process.exit(1);
  }

  return {
    url: get('url') ?? 'http://127.0.0.1:3000',
    token,
    room: get('room'),
    clients: Number(get('clients') ?? '1'),
  };
};

/** 建立一條已掛好事件監聽的連線 */
const createClient = (options: Options, label: string): Socket => {
  const socket = io(`${options.url}/chat`, {
    transports: ['websocket'],
    // token 走 auth 而非 query：query 會進伺服器日誌與 Referer header
    auth: { token: options.token },
    reconnection: false,
  });

  socket.on('connect', () =>
    console.log(`[${label}] 已連線 socketId=${socket.id}`),
  );
  socket.on('connected', (payload: unknown) =>
    console.log(`[${label}] 認證通過`, payload),
  );
  socket.on('error', (payload: unknown) =>
    console.error(`[${label}] 錯誤`, payload),
  );
  socket.on('roomJoined', (p: unknown) =>
    console.log(`[${label}] 已加入群組`, p),
  );
  socket.on('roomLeft', (p: unknown) =>
    console.log(`[${label}] 已離開群組`, p),
  );
  socket.on('disconnect', (reason: string) =>
    console.log(`[${label}] 斷線：${reason}`),
  );

  // 監看所有伺服器送來的事件——M2 之後會有新事件，不必回頭改這支腳本
  socket.onAny((event: string, ...args: unknown[]) => {
    if (
      ['connect', 'connected', 'error', 'roomJoined', 'roomLeft'].includes(
        event,
      )
    ) {
      return;
    }
    console.log(`[${label}] 事件 ${event}`, ...args);
  });

  return socket;
};

const main = (): void => {
  const options = parseArgs(process.argv.slice(2));
  const sockets = Array.from({ length: options.clients }, (_, i) =>
    createClient(options, `client-${i + 1}`),
  );

  if (options.room) {
    sockets.forEach((s) =>
      s.on('connected', () => s.emit('joinRoom', { roomId: options.room })),
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', (line) => {
    const [command, arg] = line.trim().split(/\s+/);
    switch (command) {
      case 'join':
        sockets.forEach((s) => s.emit('joinRoom', { roomId: arg }));
        break;
      case 'leave':
        sockets.forEach((s) => s.emit('leaveRoom', { roomId: arg }));
        break;
      case 'ping':
        sockets.forEach((s, i) =>
          s.emit('ping', (reply: string) =>
            console.log(`[client-${i + 1}] ping → ${reply}`),
          ),
        );
        break;
      case 'drop':
        sockets.forEach((s) => s.disconnect());
        break;
      case 'quit':
        sockets.forEach((s) => s.disconnect());
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('可用指令：join <id> / leave <id> / ping / drop / quit');
    }
  });

  console.log(
    `連線中… ${options.url}/chat（${options.clients} 條）。輸入指令或 quit 結束。`,
  );
};

main();
