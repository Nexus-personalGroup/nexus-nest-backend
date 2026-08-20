import { Inject, Injectable } from '@nestjs/common';
import {
  UPLOAD_ATTACHMENT_USE_CASE,
  UploadAttachmentCommand,
  UploadAttachmentResult,
  UploadAttachmentUseCase,
} from '../../port/in/admin/attachment/UploadAttachmentUseCase';
import {
  DELETE_ATTACHMENT_USE_CASE,
  DeleteAttachmentUseCase,
  type DeleteAttachmentActor,
} from '../../port/in/admin/attachment/DeleteAttachmentUseCase';

/** 附件 Facade：上傳與刪除的對外入口，controller 只透過此 facade 操作 */
@Injectable()
export class AttachmentFacade {
  constructor(
    @Inject(UPLOAD_ATTACHMENT_USE_CASE)
    private readonly uploadUseCase: UploadAttachmentUseCase,
    @Inject(DELETE_ATTACHMENT_USE_CASE)
    private readonly deleteUseCase: DeleteAttachmentUseCase,
  ) {}

  upload(command: UploadAttachmentCommand): Promise<UploadAttachmentResult> {
    return this.uploadUseCase.execute(command);
  }

  remove(id: string, actor: DeleteAttachmentActor): Promise<void> {
    return this.deleteUseCase.execute(id, actor);
  }
}
