import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import {
  IP_LIST_PORT,
  IpListPort,
} from '@app/application/port/out/security/IpListPort';

/**
 * 啟動時檢查「IP 白名單已啟用但清單為空」，命中時記一筆 error。
 *
 * 這個狀態**沒有徵兆也沒有出口**：guard 是 fail-closed，所以每一個請求都 403
 * ——包含能新增白名單的後台頁面本身。服務看起來是活的
 * （健康檢查與指標端點已豁免），但對使用者完全不可用。
 *
 * 用 error 而非 warn：這個狀態下服務對使用者是完全不可用的，
 * 不是「有點怪但還能跑」。
 *
 * ⚠️ **只在啟動時查一次**——這是設定錯誤，不是執行期狀態。
 * 每個請求都查一次清單長度只增加負擔不增加資訊。
 * 代價是執行期刪掉最後一筆不會產生新的日誌，這一點是知情的取捨。
 */
@Injectable()
export class IpWhitelistBootstrapCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(IpWhitelistBootstrapCheck.name);

  constructor(
    private readonly featureFlags: FeatureFlagService,
    @Inject(IP_LIST_PORT) private readonly ipList: IpListPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // 功能關閉時連查都不查：清單為空是完全正常的狀態
    if (!this.featureFlags.isEnabled('ipWhitelistEnabled')) return;

    // 只要 total，取一筆就夠
    const { total } = await this.ipList.listWhitelist({ page: 1, limit: 1 });
    if (total > 0) return;

    this.logger.error(
      'IP 白名單已啟用，但白名單是空的——所有使用者流量都會被拒絕（403），' +
        '包含能新增白名單的後台頁面本身。' +
        '恢復方式：關閉 APPLICATION_IP_WHITELIST_ENABLED，' +
        '或用 `pnpm --filter @app/api ip:allow <IP>` 從命令列加入一筆。',
    );
  }
}
