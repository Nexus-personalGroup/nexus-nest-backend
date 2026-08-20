import { Controller, Get } from '@nestjs/common';
import { MemberFacade } from '@app/application/facade/admin/MemberFacade';
import { CurrentMember } from '../../decorator/current-member.decorator';
import { MemberContext } from '@app/application/port/member-context';

@Controller('admin/me')
export class ProfileController {
  constructor(private readonly memberFacade: MemberFacade) {}

  @Get()
  getProfile(@CurrentMember() actor: MemberContext) {
    return this.memberFacade.getMyProfile(actor.sub);
  }
}
