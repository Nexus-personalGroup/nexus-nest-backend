import { Injectable, OnModuleInit } from '@nestjs/common';
import { getEnv } from '../../../infrastructure/validate-env';

export type FeatureFlagName =
  | 'adminRoleEnabled'
  | 'authLogEnabled'
  | 'ipWhitelistEnabled'
  | 'ipBlacklistEnabled'
  | 'accountLockEnabled'
  | 'passwordChangeEnabled'
  | 'sessionIdleEnabled'
  | 'googleRecaptchaEnabled'
  | 'apiLogEnabled'
  | 'operationLogEnabled';

/**
 * 功能開關服務：從環境變數讀取功能啟用狀態。
 * 各 Guard / Service 透過 isEnabled() 判斷功能是否啟用。
 *
 * 注意：此服務只管「runtime flag」（onModuleInit 後才備妥）。
 * Sentry / Prometheus 屬「bootstrap-time flag」——須在 module 裝飾器求值與
 * instrument.ts（app 建立前）就決定，時序上無法走本服務，故直接讀 getEnv()，
 * 不在此 union 內，這是刻意分離而非遺漏。
 */
@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private flags: Record<FeatureFlagName, boolean> = {} as Record<
    FeatureFlagName,
    boolean
  >;

  onModuleInit(): void {
    const env = getEnv();
    this.flags = {
      adminRoleEnabled: env.APPLICATION_ADMIN_ROLE_ENABLED,
      authLogEnabled: env.APPLICATION_AUTH_LOG_ENABLED,
      ipWhitelistEnabled: env.APPLICATION_IP_WHITELIST_ENABLED,
      ipBlacklistEnabled: env.APPLICATION_IP_BLACKLIST_ENABLED,
      accountLockEnabled: env.APPLICATION_ACCOUNT_LOCK_ENABLED,
      passwordChangeEnabled: env.APPLICATION_PASSWORD_CHANGE_ENABLED,
      sessionIdleEnabled: env.APPLICATION_SESSION_IDLE_ENABLED,
      googleRecaptchaEnabled: env.APPLICATION_GOOGLE_RECAPTCHA_ENABLED,
      apiLogEnabled: env.APPLICATION_API_LOG_ENABLED,
      operationLogEnabled: env.APPLICATION_OPERATION_LOG_ENABLED,
    };
  }

  /**
   * 檢查指定功能是否啟用
   * @param flag - 功能名稱
   * @returns 是否啟用
   */
  isEnabled(flag: FeatureFlagName): boolean {
    return this.flags[flag] ?? false;
  }
}
