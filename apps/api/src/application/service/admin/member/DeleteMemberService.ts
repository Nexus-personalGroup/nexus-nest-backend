import { Inject, Injectable } from '@nestjs/common';
import {
  DELETE_MEMBER_USE_CASE,
  DeleteMemberCommand,
  DeleteMemberUseCase,
} from '../../../port/in/admin/member/DeleteMemberUseCase';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  SAVE_MEMBER_PORT,
  SaveMemberPort,
} from '../../../port/out/member/SaveMemberPort';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import { CannotDeleteSelfException } from '@app/domain/exception/CannotDeleteSelfException';
import { DefaultMemberNotDeletableException } from '@app/domain/exception/DefaultMemberNotDeletableException';

export { DELETE_MEMBER_USE_CASE };

@Injectable()
export class DeleteMemberService implements DeleteMemberUseCase {
  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(SAVE_MEMBER_PORT)
    private readonly saveMember: SaveMemberPort,
  ) {}

  async execute(command: DeleteMemberCommand): Promise<void> {
    if (command.id === command.actorId) throw new CannotDeleteSelfException();

    const member = await this.loadMember.loadMemberById(command.id);
    if (!member) throw new MemberNotFoundException();
    if (member.isDefault) throw new DefaultMemberNotDeletableException();

    await this.saveMember.deleteMember(command.id);
  }
}
