import { GetRoleOptionService } from './GetRoleOptionService';
import { LoadRolePort } from '../../../port/out/role/LoadRolePort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';

const ROLE_ID = '00000000-0000-4000-8000-000000000001';

const mockLoadRole = {
  findDefaultRoleId: jest.fn(),
  findRoleById: jest.fn(),
  listActiveRoles: jest.fn(),
  findActiveRoleOption: jest.fn(),
} as jest.Mocked<LoadRolePort>;

const makeService = () => new GetRoleOptionService(mockLoadRole);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GetRoleOptionService', () => {
  it('找到啟用角色：回傳 RoleOption', async () => {
    mockLoadRole.findActiveRoleOption.mockResolvedValue({
      id: ROLE_ID,
      name: '一般使用者',
      isAssignable: true,
    });

    const result = await makeService().execute(ROLE_ID);

    expect(result).toEqual({
      id: ROLE_ID,
      name: '一般使用者',
      isAssignable: true,
    });
  });

  it('port 回 null（角色不存在 / 停用 / 軟刪除）：丟 RoleNotFoundException', async () => {
    mockLoadRole.findActiveRoleOption.mockResolvedValue(null);

    await expect(makeService().execute(ROLE_ID)).rejects.toBeInstanceOf(
      RoleNotFoundException,
    );
  });
});
