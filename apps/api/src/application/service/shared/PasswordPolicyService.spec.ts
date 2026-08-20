import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './PasswordPolicyService';
import { RoleCode } from '../../../domain/value-object/Role';

jest.mock('../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    APPLICATION_PASSWORD_MIN_LENGTH: 8,
    APPLICATION_PASSWORD_MAX_LENGTH: 32,
    APPLICATION_SYSTEM_ADMIN_PASSWORD_COMPLEXITY: 4,
    APPLICATION_OTHER_ADMIN_PASSWORD_COMPLEXITY: 1,
  }),
}));

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;

  beforeEach(() => {
    service = new PasswordPolicyService();
    service.onModuleInit();
  });

  describe('SUPERADMIN 角色（複雜度 4）', () => {
    it('強密碼通過', () => {
      expect(() =>
        service.validateOrThrow('Xy!9zKm#', RoleCode.SUPERADMIN),
      ).not.toThrow();
    });

    it('包含常見字串 → BadRequestException', () => {
      expect(() =>
        service.validateOrThrow('Password1!', RoleCode.SUPERADMIN),
      ).toThrow(BadRequestException);
    });

    it('缺少特殊符號 → BadRequestException', () => {
      expect(() =>
        service.validateOrThrow('Abcdefg1', RoleCode.SUPERADMIN),
      ).toThrow(BadRequestException);
    });
  });

  describe('非 SUPERADMIN 角色（複雜度 1）', () => {
    it('包含字母與數字通過', () => {
      expect(() => service.validateOrThrow('abcdefg1')).not.toThrow();
    });

    it('純數字，無字母 → BadRequestException', () => {
      expect(() => service.validateOrThrow('12345678')).toThrow(
        BadRequestException,
      );
    });

    it('一般 role code（如 USER）走低複雜度', () => {
      expect(() => service.validateOrThrow('abcdefg1', 'USER')).not.toThrow();
    });
  });

  it('太短 → BadRequestException', () => {
    expect(() => service.validateOrThrow('Ab1!')).toThrow(BadRequestException);
  });

  it('minLength / maxLength 屬性', () => {
    expect(service.minLength).toBe(8);
    expect(service.maxLength).toBe(32);
  });
});
