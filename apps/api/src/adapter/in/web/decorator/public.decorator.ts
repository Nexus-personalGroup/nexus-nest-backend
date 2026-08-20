import { SetMetadata } from '@nestjs/common';

/** 標記為公開路由：全域 JwtAuthGuard 讀到此 metadata 會跳過認證 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
