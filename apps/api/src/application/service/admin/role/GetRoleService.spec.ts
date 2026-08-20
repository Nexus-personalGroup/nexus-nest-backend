import { GetRoleService } from './GetRoleService';
import {
  RoleRecord,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';

const ROLE_ID = '00000000-0000-4000-8000-000000000001';

const makeRole = (overrides: Partial<RoleRecord> = {}): RoleRecord => ({
  id: ROLE_ID,
  name: '審核人員',
  status: true,
  isDefault: false,
  memberCount: 0,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

const mockRoleRepo = {
  findById: jest.fn(),
} as unknown as jest.Mocked<RoleRepositoryPort>;

const mockPermissionRepo = {
  getPermissionsByRoleId: jest.fn(),
} as unknown as jest.Mocked<PermissionRepositoryPort>;

const makeService = () => new GetRoleService(mockRoleRepo, mockPermissionRepo);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GetRoleService', () => {
  it('存在 → 回傳角色明細並附 permissionCodes', async () => {
    (mockRoleRepo.findById as jest.Mock).mockResolvedValue(makeRole());
    (mockPermissionRepo.getPermissionsByRoleId as jest.Mock).mockResolvedValue([
      'BACKEND:ROLE:VIEW',
    ]);

    const result = await makeService().execute(ROLE_ID);

    expect(result.id).toBe(ROLE_ID);
    expect(result.permissionCodes).toEqual(['BACKEND:ROLE:VIEW']);
  });

  it('不存在 → 拋 RoleNotFoundException，不查權限', async () => {
    (mockRoleRepo.findById as jest.Mock).mockResolvedValue(null);

    await expect(makeService().execute(ROLE_ID)).rejects.toBeInstanceOf(
      RoleNotFoundException,
    );
    expect(mockPermissionRepo.getPermissionsByRoleId).not.toHaveBeenCalled();
  });
});
