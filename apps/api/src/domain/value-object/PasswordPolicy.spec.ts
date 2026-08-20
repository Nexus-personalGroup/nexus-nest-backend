import { PasswordPolicy } from './PasswordPolicy';

describe('PasswordPolicy', () => {
  describe('等級 0（僅檢查長度）', () => {
    const policy = new PasswordPolicy({
      minLength: 8,
      maxLength: 32,
      complexityLevel: 0,
    });

    it('符合長度 → valid', () => {
      expect(policy.validate('abcdefgh').valid).toBe(true);
    });

    it('太短 → invalid', () => {
      const result = policy.validate('abc');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼長度不得少於 8 個字元');
    });

    it('太長 → invalid', () => {
      const result = policy.validate('a'.repeat(33));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼長度不得超過 32 個字元');
    });
  });

  describe('等級 1（英文字母 + 數字）', () => {
    const policy = new PasswordPolicy({
      minLength: 8,
      maxLength: 32,
      complexityLevel: 1,
    });

    it('包含字母與數字 → valid', () => {
      expect(policy.validate('abcdefg1').valid).toBe(true);
    });

    it('純數字，無字母 → invalid', () => {
      const result = policy.validate('12345678');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼須包含至少一個英文字母');
    });

    it('無數字 → invalid', () => {
      const result = policy.validate('abcdefgh');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼須包含至少一個數字');
    });
  });

  describe('等級 2（大寫 + 小寫 + 數字）', () => {
    const policy = new PasswordPolicy({
      minLength: 8,
      maxLength: 32,
      complexityLevel: 2,
    });

    it('符合所有規則 → valid', () => {
      expect(policy.validate('Abcdefg1').valid).toBe(true);
    });

    it('缺少大寫 → invalid', () => {
      const result = policy.validate('abcdefg1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼須包含至少一個大寫英文字母');
    });

    it('缺少小寫 → invalid', () => {
      const result = policy.validate('ABCDEFG1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼須包含至少一個小寫英文字母');
    });

    it('缺少數字 → invalid', () => {
      const result = policy.validate('Abcdefgh');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼須包含至少一個數字');
    });
  });

  describe('等級 3（+ 特殊符號）', () => {
    const policy = new PasswordPolicy({
      minLength: 8,
      maxLength: 32,
      complexityLevel: 3,
    });

    it('符合所有規則 → valid', () => {
      expect(policy.validate('Abcdef1!').valid).toBe(true);
    });

    it('缺少特殊符號 → invalid', () => {
      const result = policy.validate('Abcdefg1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('密碼須包含至少一個特殊符號');
    });
  });

  describe('等級 4（+ 禁止常見弱密碼字串）', () => {
    const policy = new PasswordPolicy({
      minLength: 8,
      maxLength: 32,
      complexityLevel: 4,
    });

    it('強密碼 → valid', () => {
      expect(policy.validate('Xy!9zKm#').valid).toBe(true);
    });

    it('包含 "password" → invalid', () => {
      const result = policy.validate('Password1!');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('password');
    });

    it('包含 "123456" → invalid', () => {
      const result = policy.validate('Aa!123456b');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('123456');
    });
  });

  it('邊界值：剛好等於 minLength → valid', () => {
    const policy = new PasswordPolicy({
      minLength: 4,
      maxLength: 32,
      complexityLevel: 0,
    });
    expect(policy.validate('abcd').valid).toBe(true);
  });

  it('邊界值：剛好等於 maxLength → valid', () => {
    const policy = new PasswordPolicy({
      minLength: 4,
      maxLength: 8,
      complexityLevel: 0,
    });
    expect(policy.validate('abcdefgh').valid).toBe(true);
  });
});
