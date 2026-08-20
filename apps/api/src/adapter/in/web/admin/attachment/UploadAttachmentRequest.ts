import { z } from 'zod';
import { UPLOAD_FOLDERS } from '@app/shared/constants/upload';

export const uploadAttachmentSchema = z.object({
  folder: z.enum(UPLOAD_FOLDERS),
  relatedTable: z.string().trim().min(1).max(50),
  relatedId: z.string().trim().min(1).max(36),
});

export type UploadAttachmentRequest = z.infer<typeof uploadAttachmentSchema>;
