import { Controller, Get, Sse, UseGuards } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import {
  DashboardSnapshot,
  GetDashboardSnapshotUseCase,
  GET_DASHBOARD_SNAPSHOT_USE_CASE,
} from '@app/application/port/in/admin/dashboard/DashboardUseCases';
import { Inject } from '@nestjs/common';
import { PermissionCode } from '@app/domain/value-object/Role';
import { PermissionsGuard } from '../../guard/PermissionsGuard';
import { Permissions } from '../../decorator/permissions.decorator';
import { DashboardStream } from './DashboardStream';

/** SSE 的訊息形狀；Nest 的 `@Sse()` 會把 `data` 序列化成 `data: <json>` */
interface SnapshotEvent {
  data: DashboardSnapshot;
}

/**
 * 營運總覽。
 *
 * 獨立成一支 controller 而非併進 `ModerationController`：SSE 的回應形狀
 * 與既有的 REST 完全不同（長連線、無 `{ success, data, timestamp }` 外殼），
 * 混在一起會讓「這支到底回什麼」變得要逐個看。
 *
 * 沿用 `BACKEND:MODERATION:VIEW`——「能看聊天營運」就是這個權限的意思。
 * 新增一個 `DASHBOARD:VIEW` 要動 seed 與所有既有角色，
 * 換來的是一個沒有人會單獨授予的權限。
 */
@Controller('admin/moderation/dashboard')
@UseGuards(PermissionsGuard)
export class DashboardController {
  constructor(
    @Inject(GET_DASHBOARD_SNAPSHOT_USE_CASE)
    private readonly getSnapshot: GetDashboardSnapshotUseCase,
    private readonly stream: DashboardStream,
  ) {}

  @Get()
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  snapshot(): Promise<DashboardSnapshot> {
    return this.getSnapshot.execute();
  }

  /**
   * 快照的持續推送。
   *
   * 回應不套 `{ success, data, timestamp }` 外殼——SSE 的每一筆是獨立的事件，
   * 而外殼是為了「一次請求一次回應」設計的。
   */
  @Sse('stream')
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  stream$(): Observable<SnapshotEvent> {
    return this.stream.subscribe().pipe(map((data) => ({ data })));
  }
}
