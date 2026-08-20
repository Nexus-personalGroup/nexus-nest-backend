export const ATTACHMENT_REPOSITORY_PORT = 'ATTACHMENT_REPOSITORY_PORT';

export interface AttachmentRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  relatedTable: string;
  relatedId: string;
  uploadedBy: string | null;
  createdAt: Date;
}

export interface SaveAttachmentData {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  relatedTable: string;
  relatedId: string;
  uploadedBy?: string | null;
}

export interface AttachmentRepositoryPort {
  save(data: SaveAttachmentData): Promise<AttachmentRecord>;
  findById(id: string): Promise<AttachmentRecord | null>;
  delete(id: string): Promise<void>;
}
