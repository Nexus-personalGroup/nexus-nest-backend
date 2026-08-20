import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

// React 19 仍需 class component 處理 render error；
// 攔截子樹 render 階段的拋錯，避免整個 app 白屏
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 開發階段印 stack 方便除錯；生產可改為送到 Sentry 等服務
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="flex max-w-md flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">發生未預期的錯誤</h2>
          <p className="text-muted-foreground text-sm">
            畫面渲染時拋出例外。請重試或重新整理頁面，若持續發生請聯絡管理員。
          </p>
          <pre className="bg-muted text-muted-foreground overflow-auto rounded p-2 text-xs">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <Button onClick={this.reset}>重試</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              重新整理
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
