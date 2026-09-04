import { validatePermissions } from './permission-validator';
import { InvalidPermissionCodeException } from '@app/domain/exception/InvalidPermissionCodeException';
import { InvalidPermissionCombinationException } from '@app/domain/exception/InvalidPermissionCombinationException';
import type {
  PermissionRecord,
  PermissionRepositoryPort,
} from '@app/application/port/out/role/PermissionRepositoryPort';

/** 目錄：ACCOUNT 有 VIEW/EDIT，ATTACHMENT 刻意只有 EDIT */
const CATALOG = [
  'BACKEND:ACCOUNT:VIEW',
  'BACKEND:ACCOUNT:EDIT',
  'BACKEND:ATTACHMENT:EDIT',
];

const asRecord = (permissionCode: string): PermissionRecord => ({
  permissionCode,
  name: permissionCode,
  platform: 'BACKEND',
  module: permissionCode.split(':')[1],
  action: permissionCode.split(':')[2],
});

const makeRepo = (catalog: string[] = CATALOG): PermissionRepositoryPort =>
  ({
    findByCodes: jest.fn((codes: string[]) =>
      Promise.resolve(codes.filter((c) => catalog.includes(c)).map(asRecord)),
    ),
  }) as unknown as PermissionRepositoryPort;

describe('validatePermissions', () => {
  it('空陣列直接通過，不查目錄', async () => {
    const repo = makeRepo();

    await expect(validatePermissions([], repo)).resolves.toBeUndefined();
    expect(repo.findByCodes).not.toHaveBeenCalled();
  });

  it('含目錄沒有的碼 → InvalidPermissionCodeException', async () => {
    await expect(
      validatePermissions(['BACKEND:NOPE:VIEW'], makeRepo()),
    ).rejects.toBeInstanceOf(InvalidPermissionCodeException);
  });

  it('EDIT 搭配同模組 VIEW → 通過', async () => {
    await expect(
      validatePermissions(
        ['BACKEND:ACCOUNT:VIEW', 'BACKEND:ACCOUNT:EDIT'],
        makeRepo(),
      ),
    ).resolves.toBeUndefined();
  });

  it('EDIT 缺同模組 VIEW（而該模組有 VIEW）→ InvalidPermissionCombinationException', async () => {
    await expect(
      validatePermissions(['BACKEND:ACCOUNT:EDIT'], makeRepo()),
    ).rejects.toBeInstanceOf(InvalidPermissionCombinationException);
  });

  /**
   * 本次 bug 的核心。
   *
   * 無條件要求 VIEW 會索取 `BACKEND:ATTACHMENT:VIEW`——那個碼不存在於目錄，
   * 於是 `BACKEND:ATTACHMENT:EDIT` **永遠不可能被指派給任何角色**。
   *
   * ⚠️ 只測上面那條「缺 VIEW 要擋」的話，舊實作也會全綠——
   * **要抓到必須測「模組沒有 VIEW 時不套用」**。
   */
  it('⭐ 模組只提供 EDIT（目錄沒有對應 VIEW）→ 通過，不得要求不存在的碼', async () => {
    await expect(
      validatePermissions(['BACKEND:ATTACHMENT:EDIT'], makeRepo()),
    ).resolves.toBeUndefined();
  });

  it('⭐ 混合：該擋的擋、不該擋的放行', async () => {
    // ATTACHMENT 沒有 VIEW（不套用），ACCOUNT 有 VIEW 且已帶上
    await expect(
      validatePermissions(
        [
          'BACKEND:ATTACHMENT:EDIT',
          'BACKEND:ACCOUNT:EDIT',
          'BACKEND:ACCOUNT:VIEW',
        ],
        makeRepo(),
      ),
    ).resolves.toBeUndefined();
  });
});
