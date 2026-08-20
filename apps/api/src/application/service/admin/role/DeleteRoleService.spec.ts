import { DeleteRoleService } from './DeleteRoleService';
import {
  RoleRecord,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { DefaultRoleNotDeletableException } from '@app/domain/exception/DefaultRoleNotDeletableException';
import { RoleHasMembersException } from '@app/domain/exception/RoleHasMembersException';

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
  countMembers: jest.fn(),
  softDelete: jest.fn(),
} as unknown as jest.Mocked<RoleRepositoryPort>;

const makeService = () => new DeleteRoleService(mockRoleRepo);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeleteRoleService', () => {
  it('正常刪除 → countMembers=0 後 softDelete', async () => {
    (mockRoleRepo.findById as jest.Mock).mockResolvedValue(makeRole());
    (mockRoleRepo.countMembers as jest.Mock).mockResolvedValue(0);

    await makeService().execute(ROLE_ID);

    expect(mockRoleRepo.softDelete).toHaveBeenCalledWith(ROLE_ID);
  });

  it('角色不存在 → 拋 RoleNotFoundException', async () => {
    (mockRoleRepo.findById as jest.Mock).mockResolvedValue(null);

    await expect(makeService().execute(ROLE_ID)).rejects.toBeInstanceOf(
      RoleNotFoundException,
    );
    expect(mockRoleRepo.softDelete).not.toHaveBeenCalled();
  });

  it('預設角色 → 拋 DefaultRoleNotDeletableException', async () => {
    (mockRoleRepo.findById as jest.Mock).mockResolvedValue(
      makeRole({ isDefault: true }),
    );

    await expect(makeService().execute(ROLE_ID)).rejects.toBeInstanceOf(
      DefaultRoleNotDeletableException,
    );
    expect(mockRoleRepo.softDelete).not.toHaveBeenCalled();
  });

  it('仍有成員 → 拋 RoleHasMembersException', async () => {
    (mockRoleRepo.findById as jest.Mock).mockResolvedValue(makeRole());
    (mockRoleRepo.countMembers as jest.Mock).mockResolvedValue(2);

    await expect(makeService().execute(ROLE_ID)).rejects.toBeInstanceOf(
      RoleHasMembersException,
    );
    expect(mockRoleRepo.softDelete).not.toHaveBeenCalled();
  });
});
