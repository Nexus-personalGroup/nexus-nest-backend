import { DeleteMemberService } from './DeleteMemberService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { SaveMemberPort } from '../../../port/out/member/SaveMemberPort';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import { CannotDeleteSelfException } from '@app/domain/exception/CannotDeleteSelfException';
import { DefaultMemberNotDeletableException } from '@app/domain/exception/DefaultMemberNotDeletableException';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';

const mockLoadMember = {
  loadMemberById: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockSaveMember = {
  deleteMember: jest.fn(),
} as unknown as jest.Mocked<SaveMemberPort>;

const makeService = () =>
  new DeleteMemberService(mockLoadMember, mockSaveMember);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeleteMemberService', () => {
  it('正常刪除 → 呼叫 deleteMember(id)', async () => {
    (mockLoadMember.loadMemberById as jest.Mock).mockResolvedValue({
      isDefault: false,
    });

    await makeService().execute({ id: TARGET, actorId: ACTOR });

    expect(mockSaveMember.deleteMember).toHaveBeenCalledWith(TARGET);
  });

  it('刪除自己（id === actorId）→ 拋 CannotDeleteSelfException，不查 DB', async () => {
    await expect(
      makeService().execute({ id: ACTOR, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(CannotDeleteSelfException);

    expect(mockLoadMember.loadMemberById).not.toHaveBeenCalled();
    expect(mockSaveMember.deleteMember).not.toHaveBeenCalled();
  });

  it('帳號不存在 → 拋 MemberNotFoundException', async () => {
    (mockLoadMember.loadMemberById as jest.Mock).mockResolvedValue(null);

    await expect(
      makeService().execute({ id: TARGET, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(MemberNotFoundException);

    expect(mockSaveMember.deleteMember).not.toHaveBeenCalled();
  });

  it('預設帳號 → 拋 DefaultMemberNotDeletableException', async () => {
    (mockLoadMember.loadMemberById as jest.Mock).mockResolvedValue({
      isDefault: true,
    });

    await expect(
      makeService().execute({ id: TARGET, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(DefaultMemberNotDeletableException);

    expect(mockSaveMember.deleteMember).not.toHaveBeenCalled();
  });
});
