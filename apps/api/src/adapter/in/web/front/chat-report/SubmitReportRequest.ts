import { z } from 'zod';

/** 補充說明的長度上限；與 DB 的 VarChar(500) 對齊 */
export const MAX_REPORT_DESCRIPTION = 500;

export const submitReportSchema = z.object({
  messageId: z.uuid(),
  reason: z.enum(['HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'OTHER']),
  description: z.string().trim().max(MAX_REPORT_DESCRIPTION).optional(),
});

export type SubmitReportRequest = z.infer<typeof submitReportSchema>;
