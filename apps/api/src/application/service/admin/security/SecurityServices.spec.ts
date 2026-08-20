import {
  ListIpWhitelistService,
  AddIpWhitelistService,
  RemoveIpWhitelistService,
  GetIpWhitelistService,
  UpdateIpWhitelistService,
  ListIpBlacklistService,
  AddIpBlacklistService,
  GetIpBlacklistService,
  UpdateIpBlacklistService,
} from './SecurityServices';
import { IpListPort } from '../../../port/out/security/IpListPort';
import { IpListNotFoundException } from '@app/domain/exception/IpListNotFoundException';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({ DEFAULT_PAGE_LIMIT: 15 }),
}));

const ID = '00000000-0000-4000-8000-000000000001';

const mockIpList = {
  listWhitelist: jest.fn(),
  addToWhitelist: jest.fn(),
  removeWhitelist: jest.fn(),
  findWhitelistById: jest.fn(),
  updateWhitelist: jest.fn(),
  listBlacklist: jest.fn(),
  addToBlacklist: jest.fn(),
  removeBlacklist: jest.fn(),
  findBlacklistById: jest.fn(),
  updateBlacklist: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SecurityServices — IP 白名單', () => {
  it('List → 帶 page/limit/search 委派，並轉成 {list,meta}', async () => {
    (mockIpList.listWhitelist as jest.Mock).mockResolvedValue({
      list: [{ id: ID }],
      total: 1,
    });

    const result = await new ListIpWhitelistService(mockIpList).execute({
      page: 1,
      limit: 10,
      search: ' x ',
    });

    expect(mockIpList.listWhitelist).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      search: 'x',
    });
    expect(result.list).toHaveLength(1);
    expect(result.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 10, total: 1 }),
    );
  });

  it('Add → 帶 ip/description/createdBy 委派', async () => {
    (mockIpList.addToWhitelist as jest.Mock).mockResolvedValue({ id: ID });

    await new AddIpWhitelistService(mockIpList).execute({
      ip: '1.2.3.4',
      description: 'office',
      createdBy: 'admin',
    });

    expect(mockIpList.addToWhitelist).toHaveBeenCalledWith(
      '1.2.3.4',
      'office',
      'admin',
    );
  });

  it('Remove → 委派 removeWhitelist', async () => {
    await new RemoveIpWhitelistService(mockIpList).execute(ID);
    expect(mockIpList.removeWhitelist).toHaveBeenCalledWith(ID);
  });

  it('Get 找到 → 回傳；找不到 → 拋 IpListNotFoundException', async () => {
    (mockIpList.findWhitelistById as jest.Mock).mockResolvedValueOnce({
      id: ID,
    });
    await expect(
      new GetIpWhitelistService(mockIpList).execute(ID),
    ).resolves.toEqual({ id: ID });

    (mockIpList.findWhitelistById as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      new GetIpWhitelistService(mockIpList).execute(ID),
    ).rejects.toBeInstanceOf(IpListNotFoundException);
  });

  it('Update → 帶 id 與 description 委派', async () => {
    await new UpdateIpWhitelistService(mockIpList).execute({
      id: ID,
      description: 'new',
    });
    expect(mockIpList.updateWhitelist).toHaveBeenCalledWith(ID, {
      description: 'new',
    });
  });
});

describe('SecurityServices — IP 黑名單', () => {
  it('List → 委派並轉成 {list,meta}', async () => {
    (mockIpList.listBlacklist as jest.Mock).mockResolvedValue({
      list: [],
      total: 0,
    });

    const result = await new ListIpBlacklistService(mockIpList).execute({
      page: 1,
      limit: 10,
    });

    expect(mockIpList.listBlacklist).toHaveBeenCalled();
    expect(result.meta.total).toBe(0);
  });

  it('Add → 帶 ip/reason/false/createdBy（手動加入非自動封鎖）', async () => {
    (mockIpList.addToBlacklist as jest.Mock).mockResolvedValue({ id: ID });

    await new AddIpBlacklistService(mockIpList).execute({
      ip: '5.6.7.8',
      reason: 'abuse',
      createdBy: 'admin',
    });

    expect(mockIpList.addToBlacklist).toHaveBeenCalledWith(
      '5.6.7.8',
      'abuse',
      false,
      'admin',
    );
  });

  it('Get 找不到 → 拋 IpListNotFoundException', async () => {
    (mockIpList.findBlacklistById as jest.Mock).mockResolvedValue(null);
    await expect(
      new GetIpBlacklistService(mockIpList).execute(ID),
    ).rejects.toBeInstanceOf(IpListNotFoundException);
  });

  it('Update → 帶 id 與 reason 委派', async () => {
    await new UpdateIpBlacklistService(mockIpList).execute({
      id: ID,
      reason: 'new',
    });
    expect(mockIpList.updateBlacklist).toHaveBeenCalledWith(ID, {
      reason: 'new',
    });
  });
});
