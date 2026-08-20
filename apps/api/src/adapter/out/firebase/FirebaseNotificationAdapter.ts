import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import {
  PushNotificationPayload,
  SendNotificationPort,
  SendNotificationResult,
} from '../../../application/port/out/shared/SendNotificationPort';
import { getEnv } from '../../../infrastructure/validate-env';

@Injectable()
export class FirebaseNotificationAdapter
  implements SendNotificationPort, OnModuleInit
{
  private readonly logger = new Logger(FirebaseNotificationAdapter.name);
  private app: admin.app.App | null = null;

  onModuleInit(): void {
    const env = getEnv();
    const {
      FCM_CLIENT_EMAIL: clientEmail,
      FCM_PRIVATE_KEY: privateKey,
      FCM_PROJECT_ID: projectId,
    } = env;

    if (!clientEmail || !privateKey || !projectId) {
      this.logger.debug('[FCM] 憑證未設定，推播功能將無法使用');
      return;
    }

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          projectId,
        }),
      });
      this.logger.debug('[FCM] Firebase Admin 初始化完成');
    } catch (error) {
      this.logger.error('[FCM] Firebase Admin 初始化失敗', error);
    }
  }

  async sendPush(
    fcmToken: string,
    payload: PushNotificationPayload,
  ): Promise<SendNotificationResult> {
    if (!this.app) {
      throw new Error('Firebase Admin 未初始化');
    }

    try {
      // FCM SDK 不支援 AbortSignal，以 Promise.race 加 10 秒逾時上限，避免無限等待
      const sendPromise = this.app.messaging().send({
        token: fcmToken,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      });
      const result = await Promise.race([
        sendPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('FCM 推播逾時')), 10000),
        ),
      ]);

      return { success: true, result };
    } catch (error) {
      const code =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : undefined;
      const isExpired =
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered';

      if (isExpired) return { success: false, expired: true };

      throw error;
    }
  }
}
