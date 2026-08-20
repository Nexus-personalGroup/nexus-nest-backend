import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  IpBlacklistItem,
  IpListItem,
  IpListPort,
  ListIpParams,
  ListIpResult,
} from '@app/application/port/out/security/IpListPort';
import { IpListNotFoundException } from '@app/domain/exception/IpListNotFoundException';

/**
 * IP 黑白名單持久化 Adapter，查詢 ip_whitelist / ip_blacklist 表。
 */
@Injectable()
export class PrismaIpListRepository implements IpListPort {
  private readonly logger = new Logger(PrismaIpListRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async isWhitelisted(ip: string): Promise<boolean> {
    const record = await this.prisma.ipWhitelistRecord.findUnique({
      where: { ipAddress: ip },
      select: { id: true },
    });
    return record !== null;
  }

  async isBlacklisted(ip: string): Promise<boolean> {
    const record = await this.prisma.ipBlacklistRecord.findUnique({
      where: { ipAddress: ip },
      select: { id: true },
    });
    return record !== null;
  }

  async addToWhitelist(
    ip: string,
    description?: string,
    createdBy?: string,
  ): Promise<{ id: string }> {
    const record = await this.prisma.ipWhitelistRecord.upsert({
      where: { ipAddress: ip },
      update: { description, createdBy },
      create: { ipAddress: ip, description, createdBy },
      select: { id: true },
    });
    this.logger.log(`IP ${ip} 已加入白名單`);
    return record;
  }

  async addToBlacklist(
    ip: string,
    reason?: string,
    isAutoBlock = false,
    createdBy?: string,
  ): Promise<{ id: string }> {
    const record = await this.prisma.ipBlacklistRecord.upsert({
      where: { ipAddress: ip },
      update: { reason, isAutoBlock, createdBy },
      create: { ipAddress: ip, reason, isAutoBlock, createdBy },
      select: { id: true },
    });
    this.logger.log(`IP ${ip} 已加入黑名單（自動封鎖: ${isAutoBlock}）`);
    return record;
  }

  async removeWhitelist(id: string): Promise<void> {
    await this.prisma.ipWhitelistRecord.delete({ where: { id } }).catch(() => {
      // 不存在時靜默通過（與 member / role delete 行為一致；硬刪）
    });
  }

  async removeBlacklist(id: string): Promise<void> {
    await this.prisma.ipBlacklistRecord.delete({ where: { id } }).catch(() => {
      // 不存在時靜默通過（硬刪）
    });
  }

  async listWhitelist(params: ListIpParams): Promise<ListIpResult<IpListItem>> {
    const where = params.search
      ? { ipAddress: { contains: params.search } }
      : {};
    const [list, total] = await this.prisma.$transaction([
      this.prisma.ipWhitelistRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.ipWhitelistRecord.count({ where }),
    ]);
    return { list, total };
  }

  async listBlacklist(
    params: ListIpParams,
  ): Promise<ListIpResult<IpBlacklistItem>> {
    const where = params.search
      ? { ipAddress: { contains: params.search } }
      : {};
    const [list, total] = await this.prisma.$transaction([
      this.prisma.ipBlacklistRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.ipBlacklistRecord.count({ where }),
    ]);
    return { list, total };
  }

  async findWhitelistById(id: string): Promise<IpListItem | null> {
    return this.prisma.ipWhitelistRecord.findUnique({ where: { id } });
  }

  async findBlacklistById(id: string): Promise<IpBlacklistItem | null> {
    return this.prisma.ipBlacklistRecord.findUnique({ where: { id } });
  }

  async updateWhitelist(
    id: string,
    data: { description?: string },
  ): Promise<void> {
    try {
      await this.prisma.ipWhitelistRecord.update({ where: { id }, data });
    } catch (err) {
      // P2025 = record to update not found
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new IpListNotFoundException();
      }
      throw err;
    }
  }

  async updateBlacklist(id: string, data: { reason?: string }): Promise<void> {
    try {
      await this.prisma.ipBlacklistRecord.update({ where: { id }, data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new IpListNotFoundException();
      }
      throw err;
    }
  }
}
