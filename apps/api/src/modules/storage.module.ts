import { Module } from '@nestjs/common';
import { S3FileStorageAdapter } from '../adapter/out/storage/S3FileStorageAdapter';
import { LocalFileStorageAdapter } from '../adapter/out/storage/LocalFileStorageAdapter';
import { FILE_STORAGE_PORT } from '../application/port/out/shared/FileStoragePort';
import { getEnv } from '../infrastructure/validate-env';

/**
 * 檔案儲存模組：依 `STORAGE_DRIVER` 切換 local / s3（預設 local，dev / 衍生專案免 AWS）。
 * 兩個 adapter 都註冊，factory 依 env 綁其一到 `FILE_STORAGE_PORT`；呼叫端只認 port。
 */
@Module({
  providers: [
    S3FileStorageAdapter,
    LocalFileStorageAdapter,
    {
      provide: FILE_STORAGE_PORT,
      useFactory: (s3: S3FileStorageAdapter, local: LocalFileStorageAdapter) =>
        getEnv().STORAGE_DRIVER === 's3' ? s3 : local,
      inject: [S3FileStorageAdapter, LocalFileStorageAdapter],
    },
  ],
  exports: [FILE_STORAGE_PORT],
})
export class StorageModule {}
