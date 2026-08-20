import { ListRolesService } from './ListRolesService';
import { RoleRepositoryPort } from '../../../port/out/role/RoleRepositoryPort';

const mockRoleRepo = {
  listRoles: jest.fn(),
} as unknown as jest.Mocked<RoleRepositoryPort>;

const makeService = () => new ListRolesService(mockRoleRepo);

const roleRow = {
  id: 'r1',
  name: '審核人員',
  status: true,
  isDefault: false,
  memberCount: 3,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ListRolesService', () => {
  it('帶 page/limit/filters 呼叫 repo，並把 {data,total} 轉為 {list,meta}', async () => {
    (mockRoleRepo.listRoles as jest.Mock).mockResolvedValue({
      data: [roleRow],
      total: 1,
    });

    const result = await makeService().execute({
      page: 1,
      limit: 10,
      name: '審',
      status: true,
    });

    expect(mockRoleRepo.listRoles).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      name: '審',
      status: true,
    });
    expect(result.list).toHaveLength(1);
    expect(result.list[0].id).toBe('r1');
    expect(result.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 10, total: 1 }),
    );
  });
});
