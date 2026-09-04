import { CreateRoleService } from './CreateRoleService';
import { RoleRepositoryPort } from '../../../port/out/role/RoleRepositoryPort';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';
import { DuplicateRoleNameException } from '@app/domain/exception/DuplicateRoleNameException';
import { InvalidPermissionCodeException } from '@app/domain/exception/InvalidPermissionCodeException';
import { InvalidPermissionCombinationException } from '@app/domain/exception/InvalidPermissionCombinationException';

const NEW_ROLE_ID = '00000000-0000-4000-8000-000000000099';

const mockRoleRepo = {
  findByName: jest.fn(),
  createWithPermissions: jest.fn(),
} as unknown as jest.Mocked<RoleRepositoryPort>;

const mockPermissionRepo = {
  findByCodes: jest.fn(),
} as unknown as jest.Mocked<PermissionRepositoryPort>;

const makeService = () =>
  new CreateRoleService(mockRoleRepo, mockPermissionRepo);

const permRecord = (code: string) => {
  const [platform, module, action] = code.split(':');
  return { permissionCode: code, name: code, platform, module, action };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CreateRoleService', () => {
  it('正常建立 → 回傳新角色 id，repo 收到 (name, codes)', async () => {
    (mockRoleRepo.findByName as jest.Mock).mockResolvedValue(null);
    (mockPermissionRepo.findByCodes as jest.Mock).mockResolvedValue([
      permRecord('BACKEND:ROLE:VIEW'),
    ]);
    (mockRoleRepo.createWithPermissions as jest.Mock).mockResolvedValue({
      id: NEW_ROLE_ID,
    });

    const result = await makeService().execute({
      name: '審核人員',
      permissionCodes: ['BACKEND:ROLE:VIEW'],
    });

    expect(result).toEqual({ id: NEW_ROLE_ID });
    expect(mockRoleRepo.createWithPermissions).toHaveBeenCalledWith(
      '審核人員',
      ['BACKEND:ROLE:VIEW'],
    );
  });

  it('名稱重複 → 拋 DuplicateRoleNameException，不建立', async () => {
    (mockRoleRepo.findByName as jest.Mock).mockResolvedValue({ id: 'exists' });

    await expect(
      makeService().execute({ name: '管理者', permissionCodes: [] }),
    ).rejects.toBeInstanceOf(DuplicateRoleNameException);

    expect(mockRoleRepo.createWithPermissions).not.toHaveBeenCalled();
  });

  it('權限碼不存在 → 拋 InvalidPermissionCodeException', async () => {
    (mockRoleRepo.findByName as jest.Mock).mockResolvedValue(null);
    (mockPermissionRepo.findByCodes as jest.Mock).mockResolvedValue([]);

    await expect(
      makeService().execute({
        name: '審核人員',
        permissionCodes: ['BACKEND:ROLE:VIEW'],
      }),
    ).rejects.toBeInstanceOf(InvalidPermissionCodeException);
  });

  it('EDIT 缺同模組 VIEW → 拋 InvalidPermissionCombinationException', async () => {
    (mockRoleRepo.findByName as jest.Mock).mockResolvedValue(null);
    // 目錄裡**有** ROLE:VIEW，蘊含規則才適用——
    // 只回 EDIT 等於宣稱該模組沒有 VIEW，那種情況依規則不該擋
    // （附件就是那樣，見 permission-validator.spec.ts）
    (mockPermissionRepo.findByCodes as jest.Mock).mockResolvedValue([
      permRecord('BACKEND:ROLE:EDIT'),
      permRecord('BACKEND:ROLE:VIEW'),
    ]);

    await expect(
      makeService().execute({
        name: '審核人員',
        permissionCodes: ['BACKEND:ROLE:EDIT'],
      }),
    ).rejects.toBeInstanceOf(InvalidPermissionCombinationException);
  });
});
