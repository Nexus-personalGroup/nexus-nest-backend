import { Inject, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  UPDATE_MEMBER_USE_CASE,
  UpdateMemberCommand,
  UpdateMemberUseCase,
} from '../../../port/in/admin/member/UpdateMemberUseCase';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  SAVE_MEMBER_PORT,
  SaveMemberPort,
} from '../../../port/out/member/SaveMemberPort';
import {
  LOAD_ROLE_PORT,
  LoadRolePort,
} from '../../../port/out/role/LoadRolePort';
import {
  MEMBER_CONTEXT_CACHE_PORT,
  MemberContextCachePort,
} from '../../../port/out/member/MemberContextCachePort';
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { Email } from '@app/domain/value-object/Email';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { CannotDisableSelfException } from '@app/domain/exception/CannotDisableSelfException';
import { DefaultMemberNotEditableException } from '@app/domain/exception/DefaultMemberNotEditableException';
import { BCRYPT_ROUNDS } from './CreateMemberService';
import {
  REVOKE_MEMBER_SESSIONS_USE_CASE,
  RevokeMemberSessionsUseCase,
} from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';

export { UPDATE_MEMBER_USE_CASE };

@Injectable()
export class UpdateMemberService implements UpdateMemberUseCase {
  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(SAVE_MEMBER_PORT)
    private readonly saveMember: SaveMemberPort,
    @Inject(LOAD_ROLE_PORT)
    private readonly loadRole: LoadRolePort,
    @Inject(MEMBER_CONTEXT_CACHE_PORT)
    private readonly memberContextCache: MemberContextCachePort,
    @Inject(BCRYPT_ROUNDS)
    private readonly bcryptRounds: number,
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(REVOKE_MEMBER_SESSIONS_USE_CASE)
    private readonly revokeSessions: RevokeMemberSessionsUseCase,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  private readonly logger = new Logger(UpdateMemberService.name);

  async execute(command: UpdateMemberCommand): Promise<void> {
    if (command.id === command.actorId && command.status === false) {
      throw new CannotDisableSelfException();
    }

    const member = await this.loadMember.loadMemberDomainById(command.id);
    if (!member) throw new MemberNotFoundException();

    if (member.isDefault) throw new DefaultMemberNotEditableException();

    // email 唯一性檢查僅在實際提供時做
    if (
      command.email !== undefined &&
      (await this.loadMember.existsByEmail(command.email, command.id))
    ) {
      throw new EmailAlreadyExistsException();
    }

    // role 存在性檢查僅在實際提供時做
    let roleCodeForPolicy: string | null | undefined;
    if (command.roleId !== undefined) {
      const role = await this.loadRole.findRoleById(command.roleId);
      if (!role) throw new RoleNotFoundException();
      roleCodeForPolicy = role.roleCode;
    }

    // 密碼政策驗證在 DB 寫入前完成，確保任一驗證失敗時不留下部分更新狀態。
    // 若改密碼但未換角色，需用 member 現況 roleId 查 roleCode 套對應強度規則
    let passwordHash: string | undefined;
    if (typeof command.password === 'string' && command.password.length > 0) {
      if (roleCodeForPolicy === undefined) {
        const currentRole = await this.loadRole.findRoleById(member.roleId);
        roleCodeForPolicy = currentRole?.roleCode ?? null;
      }
      this.passwordPolicy.validateOrThrow(command.password, roleCodeForPolicy);
      passwordHash = await bcrypt.hash(command.password, this.bcryptRounds);
    }

    if (command.email !== undefined) {
      member.changeEmail(Email.of(command.email));
    }

    // member / roleId 共用 updateProfile：缺哪一個就用 domain 現況補
    if (command.member !== undefined || command.roleId !== undefined) {
      member.updateProfile(
        command.member ?? member.member,
        command.roleId ?? member.roleId,
      );
    }

    // 記下轉換的方向：只有「真的從啟用轉為停用」才需要撤銷連線與寫稽核，
    // 對已停用的帳號重複送 status: false 不該重複做這些事
    const wasActive = member.status;
    const statusChanged =
      command.status !== undefined && command.status !== wasActive;

    if (command.status !== undefined) {
      if (command.status) {
        member.activate();
      } else {
        member.deactivate();
      }
    }

    if (passwordHash !== undefined) {
      await this.saveMember.saveMemberWithPassword(member, passwordHash);
    } else {
      await this.saveMember.updateMember(member);
    }

    await this.memberContextCache.clearByMemberId(command.id);

    if (statusChanged) {
      // 清快取只讓「下一次請求」被擋下，既有的 WebSocket 連線不受影響——
      // 連線層的認證只在 handshake 執行一次。不主動撤銷的話，
      // 被停用的人只要連線還開著就能繼續送訊息
      if (command.status === false) {
        await this.revokeSessions.execute(command.id);
      }

      await this.audit
        .record({
          memberId: command.actorId,
          action: command.status ? 'MEMBER_REINSTATED' : 'MEMBER_SUSPENDED',
          targetMemberId: command.id,
        })
        .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));
    }
  }
}
