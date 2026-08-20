import { Email } from './Email';
import { InvalidEmailException } from '../exception/InvalidEmailException';

describe('Email', () => {
  it('有效 email → 建立成功', () => {
    expect(() => Email.of('test@example.com')).not.toThrow();
  });

  it('toString() → 回傳原始值', () => {
    expect(Email.of('user@domain.org').toString()).toBe('user@domain.org');
  });

  it('無效 email → 拋出 InvalidEmailException，訊息不含原始值', () => {
    expect(() => Email.of('not-an-email')).toThrow(InvalidEmailException);
    expect(() => Email.of('not-an-email')).toThrow('Email 格式不正確');
    expect(() => Email.of('not-an-email')).not.toThrow('not-an-email');
  });

  it.each(['@example.com', 'user@', 'user@@example.com'])(
    '無效格式 %s → 拋出 InvalidEmailException',
    (invalid) => {
      expect(() => Email.of(invalid)).toThrow(InvalidEmailException);
    },
  );

  it('無效 email → kind 為 INVALID（對應 400 而非 500）', () => {
    expect(() => Email.of('bad')).toThrow(
      expect.objectContaining({ kind: 'INVALID' }),
    );
  });

  it('trusted() → 不驗證格式，供 DB 還原使用', () => {
    expect(() => Email.trusted('not-an-email')).not.toThrow();
    expect(Email.trusted('not-an-email').toString()).toBe('not-an-email');
  });

  it('空字串 → 拋出 InvalidEmailException', () => {
    expect(() => Email.of('')).toThrow(InvalidEmailException);
  });

  it('equals() → 相同 email 回傳 true', () => {
    expect(Email.of('a@b.com').equals(Email.of('a@b.com'))).toBe(true);
  });

  it('equals() → 不同 email 回傳 false', () => {
    expect(Email.of('a@b.com').equals(Email.of('c@d.com'))).toBe(false);
  });
});
