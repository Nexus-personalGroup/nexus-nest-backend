import { z } from 'zod';

export const listReportsQuerySchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'DISMISSED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

export const timelineQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export const reviewReportSchema = z.object({
  // PENDING 不在允許值中：回到待處理是「重新開啟」，語意不同且目前沒有這個需求。
  // 由 schema 擋在最外層，service 的檢查是第二道防線（直接呼叫 use case 時仍有效）
  status: z.enum(['REVIEWED', 'DISMISSED']),
  reviewNote: z.string().trim().max(500).optional(),
});

export type ReviewReportRequest = z.infer<typeof reviewReportSchema>;
