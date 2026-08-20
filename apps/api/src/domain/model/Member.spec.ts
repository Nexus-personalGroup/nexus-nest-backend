import { Member } from './Member';
import { InvalidMemberNameException } from '../exception/InvalidMemberNameException';
import { Email } from '../value-object/Email';

const TEST_UUID_1 = '00000000-0000-0000-0000-000000000001';
const TEST_UUID_2 = '00000000-0000-0000-0000-000000000002';
const ROLE_UUID_1 = '00000000-0000-0000-0000-000000000010';
const ROLE_UUID_2 = '00000000-0000-0000-0000-000000000020';

describe('Member', () => {
  describe('create', () => {
    it('建立新成員，自動產生 id', () => {
      const member = Member.create(
        Email.of('user@example.com'),
        'Alan',
        'hashed_password',
        ROLE_UUID_1,
      );

      expect(member.email.toString()).toBe('user@example.com');
      expect(member.member).toBe('Alan');
      expect(member.password).toBe('hashed_password');
      expect(member.roleId).toBe(ROLE_UUID_1);
      expect(member.status).toBe(true);
      expect(member.isDefault).toBe(false);
      expect(member.id.toString()).toBeTruthy();
    });

    it('兩次 create 產生不同 id', () => {
      const a = Member.create(Email.of('a@b.com'), 'A', 'hash', ROLE_UUID_1);
      const b = Member.create(Email.of('a@b.com'), 'A', 'hash', ROLE_UUID_1);
      expect(a.id.toString()).not.toBe(b.id.toString());
    });
  });

  describe('reconstitute', () => {
    it('從持久層還原，保留指定 id', () => {
      const member = Member.reconstitute(
        TEST_UUID_1,
        'user@example.com',
        'Alan',
        'hash',
        ROLE_UUID_2,
        true,
        false,
        new Date(),
      );

      expect(member.id.toString()).toBe(TEST_UUID_1);
      expect(member.email.toString()).toBe('user@example.com');
      expect(member.roleId).toBe(ROLE_UUID_2);
      expect(member.status).toBe(true);
      expect(member.isDefault).toBe(false);
    });

    // reconstitute 走 MemberId.trusted / Email.trusted：DB 的值在寫入時已驗證，
    // 還原路徑重跑驗證會把「資料損毀」誤報成 400（客戶端輸入錯誤）。
    // 新輸入的格式驗證由 MemberId.of / Email.of 負責，見 MemberId.spec.ts。
    it('無效 UUID 格式 → 不重複驗證，直接還原', () => {
      expect(() =>
        Member.reconstitute(
          'not-a-uuid',
          'u@e.com',
          'Name',
          'hash',
          ROLE_UUID_1,
          true,
          false,
          new Date(),
        ),
      ).not.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('更新名稱與角色', () => {
      const member = Member.reconstitute(
        TEST_UUID_2,
        'u@e.com',
        'Old Name',
        'hash',
        ROLE_UUID_1,
        true,
        false,
        new Date(),
      );
      member.updateProfile('New Name', ROLE_UUID_2);
      expect(member.member).toBe('New Name');
      expect(member.roleId).toBe(ROLE_UUID_2);
    });
  });

  describe('activate / deactivate', () => {
    it('停用後再啟用', () => {
      const member = Member.reconstitute(
        TEST_UUID_1,
        'u@e.com',
        'Name',
        'hash',
        ROLE_UUID_1,
        true,
        false,
        new Date(),
      );
      member.deactivate();
      expect(member.status).toBe(false);
      member.activate();
      expect(member.status).toBe(true);
    });
  });

  describe('名稱驗證', () => {
    it('create 空白名稱 → 拋出 InvalidMemberNameException', () => {
      expect(() =>
        Member.create(Email.of('u@e.com'), '   ', 'hash', ROLE_UUID_1),
      ).toThrow(InvalidMemberNameException);
    });

    it('updateProfile 空名稱 → 拋出 InvalidMemberNameException', () => {
      const member = Member.create(
        Email.of('u@e.com'),
        'Name',
        'hash',
        ROLE_UUID_1,
      );

      expect(() => member.updateProfile('', ROLE_UUID_1)).toThrow(
        InvalidMemberNameException,
      );
    });

    it('名稱驗證失敗的 kind 為 INVALID（對應 400 而非 500）', () => {
      expect(() =>
        Member.create(Email.of('u@e.com'), '', 'hash', ROLE_UUID_1),
      ).toThrow(expect.objectContaining({ kind: 'INVALID' }));
    });
  });
});
