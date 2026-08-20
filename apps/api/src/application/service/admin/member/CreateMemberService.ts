import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  CREATE_MEMBER_USE_CASE,
  CreateMemberCommand,
  CreateMemberResult,
  CreateMemberUseCase,
} from '../../../port/in/admin/member/CreateMemberUseCase';
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
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { Member } from '@app/domain/model/Member';
import { Email } from '@app/domain/value-object/Email';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';

export const BCRYPT_ROUNDS = 'BCRYPT_ROUNDS';
export { CREATE_MEMBER_USE_CASE };

@Injectable()
export class CreateMemberService implements CreateMemberUseCase {
  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(SAVE_MEMBER_PORT)
    private readonly saveMember: SaveMemberPort,
    @Inject(LOAD_ROLE_PORT)
    private readonly loadRole: LoadRolePort,
    @Inject(BCRYPT_ROUNDS)
    private readonly bcryptRounds: number,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  async execute(command: CreateMemberCommand): Promise<CreateMemberResult> {
    if (await this.loadMember.existsByEmail(command.email)) {
      throw new EmailAlreadyExistsException();
    }
    const role = await this.loadRole.findRoleById(command.roleId);
    if (!role) throw new RoleNotFoundException();

    this.passwordPolicy.validateOrThrow(command.password, role.roleCode);
    const passwordHash = await bcrypt.hash(command.password, this.bcryptRounds);

    const member = Member.create(
      Email.of(command.email),
      command.member,
      passwordHash,
      command.roleId,
      command.status ?? true,
    );
    await this.saveMember.createMember(member);
    return { id: member.id.toString() };
  }
}
