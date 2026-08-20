import { MemberId } from './MemberId';
import { InvalidMemberIdException } from '../exception/InvalidMemberIdException';

describe('MemberId', () => {
  const VALID = '11111111-1111-4111-8111-111111111111';

  it('有效 UUID → 建立成功', () => {
    expect(MemberId.of(VALID).toString()).toBe(VALID);
  });

  it('generate() → 產生合法 UUID，可被 of() 接受', () => {
    expect(() => MemberId.of(MemberId.generate().toString())).not.toThrow();
  });

  it('無效格式 → 拋出 InvalidMemberIdException', () => {
    expect(() => MemberId.of('not-a-uuid')).toThrow(InvalidMemberIdException);
  });

  it('無效格式 → kind 為 INVALID（對應 400 而非 500）', () => {
    expect(() => MemberId.of('not-a-uuid')).toThrow(
      expect.objectContaining({ kind: 'INVALID' }),
    );
  });

  it('錯誤訊息不含原始輸入值', () => {
    expect(() => MemberId.of('secret-value')).not.toThrow('secret-value');
  });

  it('trusted() → 不驗證格式，供 DB 還原使用', () => {
    expect(() => MemberId.trusted('not-a-uuid')).not.toThrow();
    expect(MemberId.trusted('not-a-uuid').toString()).toBe('not-a-uuid');
  });

  it('equals() → 值相同為 true', () => {
    expect(MemberId.of(VALID).equals(MemberId.of(VALID))).toBe(true);
  });
});
