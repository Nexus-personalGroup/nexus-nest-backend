import { UpdateRoleService } from './UpdateRoleService';
import {
  RoleRecord,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';
import { MemberContextCachePort } from '../../../port/out/member/MemberContextCachePort';
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
  findMemberIdsByRole: jest.fn(),
} as jest.Mocked<RoleRepositoryPort>;

const mockPermissionRepo = {
  findAll: jest.fn(),
  findByCodes: jest.fn(),
  getPermissionsByRoleId: jest.fn(),
  replacePermissions: jest.fn(),
} as jest.Mocked<PermissionRepositoryPort>;

const mockMemberContextCache = {
  getByMemberId: jest.fn(),
  setByMemberId: jest.fn(),
  clearByMemberId: jest.fn(),
  clearMany: jest.fn(),
  isAvailable: true,
} as unknown as jest.Mocked<MemberContextCachePort>;

const makeService = () =>
  new UpdateRoleService(
    mockRoleRepo,
    mockPermissionRepo,
    mockMemberContextCache,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRoleRepo.findMemberIdsByRole.mockResolvedValue([]);
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

  describe('成員快取清除', () => {
    it('清的是該角色的成員', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockRoleRepo.findMemberIdsByRole.mockResolvedValue(['m-1', 'm-2']);
      mockPermissionRepo.findByCodes.mockResolvedValue([]);

      await makeService().execute({ id: ROLE_ID, permissionCodes: [] });

      expect(mockRoleRepo.findMemberIdsByRole).toHaveBeenCalledWith(ROLE_ID);
      expect(mockMemberContextCache.clearMany).toHaveBeenCalledWith([
        'm-1',
        'm-2',
      ]);
    });

    // 一律清（design D6）：不判斷「這次改的是不是授權」——MemberContext 也帶 roleName
    it('只改名稱也要清', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockRoleRepo.findByName.mockResolvedValue(null);
      mockRoleRepo.findMemberIdsByRole.mockResolvedValue(['m-1']);

      await makeService().execute({ id: ROLE_ID, name: '審核人員' });

      expect(mockMemberContextCache.clearMany).toHaveBeenCalledWith(['m-1']);
    });

    it('只切換 status 也要清', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockRoleRepo.findMemberIdsByRole.mockResolvedValue(['m-1']);

      await makeService().execute({ id: ROLE_ID, status: false });

      expect(mockMemberContextCache.clearMany).toHaveBeenCalledWith(['m-1']);
    });

    it('角色沒有成員時仍呼叫清除，但帶空陣列', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockRoleRepo.findMemberIdsByRole.mockResolvedValue([]);

      await makeService().execute({ id: ROLE_ID, status: false });

      expect(mockMemberContextCache.clearMany).toHaveBeenCalledWith([]);
    });

    // 順序不可顛倒：先清再寫的話，中間那一瞬間的請求會把舊值重新快取回去
    it('清除發生在 updateWithPermissions 之後', async () => {
      const order: string[] = [];
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockRoleRepo.updateWithPermissions.mockImplementation(() => {
        order.push('update');
        return Promise.resolve();
      });
      mockRoleRepo.findMemberIdsByRole.mockResolvedValue(['m-1']);
      mockMemberContextCache.clearMany.mockImplementation(() => {
        order.push('clear');
        return Promise.resolve();
      });

      await makeService().execute({ id: ROLE_ID, status: false });

      expect(order).toEqual(['update', 'clear']);
    });

    // 失敗不吞（design D4）：語意是「權限改了但沒有生效」，
    // 回成功會讓呼叫端處於一個他不知道的狀態
    it('清除失敗會讓 execute 拋出', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole());
      mockRoleRepo.findMemberIdsByRole.mockResolvedValue(['m-1']);
      mockMemberContextCache.clearMany.mockRejectedValue(
        new Error('redis down'),
      );

      await expect(
        makeService().execute({ id: ROLE_ID, status: false }),
      ).rejects.toThrow('redis down');
    });

    it('更新前就拋出時不會清快取', async () => {
      mockRoleRepo.findById.mockResolvedValue(makeRole({ isDefault: true }));

      await expect(
        makeService().execute({ id: ROLE_ID, status: false }),
      ).rejects.toBeInstanceOf(DefaultRoleNotEditableException);

      expect(mockMemberContextCache.clearMany).not.toHaveBeenCalled();
    });
  });
});
