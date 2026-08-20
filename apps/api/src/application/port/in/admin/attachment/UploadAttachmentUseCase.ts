export const UPLOAD_ATTACHMENT_USE_CASE = 'UPLOAD_ATTACHMENT_USE_CASE';

export interface UploadAttachmentCommand {
  buffer: Buffer;
  mimeType: string;
  size: number;
  originalName: string;
  folder: string;
  relatedTable: string;
  relatedId: string;
  uploadedBy?: string | null;
}

export interface UploadAttachmentResult {
  id: string;
  url: string;
}

export interface UploadAttachmentUseCase {
  execute(command: UploadAttachmentCommand): Promise<UploadAttachmentResult>;
}
