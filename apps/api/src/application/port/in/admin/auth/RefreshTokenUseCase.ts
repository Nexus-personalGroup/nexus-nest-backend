export interface RefreshTokenCommand {
  refreshToken: string;
  /** 客戶端 IP */
  ip?: string;
  /** User-Agent */
  userAgent?: string;
}

export interface RefreshTokenResult {
  /** 新的 Access Token */
  accessToken: string;
  /** Access Token 絕對有效期（秒） */
  accessTokenExpiresIn: number;
  /** 新的 Refresh Token（rotation：每次 refresh 雙換新，舊 refresh 進黑名單） */
  refreshToken: string;
  /** Refresh Token 絕對有效期（秒） */
  refreshTokenExpiresIn: number;
}

export const REFRESH_TOKEN_USE_CASE = 'REFRESH_TOKEN_USE_CASE';

export interface RefreshTokenUseCase {
  execute(command: RefreshTokenCommand): Promise<RefreshTokenResult>;
}
