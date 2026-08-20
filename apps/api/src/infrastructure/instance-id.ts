import { randomUUID } from 'crypto';

export const INSTANCE_ID = 'INSTANCE_ID';

/**
 * 本應用實例的識別碼
 *
 * **以 provider 提供而非 module 層級常數**：常數在同一個 Node process 內是共用的，
 * 而整合測試正是要在一個 process 裡起兩個實例來驗證跨實例行為——共用常數會讓
 * 兩個實例自稱同一個 ID，presence 因此把兩條連線算成一條。
 * 正式環境一個 process 一個實例，兩種寫法的結果相同，但只有這種寫法測得到。
 *
 * **不能用 hostname**：同一台主機跑多個實例（本機多埠、容器共用 network namespace）
 * 會撞名，症狀是「presence 少算」——沒有錯誤訊息，只是數字不對。
 * 也不用 PID：容器重啟後 PID 可能重複，舊實例殘留的紀錄會被誤認為新實例的。
 */
export const instanceIdProvider = {
  provide: INSTANCE_ID,
  useFactory: (): string => randomUUID(),
};
