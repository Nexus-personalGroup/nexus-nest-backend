import { UserContext } from '@app/application/port/user-context';

export const FRONT_LOGIN_USE_CASE = 'FRONT_LOGIN_USE_CASE';
export const FRONT_REFRESH_TOKEN_USE_CASE = 'FRONT_REFRESH_TOKEN_USE_CASE';
export const FRONT_LOGOUT_USE_CASE = 'FRONT_LOGOUT_USE_CASE';
export const RESOLVE_USER_CONTEXT_USE_CASE = 'RESOLVE_USER_CONTEXT_USE_CASE';
export const GET_FRONT_PROFILE_USE_CASE = 'GET_FRONT_PROFILE_USE_CASE';

/** 登入回應中的使用者摘要。**刻意不含 tokenVersion 與 password** */
export interface FrontUserSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  /**
   * 信箱是否已驗證。
   *
   * 登入回應必須帶它——未驗證的帳號登得進來但聊不了天，
   * 客戶端要據此決定是引導去聊天室還是引導去收驗證信。
   * 少了它，前台只能等第一次聊天請求被 403 才知道。
   */
  emailVerified: boolean;
}

export interface FrontTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface FrontLoginResult extends FrontTokenPair {
  user: FrontUserSummary;
}

export interface FrontLoginCommand {
  email: string;
  password: string;
}

export interface FrontLoginUseCase {
  execute(command: FrontLoginCommand): Promise<FrontLoginResult>;
}

export interface FrontRefreshTokenUseCase {
  execute(refreshToken: string): Promise<FrontLoginResult>;
}

export interface FrontLogoutUseCase {
  execute(accessToken: string): Promise<void>;
}

/**
 * token → UserContext 的單一判定。
 *
 * 與後台的 `ResolveMemberContextUseCase` **平行而非共用**：共用一支再用參數分流，
 * 會讓「前台的解析要不要查權限」這種問題每次都要重新想一遍。
 */
export interface ResolveUserContextUseCase {
  resolve(token: string): Promise<UserContext>;
}

/** `/api/front/me` 的回應。不含 password / tokenVersion / 任何後台概念 */
export interface FrontProfile extends FrontUserSummary {
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface GetFrontProfileUseCase {
  execute(userId: string): Promise<FrontProfile>;
}
