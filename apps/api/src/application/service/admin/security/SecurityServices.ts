import { Inject, Injectable } from '@nestjs/common';
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
    const locked = await this.accountLock.isLocked(email);
    if (!locked) throw new AccountNotLockedException();

    // 3. 解鎖（同時重置 failedLoginCount）
    await this.accountLock.unlockAccount(email);
  }
}
