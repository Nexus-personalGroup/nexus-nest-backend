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

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        ...(data !== null && data !== undefined && { data }),
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
