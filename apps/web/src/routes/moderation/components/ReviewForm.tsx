import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DisabledHint } from '@/components/DisabledHint';
import {
  reviewFormSchema,
  type ReviewForm as ReviewFormValues,
} from '../lib/review-form-schema';

type ReviewFormProps = {
  /** 是否有 BACKEND:MODERATION:EDIT */
  canEdit: boolean;
  isSubmitting: boolean;
  defaultNote: string;
  onSubmit: (values: ReviewFormValues) => void;
};

/**
 * 判定表單
 *
 * 可選項只有「已處理」與「已駁回」——後端不接受回到 `PENDING`，
 * 提供一個必然被拒的選項只會製造挫折。已判定的檢舉仍可再次送出（終態間可更正）。
 */
export const ReviewForm = ({
  canEdit,
  isSubmitting,
  defaultNote,
  onSubmit,
}: ReviewFormProps) => {
  const form = useForm<ReviewFormValues>({
    resolver: standardSchemaResolver(reviewFormSchema),
    defaultValues: { status: 'REVIEWED', reviewNote: defaultNote },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>判定結果</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={!canEdit}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="REVIEWED">已處理</SelectItem>
                  <SelectItem value="DISMISSED">已駁回</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reviewNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>處理註記（選填，最多 500 字）</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={4}
                  disabled={!canEdit}
                  placeholder="記下判定的依據，供日後查閱"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DisabledHint reason={canEdit ? '' : '無處置權限'} side="top">
          <Button type="submit" disabled={!canEdit || isSubmitting}>
            送出判定
          </Button>
        </DisabledHint>
      </form>
    </Form>
  );
};
