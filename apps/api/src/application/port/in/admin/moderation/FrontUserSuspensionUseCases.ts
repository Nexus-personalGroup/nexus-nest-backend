export const SUSPEND_FRONT_USER_USE_CASE = 'SUSPEND_FRONT_USER_USE_CASE';
export const REINSTATE_FRONT_USER_USE_CASE = 'REINSTATE_FRONT_USER_USE_CASE';

export interface FrontUserSuspensionCommand {
  /** 被處置的**前台使用者**（`users`），不是後台管理員 */
  userId: string;
  /** 執行處置的管理員；由 MemberContext 帶入，不接受客戶端指定 */
  moderatorId: string;
}

/**
 * 停權一個前台使用者。
 *
 * **與帳號管理的 `UpdateMemberUseCase` 是兩支不同的 use case，不共用。**
 * 兩者停的是不同的東西：這裡停的是聊天的參與者（`users`），
 * 那裡停的是後台管理員（`members`）。
 *
 * 不用「同一支加一個側別參數」的做法：那會讓一支 use case 同時知道兩張表、
 * 兩種撤銷連線的方式、兩種稽核對象，而每個呼叫端都要記得傳對參數——
 * **傳錯的後果是停錯人，而那不會有任何錯誤訊息**。拆成兩支之後，
 * 停權的對象由「呼叫哪一支」決定，型別上就不可能停錯。
 */
export interface SuspendFrontUserUseCase {
  execute(command: FrontUserSuspensionCommand): Promise<void>;
}

/** 解除某前台使用者的停權。對象與拆分規則同 `SuspendFrontUserUseCase` */
export interface ReinstateFrontUserUseCase {
  execute(command: FrontUserSuspensionCommand): Promise<void>;
}
