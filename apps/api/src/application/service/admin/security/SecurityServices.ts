import { Inject, Injectable } from '@nestjs/common';
import { FeatureFlagService } from '../../shared/FeatureFlagService';
import {
  IP_LIST_PORT,
  IpBlacklistItem,
  IpListItem,
  IpListPort,
} from '../../../port/out/security/IpListPort';
import {
  ACCOUNT_LOCK_PORT,
  AccountLockPort,
} from '../../../port/out/auth/AccountLockPort';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  AddIpBlacklistCommand,
  AddIpBlacklistUseCase,
  AddIpWhitelistCommand,
  AddIpWhitelistUseCase,
  GetIpBlacklistUseCase,
  GetIpWhitelistUseCase,
  ListAccountLocksQuery,
  ListAccountLocksResult,
  ListAccountLocksUseCase,
  ListIpBlacklistUseCase,
  ListIpListQuery,
  ListIpListResult,
  ListIpWhitelistUseCase,
  RemoveIpBlacklistUseCase,
  RemoveIpWhitelistUseCase,
  UnlockAccountUseCase,
  UpdateIpBlacklistCommand,
  UpdateIpBlacklistUseCase,
  UpdateIpWhitelistCommand,
  UpdateIpWhitelistUseCase,
} from '../../../port/in/admin/security/SecurityUseCases';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';
import { EmailNotFoundException } from '@app/domain/exception/EmailNotFoundException';
import { AccountNotLockedException } from '@app/domain/exception/AccountNotLockedException';
import { IpListNotFoundException } from '@app/domain/exception/IpListNotFoundException';

// ── IP 白名單 ────────────────────────────────

@Injectable()
export class ListIpWhitelistService implements ListIpWhitelistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  async execute(query: ListIpListQuery): Promise<ListIpListResult<IpListItem>> {
    const { page, limit } = getPagination(query);
    const search = query.search?.trim() || undefined;
    const { list, total } = await this.ipList.listWhitelist({
      page,
      limit,
      search,
    });
    return { list, meta: buildPaginationMeta(page, limit, total) };
  }
}

@Injectable()
export class AddIpWhitelistService implements AddIpWhitelistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  execute(command: AddIpWhitelistCommand): Promise<{ id: string }> {
    return this.ipList.addToWhitelist(
      command.ip,
      command.description,
      command.createdBy,
    );
  }
}

@Injectable()
export class RemoveIpWhitelistService implements RemoveIpWhitelistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  execute(id: string): Promise<void> {
    return this.ipList.removeWhitelist(id);
  }
}

@Injectable()
export class GetIpWhitelistService implements GetIpWhitelistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  async execute(id: string): Promise<IpListItem> {
    const record = await this.ipList.findWhitelistById(id);
    if (!record) throw new IpListNotFoundException();
    return record;
  }
}

@Injectable()
export class UpdateIpWhitelistService implements UpdateIpWhitelistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  execute(command: UpdateIpWhitelistCommand): Promise<void> {
    return this.ipList.updateWhitelist(command.id, {
      description: command.description,
    });
  }
}

// ── IP 黑名單 ────────────────────────────────

@Injectable()
export class ListIpBlacklistService implements ListIpBlacklistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  async execute(
    query: ListIpListQuery,
  ): Promise<ListIpListResult<IpBlacklistItem>> {
    const { page, limit } = getPagination(query);
    const search = query.search?.trim() || undefined;
    const { list, total } = await this.ipList.listBlacklist({
      page,
      limit,
      search,
    });
    return { list, meta: buildPaginationMeta(page, limit, total) };
  }
}

@Injectable()
export class AddIpBlacklistService implements AddIpBlacklistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  execute(command: AddIpBlacklistCommand): Promise<{ id: string }> {
    return this.ipList.addToBlacklist(
      command.ip,
      command.reason,
      false,
      command.createdBy,
    );
  }
}

@Injectable()
export class RemoveIpBlacklistService implements RemoveIpBlacklistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  execute(id: string): Promise<void> {
    return this.ipList.removeBlacklist(id);
  }
}

@Injectable()
export class GetIpBlacklistService implements GetIpBlacklistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  async execute(id: string): Promise<IpBlacklistItem> {
    const record = await this.ipList.findBlacklistById(id);
    if (!record) throw new IpListNotFoundException();
    return record;
  }
}

@Injectable()
export class UpdateIpBlacklistService implements UpdateIpBlacklistUseCase {
  constructor(@Inject(IP_LIST_PORT) private readonly ipList: IpListPort) {}

  execute(command: UpdateIpBlacklistCommand): Promise<void> {
    return this.ipList.updateBlacklist(command.id, {
      reason: command.reason,
    });
  }
}

// ── 帳號解鎖 ─────────────────────────────────

@Injectable()
export class UnlockAccountService implements UnlockAccountUseCase {
  constructor(
    @Inject(LOAD_MEMBER_PORT) private readonly loadMember: LoadMemberPort,
    @Inject(ACCOUNT_LOCK_PORT) private readonly accountLock: AccountLockPort,
  ) {}

  async execute(email: string): Promise<void> {
    // 1. 確認 email 對應的 member 存在
    const member = await this.loadMember.loadMemberByEmail(email);
    if (!member) throw new EmailNotFoundException();

    // 2. 確認帳號真的鎖著（避免靜默通過正常帳號的解鎖請求）
    // 只有「仍在時效內」才算鎖著：已到期的帳號下次登入就會自動放行，
    // 對它執行解鎖是一個沒有效果的操作，靜默通過會讓管理員以為自己做了什麼
    const lockStatus = await this.accountLock.checkLock(email);
    if (lockStatus !== 'LOCKED') throw new AccountNotLockedException();

    // 3. 解鎖（同時重置 failedLoginCount）
    await this.accountLock.unlockAccount(email);
  }
}

/**
 * 帳號鎖定列表。
 *
 * 到期判定不在這裡——它住在 `AccountLockPort` 的實作，與登入路徑共用同一份規則。
 * 本 service 只負責分頁預設值與 `status` 的預設（見下）。
 */
@Injectable()
export class ListAccountLocksService implements ListAccountLocksUseCase {
  constructor(
    @Inject(ACCOUNT_LOCK_PORT) private readonly accountLock: AccountLockPort,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async execute(query: ListAccountLocksQuery): Promise<ListAccountLocksResult> {
    const { page, limit } = getPagination(query);
    // 預設只看「鎖定中」：打開這一頁的人問的是「現在有誰被鎖著」。
    // 已到期但尚未被清除的紀錄要靠 status=expired / all 才查得到
    const { list, total } = await this.accountLock.listLocks({
      page,
      limit,
      search: query.search?.trim() || undefined,
      status: query.status ?? 'locked',
    });
    return {
      list,
      meta: buildPaginationMeta(page, limit, total),
      // flag 關閉時系統不會產生任何鎖定紀錄——呼叫端必須分得出
      // 「沒有人被鎖」與「根本不會鎖」
      lockEnabled: this.featureFlags.isEnabled('accountLockEnabled'),
    };
  }
}
