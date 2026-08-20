import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import {
  SAVE_SYSTEM_LOG_PORT,
  SaveSystemLogPort,
} from '@app/application/port/out/shared/SaveSystemLogPort';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import { buildSystemLogData } from '../helper/system-log-helper';
import { setRequestStartTime } from '../helper/request-start-time';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(
    @Inject(SAVE_SYSTEM_LOG_PORT)
    private readonly saveSystemLog: SaveSystemLogPort,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const startTime = new Date();

    // 記錄起始時間，讓 GlobalExceptionFilter 在錯誤路徑也能計算 execTime
    setRequestStartTime(request, startTime);

    return next.handle().pipe(
      tap((responseData) => {
        if (!this.featureFlags.isEnabled('apiLogEnabled')) return;

        const responseTime = new Date();
        const response = context.switchToHttp().getResponse<Response>();

        // fire-and-forget：system log 不阻塞 response
        void this.saveSystemLog
          .saveSystemLog(
            buildSystemLogData(
              request,
              response.statusCode,
              responseData,
              startTime,
              responseTime,
            ),
          )
          .catch((err) =>
            this.logger.error(
              'System log 寫入失敗',
              err instanceof Error ? err.stack : String(err),
            ),
          );
      }),
    );
  }
}
