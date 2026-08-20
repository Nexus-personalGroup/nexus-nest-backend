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
