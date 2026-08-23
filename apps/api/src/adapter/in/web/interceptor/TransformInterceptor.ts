import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

/** NestJS 內部 @Render() 使用的 metadata key */
const RENDER_METADATA = '__renderTemplate__';
/** NestJS 內部 @Redirect() 使用的 metadata key */
const REDIRECT_METADATA = '__redirect__';

export interface ApiSuccessResponse<T> {
  success: true;
  message?: string;
  data?: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | T> {
    // @Render 路由回傳的是 view context，不可被 wrap 否則 template 拿到的結構會錯
    const renderTemplate = this.reflector.get<string>(
      RENDER_METADATA,
      context.getHandler(),
    );
    if (renderTemplate) {
      return next.handle();
    }

    // @Redirect 同理：Nest 讀的是回傳值的 `url`，包成 { success, data } 之後
    // 它就找不到了——結果是狀態碼對、**Location header 卻是空的**，
    // 而瀏覽器停在一個空白頁上，沒有任何錯誤。信箱驗證那支端點踩過這個坑
    const redirect = this.reflector.get<unknown>(
      REDIRECT_METADATA,
      context.getHandler(),
    );
    if (redirect) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        ...(data !== null && data !== undefined && { data }),
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
