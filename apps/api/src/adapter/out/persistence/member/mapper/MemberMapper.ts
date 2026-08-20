import { Prisma } from '@prisma/client';
import { Member } from '@app/domain/model/Member';
import { MemberRecordDto } from '@app/application/port/out/member/LoadMemberPort';
import { MemberContextData } from '@app/application/port/out/member/LoadMemberContextPort';

// 與 PrismaMemberRepository 各 query 對應的 row 形狀；用 GetPayload 從 include 反推型別，避免重複定義
type MemberRow = Prisma.MemberRecordGetPayload<true>;
type MemberRowWithRoleName = Prisma.MemberRecordGetPayload<{
  include: { role: { select: { name: true } } };
}>;
type MemberRowWithRoleSummary = Prisma.MemberRecordGetPayload<{
  include: { role: { select: { id: true; name: true } } };
}>;
type MemberRowWithRolePermissions = Prisma.MemberRecordGetPayload<{
  include: {
    role: {
      include: {
        permissions: {
          include: { permission: true };
        };
      };
    };
  };
}>;

/**
 * MemberRecord (Prisma row) ↔ domain / DTO 轉換。
 *
 * 各方法搭配不同的 include 形狀使用，呼叫端的 query 與 mapper 入參型別需對齊。
 */
export const MemberMapper = {
  /** 純 row → domain Member（無 roleName） */
  toDomain(row: MemberRow): Member {
    return Member.reconstitute(
      row.id,
      row.email,
      row.member,
      row.password,
      row.roleId,
      row.status,
      row.isDefault,
      row.createdAt,
      '',
      row.tokenVersion ?? 0,
    );
  },

  /** row + role.name → domain Member（含 roleName，login 場景用） */
  toDomainWithRoleName(row: MemberRowWithRoleName): Member {
    return Member.reconstitute(
      row.id,
      row.email,
      row.member,
      row.password,
      row.roleId,
      row.status,
      row.isDefault,
      row.createdAt,
      row.role.name,
      row.tokenVersion ?? 0,
    );
  },

  /** row + role summary → 顯示用 DTO（不含 password） */
  toRecordDto(row: MemberRowWithRoleSummary): MemberRecordDto {
    return {
      id: row.id,
      email: row.email,
      member: row.member,
      roleId: row.roleId,
      roleName: row.role.name,
      status: row.status,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastLoginAt: row.lastLoginAt,
    };
  },

  /** row + role.permissions → Guard 用的 context */
  toContextData(row: MemberRowWithRolePermissions): MemberContextData {
    return {
      id: row.id,
      email: row.email,
      roleName: row.role.name,
      roleCode: row.role.roleCode ?? '',
      permissions: row.role.permissions.map(
        (rp) => rp.permission.permissionCode,
      ),
      status: row.status,
      tokenVersion: row.tokenVersion ?? 0,
      lastPasswordChange: row.lastPasswordChange,
    };
  },
};
