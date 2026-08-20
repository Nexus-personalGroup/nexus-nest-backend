import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  PermissionRecord,
  PermissionRepositoryPort,
} from '@app/application/port/out/role/PermissionRepositoryPort';

@Injectable()
export class PrismaPermissionRepository implements PermissionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PermissionRecord[]> {
    const perms = await this.prisma.permission.findMany({
      where: { status: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    return perms.map((p) => this.toRecord(p));
  }

  async findByCodes(codes: string[]): Promise<PermissionRecord[]> {
    const perms = await this.prisma.permission.findMany({
      where: { permissionCode: { in: codes }, status: true },
    });
    return perms.map((p) => this.toRecord(p));
  }

  async getPermissionsByRoleId(roleId: string): Promise<string[]> {
    // 授權熱路徑：只取 permissionCode，不用 include 撈整列 permission
    const rolePerms = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { permissionCode: true } } },
    });
    return rolePerms.map((rp) => rp.permission.permissionCode);
  }

  async replacePermissions(roleId: string, codes: string[]): Promise<void> {
    // 用 interactive transaction 把「查 permission id」一併納入交易，
    // 避免先查後寫的競態（並發改同一 role 權限時讀到交易外的舊快照）
    await this.prisma.$transaction(async (tx) => {
      const permissions = await tx.permission.findMany({
        where: { permissionCode: { in: codes } },
        select: { id: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      });
    });
  }

  private toRecord(p: {
    permissionCode: string;
    name: string;
    platform: string;
    module: string;
    action: string;
  }): PermissionRecord {
    return {
      permissionCode: p.permissionCode,
      name: p.name,
      platform: p.platform,
      module: p.module,
      action: p.action,
    };
  }
}
