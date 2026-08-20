import { Inject, Injectable } from '@nestjs/common';
import {
  DELETE_ATTACHMENT_USE_CASE,
  DeleteAttachmentUseCase,
  type DeleteAttachmentActor,
} from '../../../port/in/admin/attachment/DeleteAttachmentUseCase';
import {
  ATTACHMENT_REPOSITORY_PORT,
  AttachmentRepositoryPort,
} from '../../../port/out/attachment/AttachmentRepositoryPort';
import {
  FILE_STORAGE_PORT,
  FileStoragePort,
} from '../../../port/out/shared/FileStoragePort';
import { AttachmentNotFoundException } from '@app/domain/exception/AttachmentNotFoundException';
import { AttachmentForbiddenException } from '@app/domain/exception/AttachmentForbiddenException';
import { RoleCode } from '@app/domain/value-object/Role';

export { DELETE_ATTACHMENT_USE_CASE };

@Injectable()
export class DeleteAttachmentService implements DeleteAttachmentUseCase {
  constructor(
    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,
    @Inject(ATTACHMENT_REPOSITORY_PORT)
    private readonly attachmentRepo: AttachmentRepositoryPort,
  ) {}

  /**
   * 刪除附件（同時移除實體檔案與 DB 紀錄）
   *
   * **擁有者檢查不可省**：權限碼只能擋「有沒有資格碰附件」，擋不住「有資格的 A
   * 刪掉 B 的附件」。刪除不可逆、無軟刪除，而附件 ID 會隨上傳回應外流——
   * 能看到 ID 的人就能刪掉它。規則取「上傳者本人 or SUPERADMIN」：附件散落在
   * 各業務模組，這是最小且不需要逐模組配置的判準。
   *
   * @param id - 附件 ID
   * @param actor - 執行刪除的使用者
   */
  async execute(id: string, actor: DeleteAttachmentActor): Promise<void> {
    const record = await this.attachmentRepo.findById(id);
    if (!record) throw new AttachmentNotFoundException();

    if (
      record.uploadedBy !== actor.memberId &&
      actor.roleCode !== RoleCode.SUPERADMIN
    ) {
      throw new AttachmentForbiddenException();
    }

    // key = fileUrl 的最後兩段（<folder>/<uuid>.<ext>），與 base URL / driver 無關
    const key = record.fileUrl.split('/').slice(-2).join('/');
    await this.fileStorage.delete(key);
    await this.attachmentRepo.delete(id);
  }
}
