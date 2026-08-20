import { SetMetadata } from '@nestjs/common';

export const MEMBER_SCOPED_KEY = 'memberScoped';

/**
 * 宣告：本端點對任何已認證成員開放，資源層級的授權由 application 層的 use case 負責。
 *
 * 這是前台的授權表態方式。後台用 `@Permissions` / `@Roles`——RBAC 能回答
 * 「這個角色可不可以做這件事」；前台的問題不同，它問的是「這個人是不是這個房間的成員」，
 * 那是每筆資源各自不同的答案，權限碼表達不了。
 *
 * **它不是「免授權」的意思。** 標了它仍必須有一個 use case 真的做成員資格判斷；
 * 這個裝飾器只是讓「我決定了授權在哪一層」變成程式碼裡看得見的宣告，
 * 而不是一個沒有人記得檢查的空白。守則限制它只能出現在 `web/front/` 之下，
 * 避免它變成後台繞過 RBAC 的萬用通行證。
 */
export const MemberScoped = () => SetMetadata(MEMBER_SCOPED_KEY, true);
