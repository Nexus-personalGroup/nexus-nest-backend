import { ListPermissionsService } from './ListPermissionsService';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';

const mockPermissionRepo = {
  findAll: jest.fn(),
} as unknown as jest.Mocked<PermissionRepositoryPort>;

const makeService = () => new ListPermissionsService(mockPermissionRepo);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ListPermissionsService', () => {
  it('委派 permissionRepo.findAll 並原樣回傳', async () => {
    const result = [{ permissionCode: 'BACKEND:ROLE:VIEW' }];
    (mockPermissionRepo.findAll as jest.Mock).mockResolvedValue(result);

    const actual = await makeService().execute();

    expect(mockPermissionRepo.findAll).toHaveBeenCalledTimes(1);
    expect(actual).toBe(result);
  });
});
