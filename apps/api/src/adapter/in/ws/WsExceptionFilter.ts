import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { DomainException } from '@app/domain/exception/DomainException';
import { SERVER_EVENTS } from './events';

/** 送給客戶端的錯誤形狀。與 HTTP 的 `{ success, data, timestamp }` 外殼刻意不同——WS 沒有請求/回應配對 */
interface WsErrorPayload {
  code: string;
  message: string;
  /** 驗證失敗時的欄位明細 */
  errors?: { field: string; message: string }[];
}

/**
 * WebSocket 例外的統一出口
 *
 * 前一版專案在每個 handler 內手寫 `try / catch` 再 `return { success: false, error }`，
 * 15 個 handler 重複了 15 次，且錯誤形狀各自演化。集中在 filter 之後，
 * handler 只負責拋，形狀由這裡決定。
 *
 * **不得把非預期錯誤的訊息原樣送給客戶端**——SQL 片段與堆疊會經由 message 外流。
 * 只有 domain exception 與 HttpException 帶的是刻意面向客戶端的訊息。
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    client.emit(SERVER_EVENTS.ERROR, this.toPayload(exception));
  }

  /**
   * 把例外轉成可安全送出的形狀
   *
   * @param exception - 攔截到的例外
   * @returns 客戶端看得到的錯誤內容
   */
  private toPayload(exception: unknown): WsErrorPayload {
    if (exception instanceof DomainException) {
      return { code: exception.code, message: exception.message };
    }

    // ZodValidationPipe 與認證流程拋的都是 HttpException，其訊息本就設計給客戶端看
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const body = response as Record<string, unknown>;
        return {
          code: typeof body.code === 'string' ? body.code : 'BAD_REQUEST',
          message:
            typeof body.message === 'string' ? body.message : exception.message,
          errors: Array.isArray(body.errors)
            ? (body.errors as WsErrorPayload['errors'])
            : undefined,
        };
      }
      return { code: 'BAD_REQUEST', message: exception.message };
    }

    this.logger.error(
      `WebSocket 未預期錯誤: ${
        exception instanceof Error ? exception.message : String(exception)
      }`,
    );
    return {
      code: 'INTERNAL_ERROR',
      message: '伺服器發生錯誤，請稍後再試',
    };
  }
}
