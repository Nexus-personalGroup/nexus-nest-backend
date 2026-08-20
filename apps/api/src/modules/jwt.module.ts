import { Module } from '@nestjs/common';
import { JwtModule as NestJwtModule } from '@nestjs/jwt';
import { getEnv } from '../infrastructure/validate-env';

@Module({
  imports: [
    NestJwtModule.registerAsync({
      useFactory: () => {
        const env = getEnv();
        return {
          secret: env.ACCESS_SECRET,
          // issuer/audience 設於 module：各處 sign/verify 即使帶 per-call options
          // （secret、expiresIn）仍會 merge 這兩個值，確保簽發與驗證一致並防跨服務重放
          signOptions: {
            expiresIn: env.ACCESS_TOKEN_EXPIRES_IN, // 秒（jsonwebtoken 純數字 = 秒）
            issuer: env.JWT_ISSUER,
            audience: env.JWT_AUDIENCE,
          },
          verifyOptions: {
            issuer: env.JWT_ISSUER,
            audience: env.JWT_AUDIENCE,
          },
        };
      },
    }),
  ],
  exports: [NestJwtModule],
})
export class JwtModule {}
