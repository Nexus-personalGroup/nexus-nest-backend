import { Module } from '@nestjs/common';
import { PrismaUserRepository } from '../adapter/out/persistence/user/PrismaUserRepository';
import { LOAD_USER_PORT } from '../application/port/out/user/LoadUserPort';
import { SAVE_USER_PORT } from '../application/port/out/user/SaveUserPort';

/**
 * 前台使用者的持久層 out port。
 *
 * 與 `MemberPersistenceModule` 同樣的理由不放在 `modules/front/` 之下：
 * out 側是共用的，而模組的擺放位置就是它的歸屬宣告。日後後台的審閱功能
 * 要查前台使用者時（`migrate-chat-to-front-users`），指向這裡才不會讓後台
 * 相依前台的模組樹。
 */
@Module({
  providers: [
    PrismaUserRepository,
    { provide: LOAD_USER_PORT, useExisting: PrismaUserRepository },
    { provide: SAVE_USER_PORT, useExisting: PrismaUserRepository },
  ],
  exports: [LOAD_USER_PORT, SAVE_USER_PORT],
})
export class UserPersistenceModule {}
