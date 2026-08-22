import type { paths } from '@app/api-client';

import { useApiQuery } from '@/api/client';
import type { RoomType } from '../lib/moderation-display';

type RoomsData = NonNullable<
  paths['/moderation/rooms']['get']['responses'][200]['content']['application/json']['data']
>;

export type AdminRoomRow = RoomsData['list'][number];

/** 房間詳情的資料形狀 */
export type RoomDetail = NonNullable<
  paths['/moderation/rooms/{roomId}']['get']['responses'][200]['content']['application/json']['data']
>;

export type RoomMemberRow = RoomDetail['members'][number];

/**
 * 取聊天室列表
 *
 * @param params - 分頁與類型篩選；`roomType` 為 undefined 表示不篩選
 */
export const useRoomsQuery = (params: {
  page: number;
  limit: number;
  roomType: RoomType | undefined;
}) =>
  useApiQuery('GET', '/moderation/rooms', {
    params: {
      query: {
        page: params.page,
        limit: params.limit,
        ...(params.roomType ? { roomType: params.roomType } : {}),
      },
    },
  });

/**
 * 取單一聊天室的概覽
 *
 * 與檢舉詳情不同，**這支不寫稽核**：回應不含任何訊息內容。
 *
 * @param roomId - 房間 ID；空字串時不發請求
 */
export const useRoomDetailQuery = (roomId: string) =>
  useApiQuery(
    'GET',
    '/moderation/rooms/{roomId}',
    { params: { path: { roomId } } },
    { enabled: Boolean(roomId) },
  );
