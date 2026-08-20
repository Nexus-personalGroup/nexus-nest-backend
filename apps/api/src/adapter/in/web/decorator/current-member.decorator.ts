import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { MemberContext } from '@app/application/port/member-context';

export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MemberContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // member 由 JwtAuthGuard 保證設定；該 Guard 失敗時請求不會到達此處
    if (!request.member) {
      throw new Error('MemberContext 未設定，請確認 JwtAuthGuard 已套用');
    }
    return request.member;
  },
);
