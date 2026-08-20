import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useApiMutation } from '@/api/client';
import { tokenStorage } from '@/lib/storage';

const loginSchema = z.object({
  email: z.string().min(1, '請輸入電子郵件').email('電子郵件格式不正確'),
  password: z.string().min(1, '請輸入密碼'),
});

type LoginForm = z.infer<typeof loginSchema>;

type LocationState = {
  from?: { pathname: string };
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loginMutation = useApiMutation('POST', '/auth/login');

  const form = useForm<LoginForm>({
    resolver: standardSchemaResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // 已登入則直接回首頁，避免重複登入
  if (tokenStorage.get()) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (values: LoginForm) => {
    setSubmitError(null);
    try {
      const res = await loginMutation.mutateAsync({ body: values });
      if (res?.accessToken) {
        tokenStorage.set(res.accessToken);
        if (res.refreshToken) {
          tokenStorage.setRefresh(res.refreshToken);
        }
        // 換帳號要清掉前一個使用者的 query cache（/me、permissions、list 等），
        // 否則直到 staleTime 過期才會重抓，使用者會看到前一個身分的資料
        queryClient.clear();
        const from =
          (location.state as LocationState | null)?.from?.pathname ?? '/';
        navigate(from, { replace: true });
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message || '登入失敗，請稍後再試'
          : '登入失敗，請稍後再試',
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>登入管理後台</CardTitle>
          <CardDescription>請輸入您的帳號與密碼</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>電子郵件</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密碼</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {submitError && (
                <p className="text-destructive text-sm">{submitError}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={
                  loginMutation.isPending || form.formState.isSubmitting
                }
              >
                {loginMutation.isPending ? '登入中…' : '登入'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};
