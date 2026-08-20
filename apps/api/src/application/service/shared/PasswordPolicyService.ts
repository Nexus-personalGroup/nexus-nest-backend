import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import {
  PasswordPolicy,
  PasswordPolicyConfig,
} from '../../../domain/value-object/PasswordPolicy';
import { getEnv } from '../../../infrastructure/validate-env';
import { RoleCode } from '../../../domain/value-object/Role';

// 高複雜度密碼策略適用的 roleCode 清單
// 用 ReadonlySet<string> 允許未驗證過的 roleCode 字串直接查詢，避免呼叫端再 `as RoleCode`
const HIGH_COMPLEXITY_ROLE_CODES: ReadonlySet<string> = new Set([
  RoleCode.SUPERADMIN,
]);

/**
 * 密碼策略服務：依 roleCode 套用對應複雜度
 *
 * roleCode 屬於 HIGH_COMPLEXITY_ROLE_CODES 時走 systemAdminPolicy，否則走 otherAdminPolicy
 */
@Injectable()
export class PasswordPolicyService implements OnModuleInit {
  private systemAdminPolicy!: PasswordPolicy;
  private otherAdminPolicy!: PasswordPolicy;
  private baseConfig!: Pick<PasswordPolicyConfig, 'minLength' | 'maxLength'>;

  onModuleInit(): void {
    const env = getEnv();
    this.baseConfig = {
      minLength: env.APPLICATION_PASSWORD_MIN_LENGTH,
      maxLength: env.APPLICATION_PASSWORD_MAX_LENGTH,
    };
    this.systemAdminPolicy = new PasswordPolicy({
      ...this.baseConfig,
      complexityLevel: env.APPLICATION_SYSTEM_ADMIN_PASSWORD_COMPLEXITY,
    });
    this.otherAdminPolicy = new PasswordPolicy({
      ...this.baseConfig,
      complexityLevel: env.APPLICATION_OTHER_ADMIN_PASSWORD_COMPLEXITY,
    });
  }

  /**
   * 驗證密碼是否符合策略，不符合則拋出 BadRequestException
   * @param password - 待驗證密碼
   * @param roleCode - 省略時走一般策略
   */
  validateOrThrow(password: string, roleCode?: string | null): void {
    const policy =
      roleCode && HIGH_COMPLEXITY_ROLE_CODES.has(roleCode)
        ? this.systemAdminPolicy
        : this.otherAdminPolicy;
    const result = policy.validate(password);
    if (!result.valid) {
      throw new BadRequestException({
        message: '密碼不符合安全策略',
        errors: result.errors,
      });
    }
  }

  get minLength(): number {
    return this.baseConfig.minLength;
  }

  get maxLength(): number {
    return this.baseConfig.maxLength;
  }
}
