import { SetMetadata } from '@nestjs/common';

/**
 * 標記為基礎設施探針：IP 黑白名單 Guard 讀到此 metadata 會跳過檢查。
 *
 * 判準是「**這是不是給機器用的端點**」（健康檢查、指標），
 * 不是「需不需要認證」——後者是 `@Public()` 的職責。
 * 兩者剛好都落在 HealthController 上是巧合，不是同一件事：
 * 登入端點也是 `@Public()`，而擋惡意來源打登入正是 IP 黑名單存在的理由。
 */
export const IS_INFRA_ENDPOINT_KEY = 'isInfraEndpoint';

export const InfraEndpoint = () => SetMetadata(IS_INFRA_ENDPOINT_KEY, true);
