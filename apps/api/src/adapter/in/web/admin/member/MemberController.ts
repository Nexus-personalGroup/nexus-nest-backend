import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MemberFacade } from '@app/application/facade/admin/MemberFacade';
import { PermissionsGuard } from '../../guard/PermissionsGuard';
import { Permissions } from '../../decorator/permissions.decorator';
import {
  CurrentMember,
  MemberContext,
} from '../../decorator/current-member.decorator';
import { PermissionCode } from '@app/domain/value-object/Role';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { listMembersQuerySchema, ListMembersQuery } from './ListMembersQuery';
import {
  listRoleOptionsQuerySchema,
  ListRoleOptionsQueryDto,
} from './ListRoleOptionsQuery';
import { createMemberSchema, CreateMemberRequest } from './CreateMemberRequest';
import { updateMemberSchema, UpdateMemberRequest } from './UpdateMemberRequest';

@Controller('admin/members')
@UseGuards(PermissionsGuard)
export class MemberController {
  constructor(private readonly memberFacade: MemberFacade) {}

  @Get()
  @Permissions(PermissionCode.BACKEND_ACCOUNT_VIEW)
  listMembers(
    @Query(new ZodValidationPipe(listMembersQuerySchema))
    query: ListMembersQuery,
  ) {
    return this.memberFacade.listMembers(query);
  }

  @Get('role/options')
  @Permissions(PermissionCode.BACKEND_ACCOUNT_VIEW)
  listRoleOptions(
    @Query(new ZodValidationPipe(listRoleOptionsQuerySchema))
    query: ListRoleOptionsQueryDto,
  ) {
    return this.memberFacade.listRoleOptions(query);
  }

  // 注意：literal path 必須宣告在 `:id` 之前才不會被吃掉（Express 5 路由匹配順序）
  @Get('role/options/:id')
  @Permissions(PermissionCode.BACKEND_ACCOUNT_VIEW)
  getRoleOption(@Param('id', ParseUUIDPipe) id: string) {
    return this.memberFacade.getRoleOption(id);
  }

  @Get(':id')
  @Permissions(PermissionCode.BACKEND_ACCOUNT_VIEW)
  getMember(@Param('id', ParseUUIDPipe) id: string) {
    return this.memberFacade.getMember(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
  createMember(
    @Body(new ZodValidationPipe(createMemberSchema)) dto: CreateMemberRequest,
  ) {
    return this.memberFacade.createMember(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
  async updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) dto: UpdateMemberRequest,
    @CurrentMember() actor: MemberContext,
  ) {
    await this.memberFacade.updateMember({ id, actorId: actor.sub, ...dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
  async deleteMember(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentMember() actor: MemberContext,
  ) {
    await this.memberFacade.deleteMember({ id, actorId: actor.sub });
  }
}
