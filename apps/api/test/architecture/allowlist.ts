/**
 * 架構守則的豁免清單。
 *
 * 分兩類：`PERMANENT` 是設計上合理、不打算修的；`TEMPORARY` 必須綁定負責清除的 change，
 * 修掉之後要連同這裡的項目一起刪。各規則的「過期豁免」檢查會確認每筆豁免在原始碼中
 * 確實仍然存在 —— 沒有這道檢查，白名單只會單向膨脹成一份無人維護的例外清冊。
 */

/** 豁免項目：以「檔案 + 該行必含字串」定位，同檔多處相同違規可共用一筆 */
export type Exemption = {
  /** 相對 apps/api 的檔案路徑 */
  file: string;
  /** 違規行必須包含的字串 */
  snippet: string;
  /** 豁免理由 */
  reason: string;
};

/** 暫時豁免：額外要求指名負責清除它的 change */
export type TemporaryExemption = Exemption & {
  /** 負責清除這筆豁免的 change 名稱 */
  owner: string;
};

/**
 * `throw new Error` 的永久豁免。
 *
 * 共通理由：這些位置代表「程式或環境設定錯誤」而非業務錯誤 —— 不該在正常流程中發生，
 * 回應 500 的語意正確，包裝成 domain exception 反而會誤導成可預期的業務失敗。
 */
export const PERMANENT_NATIVE_ERROR: Exemption[] = [
  {
    file: 'src/adapter/out/mail/NodemailerEmailAdapter.ts',
    snippet: 'SMTP 未初始化',
    reason: 'SMTP 連線未建立屬環境設定錯誤，非業務可預期失敗',
  },
  {
    file: 'src/adapter/out/storage/S3FileStorageAdapter.ts',
    snippet: 'S3 Client 未初始化',
    reason: 'S3 client 未建立屬環境設定錯誤，非業務可預期失敗',
  },
  {
    file: 'src/adapter/out/firebase/FirebaseNotificationAdapter.ts',
    snippet: 'Firebase Admin 未初始化',
    reason: 'Firebase Admin 未建立屬環境設定錯誤，非業務可預期失敗',
  },
  {
    file: 'src/adapter/in/web/decorator/current-member.decorator.ts',
    snippet: 'MemberContext 未設定',
    reason:
      '取不到 MemberContext 代表該路由漏掛 JwtAuthGuard，屬開發期程式錯誤',
  },
  {
    file: 'src/adapter/in/web/decorator/current-user.decorator.ts',
    snippet: 'UserContext 未設定',
    reason:
      '取不到 UserContext 代表該路由漏掛 FrontJwtAuthGuard，屬開發期程式錯誤（同 current-member）',
  },
];

/**
 * `throw new Error` 的暫時豁免。
 *
 * 目前為空：原本的 domain 層 3 筆（涵蓋 4 處）已由 `refactor-response-message-catalog`
 * 改為 domain exception，豁免隨之移除。
 */
export const TEMPORARY_NATIVE_ERROR: TemporaryExemption[] = [];

/** `throw new Error` 的完整豁免清單 */
export const NATIVE_ERROR_EXEMPTIONS: Exemption[] = [
  ...PERMANENT_NATIVE_ERROR,
  ...TEMPORARY_NATIVE_ERROR,
];

/**
 * 未宣告於 `envSchema` 的環境變數豁免。
 *
 * 目前為空：原本唯一一筆 `ALLOW_PROD_SEED` 已補進 envSchema。
 */
export const TEMPORARY_ENV: TemporaryExemption[] = [];

/** 豁免的環境變數名稱 */
export const ENV_EXEMPT_NAMES: string[] = TEMPORARY_ENV.map(
  (item) => item.snippet,
);

/**
 * 刻意不納入 swagger 文件的路由。
 *
 * 格式為 `METHOD /path`（path 已正規化，`:param` 寫成 `{param}`）。
 * 這裡的豁免同樣受過期檢查約束：路由若已從 controller 移除，測試會要求清掉這筆。
 */
export const SWAGGER_EXEMPT_ROUTES: Array<{ route: string; reason: string }> = [
  {
    route: 'GET /api/health',
    reason: '監控與存活探測用途，不屬對外 API 契約',
  },
  {
    route: 'GET /api/health/ready',
    reason: '就緒探測用途，不屬對外 API 契約',
  },
];

/**
 * WS 事件資源存取的豁免。
 *
 * 這份清單的門檻要高於其他規則：能列進來的只有「該操作對非成員也無害」，
 * 不包含「暫時還沒接授權」——後者是 TEMPORARY 的用途，而目前沒有。
 */
/**
 * `app.use()` 掛載的原生 Express 路徑。
 *
 * 這些**完全不經過 Nest 的 guard**——掛載處看起來只是「提供文件 / 靜態檔」，
 * 而 guard 那邊看起來「所有路由都保護了」，兩邊各自都對，
 * 合起來有一條沒有人看守的路。
 */
export const PUBLIC_MOUNT_EXEMPTIONS: Array<{
  path: string;
  reason: string;
}> = [
  {
    path: '`${basePath}/docs-json`',
    reason:
      'OpenAPI spec（admin 與 front 各一）。掛載由 SWAGGER_ENABLED 控制，production 預設關閉',
  },
  {
    path: '`${basePath}/docs`',
    reason:
      'Swagger UI（admin 與 front 各一）。掛載由 SWAGGER_ENABLED 控制，production 預設關閉',
  },
  {
    path: 'env.LOCAL_MEDIA_BASE_URL',
    reason:
      'STORAGE_DRIVER=local 時服務上傳目錄，帶 nosniff + 嚴格 CSP；檔名為 UUID，不可列舉',
  },
];

/**
 * 允許使用 presence 掃描 pattern 的**方法**。
 *
 * 以方法為單位而非檔案：presence 的 adapter 同時擁有清理與查詢兩種方法，
 * 以檔案為單位會讓「查詢方法拿去掃描」這種錯直接漏掉——
 * 而那正是 `countOnlineMembers` 曾經犯過的錯。
 */
export const PRESENCE_SCAN_EXEMPTIONS: Array<{
  method: string;
  reason: string;
}> = [
  {
    method: 'sweepStale',
    reason:
      '週期性清理陳舊連線紀錄，並順手校正在線索引；由排程觸發，不在請求路徑上',
  },
];

export const WS_RESOURCE_ACCESS_EXEMPTIONS: Exemption[] = [
  {
    file: 'src/adapter/in/ws/ChatGateway.ts',
    snippet: 'client.leave(payload.roomId)',
    reason:
      '離開只影響本條連線，對未加入的 socket room 執行是無害的無操作；驗證成員資格反而會讓「已被移出房間的人無法離開」',
  },
];

/**
 * WS 事件限流的豁免。
 *
 * 以 handler 名稱定位（`snippet` 放 handler 名）。能列進來的只有「本身不做寫入、
 * 且成本受既有機制約束」的事件——「暫時還沒接」不屬於這裡，那會讓豁免變成待辦清單。
 */
export const WS_RATE_LIMIT_EXEMPTIONS: Exemption[] = [
  {
    file: 'src/adapter/in/ws/ChatGateway.ts',
    snippet: 'handleSyncRoom',
    reason: '唯讀且成本有界（單次索引範圍查詢、上限 101 列），不寫入任何資料',
  },
  {
    file: 'src/adapter/in/ws/ChatGateway.ts',
    snippet: 'handleJoinRoom',
    reason:
      '只做一次有索引的成員資格查詢、不寫入；重複加入同一個 socket room 是無操作，且單一成員的連線數已受 WS_MAX_CONNECTIONS_PER_MEMBER 約束',
  },
];

/**
 * 訊息表存取的豁免。
 *
 * 目前為空。M3 的檢舉調查會需要一條**看得到被撤回內容**的後台路徑——那筆豁免
 * 必須註明「僅限後台、需 RBAC 授權、且必須留稽核紀錄」，而不是放寬規則本身。
 */
export const CHAT_MESSAGE_ACCESS_EXEMPTIONS: Exemption[] = [];
