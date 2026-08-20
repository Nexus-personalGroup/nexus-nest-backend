import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import {
  FileStoragePort,
  UploadFileOptions,
} from '../../../application/port/out/shared/FileStoragePort';
import { getEnv } from '../../../infrastructure/validate-env';

/**
 * 本機檔案儲存（STORAGE_DRIVER=local，dev / 衍生專案免 AWS 即可用）。
 *
 * 檔案寫到 `LOCAL_MEDIA_ROOT/<key>`，由 `main.ts` 的 express.static 以 `LOCAL_MEDIA_BASE_URL`
 * 對外服務（加 nosniff + 嚴格 CSP）。本機無簽章意義，`getSignedUrl` 直接回靜態 URL。
 */
@Injectable()
export class LocalFileStorageAdapter implements FileStoragePort {
  private get root(): string {
    return resolve(getEnv().LOCAL_MEDIA_ROOT);
  }

  private get baseUrl(): string {
    return getEnv().LOCAL_MEDIA_BASE_URL.replace(/\/$/, '');
  }

  async upload(options: UploadFileOptions): Promise<string> {
    const dest = join(this.root, options.key);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, options.buffer);
    return `${this.baseUrl}/${options.key}`;
  }

  getSignedUrl(key: string): Promise<string> {
    return Promise.resolve(`${this.baseUrl}/${key}`);
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.root, key));
    } catch (err) {
      // 檔案不存在視為已刪除（冪等）；其餘錯誤照拋
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
