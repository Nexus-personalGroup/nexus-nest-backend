import { ListRoleOptionsService } from './ListRoleOptionsService';
import { LoadRolePort } from '../../../port/out/role/LoadRolePort';

const mockLoadRole = {
  findDefaultRoleId: jest.fn(),
  findRoleById: jest.fn(),
  listActiveRoles: jest.fn(),
  findActiveRoleOption: jest.fn(),
} as jest.Mocked<LoadRolePort>;

const makeService = () => new ListRoleOptionsService(mockLoadRole);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ListRoleOptionsService', () => {
  it('預設值：未指定 page/limit/search → port 收到 page=1 / limit=20 / search=undefined', async () => {
    mockLoadRole.listActiveRoles.mockResolvedValue({ list: [], total: 0 });

    await makeService().execute({});

    expect(mockLoadRole.listActiveRoles).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
    });
  });

  it('指定 page / limit / search：port 收到對應值', async () => {
    mockLoadRole.listActiveRoles.mockResolvedValue({ list: [], total: 0 });

    await makeService().execute({ page: 3, limit: 10, search: 'admin' });

    expect(mockLoadRole.listActiveRoles).toHaveBeenCalledWith({
      page: 3,
      limit: 10,
      search: 'admin',
    });
  });

  it('search 為空字串：被 trim 後視為未提供', async () => {
    mockLoadRole.listActiveRoles.mockResolvedValue({ list: [], total: 0 });

    await makeService().execute({ search: '   ' });

    expect(mockLoadRole.listActiveRoles).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
    });
  });

  it('組裝 meta：totalPages = ceil(total / limit)', async () => {
    mockLoadRole.listActiveRoles.mockResolvedValue({
      list: [
        { id: 'r1', name: '一般使用者', isAssignable: true },
        { id: 'r2', name: '審核者', isAssignable: true },
      ],
      total: 35,
    });

    const result = await makeService().execute({ page: 2, limit: 20 });

    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 35,
      totalPages: 2,
    });
    expect(result.list).toHaveLength(2);
  });

  it('total = 0：totalPages 至少為 1', async () => {
    mockLoadRole.listActiveRoles.mockResolvedValue({ list: [], total: 0 });

    const result = await makeService().execute({ page: 1, limit: 20 });

    expect(result.meta.totalPages).toBe(1);
  });
});
