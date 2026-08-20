export interface UploadFileOptions {
  key: string;
  buffer: Buffer;
  mimeType: string;
}

export const FILE_STORAGE_PORT = 'FILE_STORAGE_PORT';

export interface FileStoragePort {
  upload(options: UploadFileOptions): Promise<string>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
