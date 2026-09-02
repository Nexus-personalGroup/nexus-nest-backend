import { Inject, Injectable } from '@nestjs/common';
import {
  ADD_IP_BLACKLIST_USE_CASE,
  ADD_IP_WHITELIST_USE_CASE,
  AddIpBlacklistCommand,
  AddIpBlacklistUseCase,
  AddIpWhitelistCommand,
  AddIpWhitelistUseCase,
  GET_IP_BLACKLIST_USE_CASE,
  GET_IP_WHITELIST_USE_CASE,
  GetIpBlacklistUseCase,
  GetIpWhitelistUseCase,
  LIST_IP_BLACKLIST_USE_CASE,
  LIST_IP_WHITELIST_USE_CASE,
  ListIpBlacklistUseCase,
  ListIpListQuery,
  ListIpListResult,
  ListIpWhitelistUseCase,
  REMOVE_IP_BLACKLIST_USE_CASE,
  REMOVE_IP_WHITELIST_USE_CASE,
  RemoveIpBlacklistUseCase,
  RemoveIpWhitelistUseCase,
  UNLOCK_ACCOUNT_USE_CASE,
  UnlockAccountUseCase,
  UPDATE_IP_BLACKLIST_USE_CASE,
  UPDATE_IP_WHITELIST_USE_CASE,
  UpdateIpBlacklistCommand,
  UpdateIpBlacklistUseCase,
  UpdateIpWhitelistCommand,
  UpdateIpWhitelistUseCase,
  LIST_ACCOUNT_LOCKS_USE_CASE,
  ListAccountLocksQuery,
  ListAccountLocksResult,
  ListAccountLocksUseCase,
} from '../../port/in/admin/security/SecurityUseCases';
import {
  IpBlacklistItem,
  IpListItem,
} from '../../port/out/security/IpListPort';

/**
 * 安全管理 Facade：IP 黑白名單 CRUD + 帳號鎖定列表 + 帳號解鎖。
 * Facade 只負責把 controller 的呼叫分派到對應 use case，不放任何 domain 邏輯
 */
@Injectable()
export class SecurityFacade {
  constructor(
    @Inject(LIST_ACCOUNT_LOCKS_USE_CASE)
    private readonly listAccountLocksUseCase: ListAccountLocksUseCase,
    @Inject(LIST_IP_WHITELIST_USE_CASE)
    private readonly listIpWhitelist: ListIpWhitelistUseCase,
    @Inject(ADD_IP_WHITELIST_USE_CASE)
    private readonly addIpWhitelist: AddIpWhitelistUseCase,
    @Inject(REMOVE_IP_WHITELIST_USE_CASE)
    private readonly removeIpWhitelist: RemoveIpWhitelistUseCase,
    @Inject(LIST_IP_BLACKLIST_USE_CASE)
    private readonly listIpBlacklist: ListIpBlacklistUseCase,
    @Inject(ADD_IP_BLACKLIST_USE_CASE)
    private readonly addIpBlacklist: AddIpBlacklistUseCase,
    @Inject(REMOVE_IP_BLACKLIST_USE_CASE)
    private readonly removeIpBlacklist: RemoveIpBlacklistUseCase,
    @Inject(UNLOCK_ACCOUNT_USE_CASE)
    private readonly unlockAccountUseCase: UnlockAccountUseCase,
    @Inject(GET_IP_WHITELIST_USE_CASE)
    private readonly getIpWhitelistUseCase: GetIpWhitelistUseCase,
    @Inject(UPDATE_IP_WHITELIST_USE_CASE)
    private readonly updateIpWhitelistUseCase: UpdateIpWhitelistUseCase,
    @Inject(GET_IP_BLACKLIST_USE_CASE)
    private readonly getIpBlacklistUseCase: GetIpBlacklistUseCase,
    @Inject(UPDATE_IP_BLACKLIST_USE_CASE)
    private readonly updateIpBlacklistUseCase: UpdateIpBlacklistUseCase,
  ) {}

  listWhitelist(
    params: ListIpListQuery,
  ): Promise<ListIpListResult<IpListItem>> {
    return this.listIpWhitelist.execute(params);
  }

  addToWhitelist(command: AddIpWhitelistCommand): Promise<{ id: string }> {
    return this.addIpWhitelist.execute(command);
  }

  removeFromWhitelist(id: string): Promise<void> {
    return this.removeIpWhitelist.execute(id);
  }

  getWhitelist(id: string): Promise<IpListItem> {
    return this.getIpWhitelistUseCase.execute(id);
  }

  updateWhitelist(command: UpdateIpWhitelistCommand): Promise<void> {
    return this.updateIpWhitelistUseCase.execute(command);
  }

  listBlacklist(
    params: ListIpListQuery,
  ): Promise<ListIpListResult<IpBlacklistItem>> {
    return this.listIpBlacklist.execute(params);
  }

  addToBlacklist(command: AddIpBlacklistCommand): Promise<{ id: string }> {
    return this.addIpBlacklist.execute(command);
  }

  removeFromBlacklist(id: string): Promise<void> {
    return this.removeIpBlacklist.execute(id);
  }

  getBlacklist(id: string): Promise<IpBlacklistItem> {
    return this.getIpBlacklistUseCase.execute(id);
  }

  updateBlacklist(command: UpdateIpBlacklistCommand): Promise<void> {
    return this.updateIpBlacklistUseCase.execute(command);
  }

  unlockAccount(email: string): Promise<void> {
    return this.unlockAccountUseCase.execute(email);
  }

  listAccountLocks(
    query: ListAccountLocksQuery,
  ): Promise<ListAccountLocksResult> {
    return this.listAccountLocksUseCase.execute(query);
  }
}
