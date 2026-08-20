import { Module } from '@nestjs/common';
import { AttachmentController } from '../../adapter/in/web/admin/attachment/AttachmentController';
import { AttachmentFacade } from '../../application/facade/admin/AttachmentFacade';
import { UPLOAD_ATTACHMENT_USE_CASE } from '../../application/port/in/admin/attachment/UploadAttachmentUseCase';
import { DELETE_ATTACHMENT_USE_CASE } from '../../application/port/in/admin/attachment/DeleteAttachmentUseCase';
import { UploadAttachmentService } from '../../application/service/admin/attachment/UploadAttachmentService';
import { DeleteAttachmentService } from '../../application/service/admin/attachment/DeleteAttachmentService';
import { PrismaAttachmentRepository } from '../../adapter/out/persistence/attachment/PrismaAttachmentRepository';
import { ATTACHMENT_REPOSITORY_PORT } from '../../application/port/out/attachment/AttachmentRepositoryPort';
import { StorageModule } from '../storage.module';

@Module({
  imports: [StorageModule],
  controllers: [AttachmentController],
  providers: [
    PrismaAttachmentRepository,
    {
      provide: ATTACHMENT_REPOSITORY_PORT,
      useExisting: PrismaAttachmentRepository,
    },
    { provide: UPLOAD_ATTACHMENT_USE_CASE, useClass: UploadAttachmentService },
    { provide: DELETE_ATTACHMENT_USE_CASE, useClass: DeleteAttachmentService },
    AttachmentFacade,
  ],
})
export class AttachmentModule {}
