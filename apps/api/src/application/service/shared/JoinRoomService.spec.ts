import { JoinRoomService } from './JoinRoomService';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import type { EnsureRoomMembershipUseCase } from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';

const mockMembership = {
  execute: jest.fn(),
} as unknown as jest.Mocked<EnsureRoomMembershipUseCase>;

const mockAudit = {
  record: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

describe('JoinRoomService', () => {
  let service: JoinRoomService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.execute.mockResolvedValue(undefined);
    mockAudit.record.mockResolvedValue(undefined);
    service = new JoinRoomService(mockMembership, mockAudit);
  });

  it('成員加入時寫稽核紀錄', async () => {
    await service.execute('m1', 'r1');

    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'm1',
      action: 'ROOM_JOINED',
      roomId: 'r1',
    });
  });

  // 沒有資格的人不該在稽核裡留下「加入了」的紀錄
  it('非成員時拋錯且不寫稽核', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());

    await expect(service.execute('m1', 'r1')).rejects.toThrow(
      ChatRoomNotFoundException,
    );
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('稽核寫入失敗時，加入仍成功', async () => {
    mockAudit.record.mockRejectedValue(new Error('稽核表滿了'));

    await expect(service.execute('m1', 'r1')).resolves.toBeUndefined();
  });
});
