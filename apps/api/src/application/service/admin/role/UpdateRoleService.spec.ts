import { UpdateRoleService } from './UpdateRoleService';
import {
  RoleRecord,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { DefaultRoleNotEditableException } from '@app/domain/exception/DefaultRoleNotEditableException';
import { DuplicateRoleNameException } from '@app/domain/exception/DuplicateRoleNameException';

const ROLE_ID = '00000000-0000-4000-8000-000000000001';

const makeRole = (overrides: Partial<RoleRecord> = {}): RoleRecord => ({
  id: ROLE_ID,
  name: '管理者',
  status: true,
  isDefault: false,
  memberCount: 0,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

const mockRoleRepo = {
  listRoles: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  create: jest.fn(),
  createWithPermissions: jest.fn(),
  updateWithPermissions: jest.fn(),
  softDelete: jest.fn(),
  countMembers: jest.fn(),
} as jest.Mocked<RoleRepositoryPort>;

const mockPermissionRepo = {
  findAll: jest.fn(),
  findByCodes: jest.fn(),
  getPermissionsByRoleId: jest.fn(),
  replacePermissions: jest.fn(),
} as jest.Mocked<PermissionRepositoryPort>;

const makeService = () =>
  new UpdateRoleService(mockRoleRepo, mockPermissionRepo);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('UpdateRoleService', () => {
  it('僅切換 status：repo 收到 (id, undefined, undefined, false)', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());

    await makeService().execute({ id: ROLE_ID, status: false });

    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      undefined,
      undefined,
      false,
    );
    expect(mockRoleRepo.findByName).not.toHaveBeenCalled();
    expect(mockPermissionRepo.findByCodes).not.toHaveBeenCalled();
  });

  it('name + status：repo 收到 (id, name, undefined, status)', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockRoleRepo.findByName.mockResolvedValue(null);

    await makeService().execute({
      id: ROLE_ID,
      name: '審核人員',
      status: false,
    });

    expect(mockRoleRepo.findByName).toHaveBeenCalledWith('審核人員');
    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      '審核人員',
      undefined,
      false,
    );
  });

  it('status + permissionCodes：validatePermissions 被呼叫且 repo 收到所有三項', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockPermissionRepo.findByCodes.mockResolvedValue([
      {
        permissionCode: 'BACKEND:ROLE:VIEW',
        name: '檢視角色',
        platform: 'BACKEND',
        module: 'ROLE',
        action: 'VIEW',
      },
    ]);

    await makeService().execute({
      id: ROLE_ID,
      status: true,
      permissionCodes: ['BACKEND:ROLE:VIEW'],
    });

    expect(mockPermissionRepo.findByCodes).toHaveBeenCalledWith([
      'BACKEND:ROLE:VIEW',
    ]);
    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      undefined,
      ['BACKEND:ROLE:VIEW'],
      true,
    );
  });

  it('預設角色 + status：丟 DefaultRoleNotEditableException，repo 不會被呼叫', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole({ isDefault: true }));

    await expect(
      makeService().execute({ id: ROLE_ID, status: false }),
    ).rejects.toBeInstanceOf(DefaultRoleNotEditableException);

    expect(mockRoleRepo.updateWithPermissions).not.toHaveBeenCalled();
  });

  it('找不到角色：丟 RoleNotFoundException', async () => {
    mockRoleRepo.findById.mockResolvedValue(null);

    await expect(
      makeService().execute({ id: ROLE_ID, status: false }),
    ).rejects.toBeInstanceOf(RoleNotFoundException);

    expect(mockRoleRepo.updateWithPermissions).not.toHaveBeenCalled();
  });

  it('名稱衝突：丟 DuplicateRoleNameException', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockRoleRepo.findByName.mockResolvedValue(
      makeRole({ id: 'other-id', name: '審核人員' }),
    );

    await expect(
      makeService().execute({ id: ROLE_ID, name: '審核人員' }),
    ).rejects.toBeInstanceOf(DuplicateRoleNameException);

    expect(mockRoleRepo.updateWithPermissions).not.toHaveBeenCalled();
  });

  it('純 name 更新時 status 為 undefined，repo 收到 (id, name, undefined, undefined)', async () => {
    mockRoleRepo.findById.mockResolvedValue(makeRole());
    mockRoleRepo.findByName.mockResolvedValue(null);

    await makeService().execute({ id: ROLE_ID, name: '審核人員' });

    expect(mockRoleRepo.updateWithPermissions).toHaveBeenCalledWith(
      ROLE_ID,
      '審核人員',
      undefined,
      undefined,
    );
  });
});
