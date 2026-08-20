export interface LoginCommand {
  email: string;
  password: string;
  /** 用戶端 IP（用於 auth log、IP 封鎖） */
  ip?: string;
  /** User-Agent（用於 auth log） */
  userAgent?: string;
  /** reCAPTCHA token（用於 reCAPTCHA 驗證） */
  recaptchaToken?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  /** Access Token 絕對有效期（秒） */
  accessTokenExpiresIn: number;
  /** Refresh Token 絕對有效期（秒） */
  refreshTokenExpiresIn: number;
  member: {
    id: string;
    email: string;
    member: string;
    roleName: string;
  };
}

export const LOGIN_USE_CASE = 'LOGIN_USE_CASE';

export interface LoginUseCase {
  execute(command: LoginCommand): Promise<LoginResult>;
}
