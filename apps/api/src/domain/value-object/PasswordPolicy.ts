/**
 * 常見弱密碼字串清單（複雜度等級 4 時使用）
 */
const COMMON_WEAK_STRINGS = [
  'password',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'letmein',
  'admin',
  'welcome',
  'monkey',
  'master',
  'dragon',
  'login',
  'princess',
  'football',
  'shadow',
  'sunshine',
  'trustno1',
  'iloveyou',
];

export interface PasswordPolicyConfig {
  minLength: number;
  maxLength: number;
  /** 0=length only, 1=letter+digit, 2=upper+lower+digit, 3=+symbol, 4=+no weak strings */
  complexityLevel: 0 | 1 | 2 | 3 | 4;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export class PasswordPolicy {
  constructor(private readonly config: PasswordPolicyConfig) {}

  validate(password: string): PasswordValidationResult {
    const errors: string[] = [];
    if (password.length < this.config.minLength)
      errors.push(`密碼長度不得少於 ${this.config.minLength} 個字元`);
    if (password.length > this.config.maxLength)
      errors.push(`密碼長度不得超過 ${this.config.maxLength} 個字元`);
    if (this.config.complexityLevel >= 1) {
      if (!/[a-zA-Z]/.test(password)) errors.push('密碼須包含至少一個英文字母');
      if (!/\d/.test(password)) errors.push('密碼須包含至少一個數字');
    }
    if (this.config.complexityLevel >= 2) {
      if (!/[a-z]/.test(password))
        errors.push('密碼須包含至少一個小寫英文字母');
      if (!/[A-Z]/.test(password))
        errors.push('密碼須包含至少一個大寫英文字母');
    }
    if (this.config.complexityLevel >= 3) {
      if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password))
        errors.push('密碼須包含至少一個特殊符號');
    }
    if (this.config.complexityLevel >= 4) {
      const lower = password.toLowerCase();
      for (const weak of COMMON_WEAK_STRINGS) {
        if (lower.includes(weak)) {
          errors.push(`密碼不可包含常見字串「${weak}」`);
          break;
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }
}
