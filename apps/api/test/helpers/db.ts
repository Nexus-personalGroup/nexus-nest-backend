import bcrypt from 'bcrypt';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { parsePermissionCode } from '@app/shared/constants/permissions';

/**
 * 依外鍵順序清空所有表（e2e 每個 test 前重置，確保隔離）。
 * 子表（join / 參照）先刪，父表（Role / Permission）後刪。
 */
export const resetDb = async (prisma: PrismaService): Promise<void> => {
  await prisma.rolePermission.deleteMany();
  await prisma.memberRecord.deleteMany();
  await prisma.authLogRecord.deleteMany();
  await prisma.passwordResetTokenRecord.deleteMany();
  await prisma.systemLogRecord.deleteMany();
  await prisma.ipWhitelistRecord.deleteMany();
  await prisma.ipBlacklistRecord.deleteMany();
  await prisma.attachmentRecord.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
};

/** 依 permissionCode 確保 Permission 存在（upsert），回傳其 id 陣列 */
export const ensurePermissions = async (
  prisma: PrismaService,
  codes: string[],
): Promise<string[]> => {
  const ids: string[] = [];
  for (const code of codes) {
    const { platform, module, subModule, action } = parsePermissionCode(code);
    const perm = await prisma.permission.upsert({
      where: { permissionCode: code },
      create: {
        permissionCode: code,
        name: code,
        platform,
        module,
        subModule,
        action,
      },
      update: {},
    });
    ids.push(perm.id);
  }
  return ids;
};

export interface SeededMember {
  memberId: string;
  roleId: string;
}

/**
 * 建立一個可登入的後台會員:權限（upsert）+ Role（綁權限）+ Member（bcrypt 密碼）。
 * @returns 新建的 memberId / roleId
 */
export const seedMember = async (
  prisma: PrismaService,
  opts: {
    email: string;
    password: string;
    status?: boolean;
    roleName?: string;
    roleCode?: string;
    permissionCodes?: string[];
    /** 排序測試用：顯式指定建立時間，避免連續 insert 落在同一毫秒 */
    createdAt?: Date;
  },
): Promise<SeededMember> => {
  const permIds = await ensurePermissions(
    prisma,
    opts.permissionCodes ?? ['BACKEND:ACCOUNT:VIEW'],
  );
  const role = await prisma.role.create({
    data: {
      name: opts.roleName ?? 'member',
      roleCode: opts.roleCode,
      status: true,
      isDefault: false,
      permissions: { create: permIds.map((id) => ({ permissionId: id })) },
    },
  });
  const member = await prisma.memberRecord.create({
    data: {
      member: 'Test User',
      email: opts.email,
      password: await bcrypt.hash(opts.password, 1),
      roleId: role.id,
      status: opts.status ?? true,
      isDefault: false,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
  return { memberId: member.id, roleId: role.id };
};

/**
 * 建立一個 Role（可帶權限），回傳 roleId。
 */
export const seedRole = async (
  prisma: PrismaService,
  opts: {
    name: string;
    isDefault?: boolean;
    status?: boolean;
    roleCode?: string;
    permissionCodes?: string[];
    /** 排序測試用：顯式指定建立時間 */
    createdAt?: Date;
  },
): Promise<string> => {
  const permIds = await ensurePermissions(prisma, opts.permissionCodes ?? []);
  const role = await prisma.role.create({
    data: {
      name: opts.name,
      roleCode: opts.roleCode,
      isDefault: opts.isDefault ?? false,
      status: opts.status ?? true,
      permissions: { create: permIds.map((id) => ({ permissionId: id })) },
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
  return role.id;
};
