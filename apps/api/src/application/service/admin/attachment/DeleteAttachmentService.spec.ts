import { DeleteAttachmentService } from './DeleteAttachmentService';
import { FileStoragePort } from '../../../port/out/shared/FileStoragePort';
import {
  AttachmentRecord,
  AttachmentRepositoryPort,
} from '../../../port/out/attachment/AttachmentRepositoryPort';
import { AttachmentForbiddenException } from '@app/domain/exception/AttachmentForbiddenException';
import { AttachmentNotFoundException } from '@app/domain/exception/AttachmentNotFoundException';

describe('DeleteAttachmentService', () => {
  const fileStorage: jest.Mocked<FileStoragePort> = {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
  const attachmentRepo: jest.Mocked<AttachmentRepositoryPort> = {
    save: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
  };
  let service: DeleteAttachmentService;

  const record: AttachmentRecord = {
    id: 'a1',
    fileName: 'a.png',
    fileUrl: 'http://cdn.example.com/media/avatars/uuid.png',
    fileType: 'image/png',
    fileSize: 1000,
    relatedTable: 'members',
    relatedId: 'm1',
    uploadedBy: 'u1',
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeleteAttachmentService(fileStorage, attachmentRepo);
  });

  // 上傳者本人
  const owner = { memberId: 'u1', roleCode: 'ADMIN' };

  it('存在 → 以 fileUrl 尾兩段組 key 刪 storage + 刪紀錄', async () => {
    attachmentRepo.findById.mockResolvedValue(record);

    await service.execute('a1', owner);

    expect(fileStorage.delete).toHaveBeenCalledWith('avatars/uuid.png');
    expect(attachmentRepo.delete).toHaveBeenCalledWith('a1');
  });

  // 權限碼擋不住「有資格的 A 刪掉 B 的附件」——刪除不可逆且會移除實體檔案，
  // 附件 ID 又會隨上傳回應外流，能看到 ID 的人就能刪
  it('非上傳者且非 SUPERADMIN → AttachmentForbiddenException，不動 storage', async () => {
    attachmentRepo.findById.mockResolvedValue(record);

    await expect(
      service.execute('a1', { memberId: 'someone-else', roleCode: 'ADMIN' }),
    ).rejects.toBeInstanceOf(AttachmentForbiddenException);
    expect(fileStorage.delete).not.toHaveBeenCalled();
    expect(attachmentRepo.delete).not.toHaveBeenCalled();
  });

  it('非上傳者但為 SUPERADMIN → 允許刪除', async () => {
    attachmentRepo.findById.mockResolvedValue(record);

    await service.execute('a1', {
      memberId: 'someone-else',
      roleCode: 'SUPERADMIN',
    });

    expect(attachmentRepo.delete).toHaveBeenCalledWith('a1');
  });

  it('uploadedBy 為 null（來源不明）→ 非 SUPERADMIN 不得刪除', async () => {
    attachmentRepo.findById.mockResolvedValue({ ...record, uploadedBy: null });

    await expect(
      service.execute('a1', { memberId: 'u1', roleCode: 'ADMIN' }),
    ).rejects.toBeInstanceOf(AttachmentForbiddenException);
  });

  it('不存在 → AttachmentNotFoundException，不動 storage', async () => {
    attachmentRepo.findById.mockResolvedValue(null);

    await expect(service.execute('missing', owner)).rejects.toBeInstanceOf(
      AttachmentNotFoundException,
    );
    expect(fileStorage.delete).not.toHaveBeenCalled();
    expect(attachmentRepo.delete).not.toHaveBeenCalled();
  });
});
