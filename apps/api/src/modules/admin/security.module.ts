import { Global, Module } from '@nestjs/common';
import { SecurityController } from '../../adapter/in/web/admin/security/SecurityController';
import { SecurityFacade } from '../../application/facade/admin/SecurityFacade';
import { PrismaAccountLockAdapter } from '../../adapter/out/persistence/auth/PrismaAccountLockAdapter';
import { PrismaIpListRepository } from '../../adapter/out/persistence/security/PrismaIpListRepository';
import { IpWhitelistBootstrapCheck } from '../../application/service/admin/security/IpWhitelistBootstrapCheck';
import { RedisIpBlockAdapter } from '../../adapter/out/redis/RedisIpBlockAdapter';
import { ACCOUNT_LOCK_PORT } from '../../application/port/out/auth/AccountLockPort';
import { IP_BLOCK_PORT } from '../../application/port/out/security/IpBlockPort';
import { IP_LIST_PORT } from '../../application/port/out/security/IpListPort';
import {
  ADD_IP_BLACKLIST_USE_CASE,
  ADD_IP_WHITELIST_USE_CASE,
  GET_IP_BLACKLIST_USE_CASE,
  GET_IP_WHITELIST_USE_CASE,
  LIST_IP_BLACKLIST_USE_CASE,
  LIST_IP_WHITELIST_USE_CASE,
  REMOVE_IP_BLACKLIST_USE_CASE,
  REMOVE_IP_WHITELIST_USE_CASE,
  LIST_ACCOUNT_LOCKS_USE_CASE,
  UNLOCK_ACCOUNT_USE_CASE,
  UPDATE_IP_BLACKLIST_USE_CASE,
  UPDATE_IP_WHITELIST_USE_CASE,
} from '../../application/port/in/admin/security/SecurityUseCases';
import {
  AddIpBlacklistService,
  AddIpWhitelistService,
  GetIpBlacklistService,
  GetIpWhitelistService,
  ListIpBlacklistService,
  ListIpWhitelistService,
  RemoveIpBlacklistService,
  RemoveIpWhitelistService,
  ListAccountLocksService,
  UnlockAccountService,
  UpdateIpBlacklistService,
  UpdateIpWhitelistService,
} from '../../application/service/admin/security/SecurityServices';
import { JwtModule } from '../jwt.module';
import { MetricsModule } from '../metrics.module';
import { MemberModule } from './member.module';

/**
 * @Global() — 安全相關 Port 全域可用。
 * 提供帳號鎖定、IP 封鎖、IP 黑白名單等安全功能的 Adapter。
 * 同時提供 SecurityController（Admin CRUD API）。
 */
@Global()
@Module({
  imports: [JwtModule, MemberModule, MetricsModule],
  controllers: [SecurityController],
  providers: [
    PrismaAccountLockAdapter,
    { provide: ACCOUNT_LOCK_PORT, useExisting: PrismaAccountLockAdapter },
    PrismaIpListRepository,
    { provide: IP_LIST_PORT, useExisting: PrismaIpListRepository },
    RedisIpBlockAdapter,
    { provide: IP_BLOCK_PORT, useExisting: RedisIpBlockAdapter },
    // Security use cases
    { provide: LIST_IP_WHITELIST_USE_CASE, useClass: ListIpWhitelistService },
    { provide: ADD_IP_WHITELIST_USE_CASE, useClass: AddIpWhitelistService },
    {
      provide: REMOVE_IP_WHITELIST_USE_CASE,
      useClass: RemoveIpWhitelistService,
    },
    { provide: LIST_IP_BLACKLIST_USE_CASE, useClass: ListIpBlacklistService },
    { provide: ADD_IP_BLACKLIST_USE_CASE, useClass: AddIpBlacklistService },
    {
      provide: REMOVE_IP_BLACKLIST_USE_CASE,
      useClass: RemoveIpBlacklistService,
    },
    {
      provide: LIST_ACCOUNT_LOCKS_USE_CASE,
      useClass: ListAccountLocksService,
    },
    { provide: UNLOCK_ACCOUNT_USE_CASE, useClass: UnlockAccountService },
    { provide: GET_IP_WHITELIST_USE_CASE, useClass: GetIpWhitelistService },
    {
      provide: UPDATE_IP_WHITELIST_USE_CASE,
      useClass: UpdateIpWhitelistService,
    },
    { provide: GET_IP_BLACKLIST_USE_CASE, useClass: GetIpBlacklistService },
    {
      provide: UPDATE_IP_BLACKLIST_USE_CASE,
      useClass: UpdateIpBlacklistService,
    },
    SecurityFacade,
    IpWhitelistBootstrapCheck,
  ],
  exports: [ACCOUNT_LOCK_PORT, IP_LIST_PORT, IP_BLOCK_PORT],
})
export class SecurityModule {}
