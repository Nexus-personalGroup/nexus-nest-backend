import { Inject, Injectable } from '@nestjs/common';
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
  CLEAR_MEMBER_CONTEXT_PORT,
  ClearMemberContextPort,
} from '../../../port/out/member/ClearMemberContextPort';
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { Email } from '@app/domain/value-object/Email';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { CannotDisableSelfException } from '@app/domain/exception/CannotDisableSelfException';
import { DefaultMemberNotEditableException } from '@app/domain/exception/DefaultMemberNotEditableException';
import { BCRYPT_ROUNDS } from './CreateMemberService';

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
    @Inject(CLEAR_MEMBER_CONTEXT_PORT)
    private readonly clearMemberContext: ClearMemberContextPort,
    @Inject(BCRYPT_ROUNDS)
    private readonly bcryptRounds: number,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

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

    await this.clearMemberContext.clearMemberContext(command.id);
  }
}
