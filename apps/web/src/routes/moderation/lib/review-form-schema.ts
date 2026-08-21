import { z } from 'zod';

/**
 * 判定表單。
 *
 * **沒有 `PENDING` 這個選項**——後端的 schema 也不接受（回到待處理是「重新開啟」，
 * 語意不同且目前沒有這個需求）。前端提供一個必然被拒的選項只會製造挫折。
 *
 * 註記上限 500 字與後端一致；不一致的話使用者會打完一整段才被伺服器打回。
 */
export const reviewFormSchema = z.object({
  status: z.enum(['REVIEWED', 'DISMISSED']),
  reviewNote: z.string().trim().max(500, '處理註記最多 500 字'),
});

export type ReviewForm = z.infer<typeof reviewFormSchema>;
