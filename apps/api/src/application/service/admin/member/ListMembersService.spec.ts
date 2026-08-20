import { ListMembersService } from './ListMembersService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';

const mockLoadMember = {
  listMembers: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const makeService = () => new ListMembersService(mockLoadMember);

const memberRow = {
  id: 'm1',
  email: 'u@test.com',
  member: 'User',
  roleId: 'r1',
  roleName: 'Admin',
  status: true,
  isDefault: false,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  lastLoginAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ListMembersService', () => {
  it('帶 page/limit/filters 呼叫 repo，並把 {data,total} 轉為 {list,meta}', async () => {
    (mockLoadMember.listMembers as jest.Mock).mockResolvedValue({
      data: [memberRow],
      total: 1,
    });

    const result = await makeService().execute({
      page: 2,
      limit: 5,
      name: 'U',
      email: 'u',
      status: true,
    });

    expect(mockLoadMember.listMembers).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      name: 'U',
      email: 'u',
      status: true,
    });
    expect(result.list).toHaveLength(1);
    expect(result.list[0].id).toBe('m1');
    expect(result.meta).toEqual(
      expect.objectContaining({ page: 2, limit: 5, total: 1 }),
    );
  });

  it('未給分頁 → 套用預設 page=1', async () => {
    (mockLoadMember.listMembers as jest.Mock).mockResolvedValue({
      data: [],
      total: 0,
    });

    await makeService().execute({});

    expect(mockLoadMember.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });
});
