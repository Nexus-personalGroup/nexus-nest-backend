import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  UPLOAD_ATTACHMENT_USE_CASE,
  UploadAttachmentCommand,
  UploadAttachmentResult,
  UploadAttachmentUseCase,
} from '../../../port/in/admin/attachment/UploadAttachmentUseCase';
import {
  ATTACHMENT_REPOSITORY_PORT,
  AttachmentRepositoryPort,
} from '../../../port/out/attachment/AttachmentRepositoryPort';
import {
  FILE_STORAGE_PORT,
  FileStoragePort,
} from '../../../port/out/shared/FileStoragePort';
import {
  extForMime,
  isAllowedMime,
  sniffMime,
  isUploadFolder,
} from '@app/shared/constants/upload';
import { InvalidUploadException } from '@app/domain/exception/InvalidUploadException';
import { getEnv } from '@app/infrastructure/validate-env';

export { UPLOAD_ATTACHMENT_USE_CASE };

@Injectable()
export class UploadAttachmentService implements UploadAttachmentUseCase {
  constructor(
    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,
    @Inject(ATTACHMENT_REPOSITORY_PORT)
    private readonly attachmentRepo: AttachmentRepositoryPort,
  ) {}

  async execute(
    command: UploadAttachmentCommand,
  ): Promise<UploadAttachmentResult> {
    if (!isUploadFolder(command.folder)) {
      throw new InvalidUploadException(`不允許的上傳資料夾：${command.folder}`);
    }
    if (!isAllowedMime(command.mimeType)) {
      throw new InvalidUploadException(`不允許的檔案類型：${command.mimeType}`);
    }
    // 白名單比對的是 client 自行宣告的 Content-Type——通過只代表字串填對了。
    // 用 magic byte 確認檔案內容真的是那個類型，擋掉「宣告 image/png、body 是 HTML」
    // 這類內容偽造（否則得完全仰賴 nosniff，而 S3 路徑上沒有那道 header）。
    if (sniffMime(command.buffer) !== command.mimeType) {
      throw new InvalidUploadException('檔案內容與宣告的類型不符');
    }
    const maxBytes = getEnv().MAX_UPLOAD_BYTES;
    if (command.size > maxBytes) {
      throw new InvalidUploadException(`檔案過大（上限 ${maxBytes} bytes）`);
    }

    // 副檔名由通過白名單與 magic byte 兩道檢查的 MIME 推導，不取 client 原始檔名
    // （擋 evil.png.html 這類雙副檔名 stored XSS）
    const ext = extForMime(command.mimeType);
    const key = `${command.folder}/${randomUUID()}.${ext}`;

    const url = await this.fileStorage.upload({
      key,
      buffer: command.buffer,
      mimeType: command.mimeType,
    });

    // multipart header 常以 latin1 傳中文檔名，存入前還原成 UTF-8
    const fileName = Buffer.from(command.originalName, 'latin1').toString(
      'utf8',
    );

    const saved = await this.attachmentRepo.save({
      fileName,
      fileUrl: url,
      fileType: command.mimeType,
      fileSize: command.size,
      relatedTable: command.relatedTable,
      relatedId: command.relatedId,
      uploadedBy: command.uploadedBy ?? null,
    });

    return { id: saved.id, url };
  }
}
