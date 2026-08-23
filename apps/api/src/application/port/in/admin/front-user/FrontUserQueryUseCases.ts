import type { PaginationMeta } from '@app/infrastructure/pagination';
import type {
  UserDetailDto,
  UserSummaryDto,
} from '@app/application/port/out/user/LoadUserPort';

export const LIST_FRONT_USERS_USE_CASE = 'LIST_FRONT_USERS_USE_CASE';
export const GET_FRONT_USER_USE_CASE = 'GET_FRONT_USER_USE_CASE';

export interface ListFrontUsersQuery {
  page?: number;
  limit?: number;
  email?: string;
  displayName?: string;
  /** 啟用狀態；undefined 表示不過濾 */
  status?: boolean;
  /** 信箱驗證狀態；undefined 表示不過濾 */
  verified?: boolean;
}

export interface ListFrontUsersResult {
  list: UserSummaryDto[];
  meta: PaginationMeta;
}

/**
 * 後台的前台使用者列表。
 *
 * 視圖型別直接沿用 out port 的 `UserSummaryDto`，不另外定義一份：
 * 這裡沒有任何補齊或跨表拼裝（審閱側補 email 才需要），
 * 多一層同形狀的型別只會讓兩邊的欄位各自漂移。
 */
export interface ListFrontUsersUseCase {
  execute(query: ListFrontUsersQuery): Promise<ListFrontUsersResult>;
}

/**
 * 後台的前台使用者詳情——回答的是「這個**帳號**是什麼狀態」。
 *
 * 與審閱側的 `GetMemberProfileUseCase` 是兩支，各自回答不同的問題：
 * 那一支回答「這個**人**在聊天裡做了什麼」，且刻意只回八個欄位、不含帳號資料。
 * 合併會讓 `BACKEND:MODERATION:VIEW` 看得到 `lastSeenAt` 之類的東西。
 */
export interface GetFrontUserUseCase {
  execute(userId: string): Promise<UserDetailDto>;
}
