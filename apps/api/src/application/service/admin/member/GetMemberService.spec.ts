import { GetMemberService } from './GetMemberService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

const MEMBER_ID = '00000000-0000-4000-8000-000000000001';

const mockLoadMember = {
  loadMemberById: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const makeService = () => new GetMemberService(mockLoadMember);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GetMemberService', () => {
  it('存在 → 回傳會員明細', async () => {
    (mockLoadMember.loadMemberById as jest.Mock).mockResolvedValue({
      id: MEMBER_ID,
      email: 'u@test.com',
      member: 'User',
      roleId: 'r1',
      roleName: 'Admin',
      status: true,
      isDefault: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      lastLoginAt: null,
    });

    const result = await makeService().execute(MEMBER_ID);

    expect(result.id).toBe(MEMBER_ID);
    expect(result.email).toBe('u@test.com');
    expect(mockLoadMember.loadMemberById).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('不存在 → 拋 MemberNotFoundException', async () => {
    (mockLoadMember.loadMemberById as jest.Mock).mockResolvedValue(null);

    await expect(makeService().execute(MEMBER_ID)).rejects.toBeInstanceOf(
      MemberNotFoundException,
    );
  });
});
