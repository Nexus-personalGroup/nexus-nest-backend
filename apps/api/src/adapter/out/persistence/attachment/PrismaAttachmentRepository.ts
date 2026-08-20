import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  ATTACHMENT_REPOSITORY_PORT,
  AttachmentRecord,
  AttachmentRepositoryPort,
  SaveAttachmentData,
} from '@app/application/port/out/attachment/AttachmentRepositoryPort';

// re-export 方便 module 綁定一處 import
export { ATTACHMENT_REPOSITORY_PORT };

type AttachmentRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  relatedTable: string;
  relatedId: string;
  uploadedBy: string | null;
  createdAt: Date;
};

@Injectable()
export class PrismaAttachmentRepository implements AttachmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async save(data: SaveAttachmentData): Promise<AttachmentRecord> {
    const row = await this.prisma.attachmentRecord.create({
      data: {
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        fileSize: data.fileSize,
        relatedTable: data.relatedTable,
        relatedId: data.relatedId,
        uploadedBy: data.uploadedBy ?? null,
      },
    });
    return this.toRecord(row);
  }

  async findById(id: string): Promise<AttachmentRecord | null> {
    const row = await this.prisma.attachmentRecord.findUnique({
      where: { id },
    });
    return row ? this.toRecord(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.attachmentRecord.delete({ where: { id } });
  }

  private toRecord(row: AttachmentRow): AttachmentRecord {
    return {
      id: row.id,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      fileType: row.fileType,
      fileSize: row.fileSize,
      relatedTable: row.relatedTable,
      relatedId: row.relatedId,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
    };
  }
}
