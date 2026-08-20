import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import {
  SAVE_SYSTEM_LOG_PORT,
  SaveSystemLogPort,
} from '@app/application/port/out/shared/SaveSystemLogPort';
import { buildSystemLogData } from '../helper/system-log-helper';
import { getRequestStartTime } from '../helper/request-start-time';
import {
  DomainException,
  DomainExceptionKind,
} from '@app/domain/exception/DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';
import { ResponseMessages } from '@app/shared/constants/response-messages';

export interface ApiErrorResponse {
  success: false;
  message: string;
  code: string;
  timestamp: string;
}

// domain exception 的語意 kind → HTTP status。
// 新增 domain exception 時只需在該 exception 選一個 kind，此表與 filter 完全不用改。
const KIND_TO_STATUS: Record<DomainExceptionKind, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  INVALID: HttpStatus.BAD_REQUEST,
  CONFLICT: HttpStatus.CONFLICT,
  LOCKED: HttpStatus.LOCKED,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    @Inject(SAVE_SYSTEM_LOG_PORT)
    private readonly saveSystemLog: SaveSystemLogPort,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, code } = this.resolveError(exception);

    const now = new Date();
    const startTime = getRequestStartTime(request) ?? now;

    this.logger.error(
      message,
      exception instanceof Error ? exception.stack : String(exception),
    );

    // 僅上報未預期的 fallback 500；domain exception 與 HttpException 為可預期錯誤，不上報以免噪音。
    // Sentry 未啟用時 captureException 為 no-op。
    if (code === ResponseCodes.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception);
    }

    void this.saveSystemLog
      .saveSystemLog(
        buildSystemLogData(
          request,
          status,
          { statusCode: status, message },
          startTime,
          now,
          { action: '異常紀錄' },
        ),
      )
      .catch((err) =>
        this.logger.error(
          'Exception system log 寫入失敗',
          err instanceof Error ? err.stack : String(err),
        ),
      );

    const body: ApiErrorResponse = {
      success: false,
      message,
      code,
      timestamp: now.toISOString(),
    };

    response.status(status).json(body);
  }

  private resolveError(exception: unknown): {
    status: number;
    message: string;
    code: string;
  } {
    // 1. domain exception：以自帶的 kind → status、code 直接取用
    if (exception instanceof DomainException) {
      return {
        status: KIND_TO_STATUS[exception.kind],
        message: exception.message,
        code: exception.code,
      };
    }

    // 2. NestJS HttpException：透過 class name 自動轉 SCREAMING_SNAKE_CASE
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: exception.message,
        code: exception.constructor.name
          .replace('Exception', '')
          .replace(/([A-Z])/g, '_$1')
          .replace(/^_/, '')
          .toUpperCase(),
      };
    }

    // 3. 未預期錯誤：500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ResponseMessages.INTERNAL_SERVER_ERROR,
      code: ResponseCodes.INTERNAL_SERVER_ERROR,
    };
  }
}
