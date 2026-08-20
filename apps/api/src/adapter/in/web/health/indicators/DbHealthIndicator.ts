import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';

/**
 * 資料庫健康探測：以最輕量的 `SELECT 1` 確認 Prisma 連線可用。
 */
@Injectable()
export class DbHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 探測資料庫連線
   * @param key - 健康檢查結果中的鍵名
   * @returns up（連線正常）或 down（連線失敗，附錯誤訊息）
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : '資料庫連線失敗';
      return indicator.down({ message });
    }
  }
}
