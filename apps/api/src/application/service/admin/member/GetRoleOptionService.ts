import { Inject, Injectable } from '@nestjs/common';
import {
  GET_ROLE_OPTION_USE_CASE,
  GetRoleOptionUseCase,
} from '../../../port/in/admin/member/GetRoleOptionUseCase';
import { RoleOptionItem } from '../../../port/in/admin/member/ListRoleOptionsUseCase';
import {
  LOAD_ROLE_PORT,
  LoadRolePort,
} from '../../../port/out/role/LoadRolePort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';

export { GET_ROLE_OPTION_USE_CASE };

@Injectable()
export class GetRoleOptionService implements GetRoleOptionUseCase {
  constructor(
    @Inject(LOAD_ROLE_PORT)
    private readonly loadRole: LoadRolePort,
  ) {}

  async execute(id: string): Promise<RoleOptionItem> {
    const role = await this.loadRole.findActiveRoleOption(id);
    if (!role) throw new RoleNotFoundException();
    return role;
  }
}
