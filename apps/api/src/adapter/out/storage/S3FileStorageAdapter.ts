import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  FileStoragePort,
  UploadFileOptions,
} from '../../../application/port/out/shared/FileStoragePort';
import { getEnv } from '../../../infrastructure/validate-env';

@Injectable()
export class S3FileStorageAdapter implements FileStoragePort, OnModuleInit {
  private readonly logger = new Logger(S3FileStorageAdapter.name);
  private client: S3Client | null = null;
  private bucket: string | null = null;
  private publicUrl = '';

  onModuleInit(): void {
    const env = getEnv();
    const {
      AWS_REGION: region,
      AWS_ACCESS_KEY_ID: accessKeyId,
      AWS_SECRET_ACCESS_KEY: secretAccessKey,
    } = env;
    this.bucket = env.AWS_S3_BUCKET ?? null;

    if (!region || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.debug('[S3] AWS 憑證未設定，檔案上傳功能將無法使用');
      return;
    }

    this.publicUrl = env.AWS_MEDIA_LIBRARY_ROOT ?? '';
    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.logger.debug('[S3] S3 Client 初始化完成');
  }

  async upload(options: UploadFileOptions): Promise<string> {
    const { client, bucket } = this.requireReady();

    // abortSignal 逾時：S3 無回應時中止請求，避免拖住連線池
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: options.key,
        Body: options.buffer,
        ContentType: options.mimeType,
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );

    return `${this.publicUrl}/${options.key}`;
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const { client, bucket } = this.requireReady();

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    const { client, bucket } = this.requireReady();

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10000),
    });
  }

  /**
   * 取得已初始化的 client 與 bucket；未初始化時拋錯
   * 用回傳型別代替 `!`，讓 TypeScript narrow 為 non-null
   */
  private requireReady(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new Error('S3 Client 未初始化');
    }
    return { client: this.client, bucket: this.bucket };
  }
}
