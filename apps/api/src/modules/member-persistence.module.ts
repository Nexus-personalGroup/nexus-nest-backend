import { Module } from '@nestjs/common';
import { PrismaMemberRepository } from '../adapter/out/persistence/member/PrismaMemberRepository';
import { LOAD_MEMBER_PORT } from '../application/port/out/member/LoadMemberPort';
import { SAVE_MEMBER_PORT } from '../application/port/out/member/SaveMemberPort';
import { LOAD_MEMBER_CONTEXT_PORT } from '../application/port/out/member/LoadMemberContextPort';
import { UPDATE_MEMBER_PASSWORD_PORT } from '../application/port/out/member/UpdateMemberPasswordPort';

/**
 * 帳號的持久層 out port。
 *
 * 不放在 `modules/admin/` 之下：out 側是前後台共用的，而模組的擺放位置就是它的歸屬宣告。
 * 前台要查帳號時若去 import `admin/member.module`，等於讓前台相依後台的模組樹——
 * 後台之後長出的東西會一起被拉進前台的啟動路徑。`side-isolation` 守則會擋下這件事。
 */
@Module({
  providers: [
    PrismaMemberRepository,
    { provide: LOAD_MEMBER_PORT, useExisting: PrismaMemberRepository },
    { provide: SAVE_MEMBER_PORT, useExisting: PrismaMemberRepository },
    { provide: LOAD_MEMBER_CONTEXT_PORT, useExisting: PrismaMemberRepository },
    {
      provide: UPDATE_MEMBER_PASSWORD_PORT,
      useExisting: PrismaMemberRepository,
    },
  ],
  exports: [
    LOAD_MEMBER_PORT,
    SAVE_MEMBER_PORT,
    LOAD_MEMBER_CONTEXT_PORT,
    UPDATE_MEMBER_PASSWORD_PORT,
  ],
})
export class MemberPersistenceModule {}
