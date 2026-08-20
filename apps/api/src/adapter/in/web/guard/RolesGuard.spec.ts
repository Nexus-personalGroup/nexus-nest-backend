import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './RolesGuard';
import { RoleCode } from '@app/domain/value-object/Role';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';

const makeContext = (roleCode: string): ExecutionContext => {
  const request = { member: { roleCode } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
};

const mockFeatureFlags = {
  isEnabled: jest.fn().mockReturnValue(true),
  onModuleInit: jest.fn(),
};

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    mockFeatureFlags.isEnabled.mockReturnValue(true);
    guard = new RolesGuard(
      reflector,
      mockFeatureFlags as unknown as FeatureFlagService,
    );
  });

  it('無 @Roles 裝飾（undefined）→ 放行', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext('USER'))).toBe(true);
  });

  it('空 roles 陣列 → 放行', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(makeContext('USER'))).toBe(true);
  });

  it('使用者 roleCode 符合要求 → 放行', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleCode.SUPERADMIN]);
    expect(guard.canActivate(makeContext(RoleCode.SUPERADMIN))).toBe(true);
  });

  it('使用者 roleCode 不符合要求 → ForbiddenException', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleCode.SUPERADMIN]);
    expect(() => guard.canActivate(makeContext('USER'))).toThrow(
      ForbiddenException,
    );
  });

  it('member 為 undefined → ForbiddenException', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleCode.SUPERADMIN]);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ member: undefined }) }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
