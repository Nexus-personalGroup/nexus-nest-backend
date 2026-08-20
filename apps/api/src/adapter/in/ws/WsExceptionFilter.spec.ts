import {
  ArgumentsHost,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsExceptionFilter } from './WsExceptionFilter';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';

const makeHost = () => {
  const emit = jest.fn();
  const client = { emit } as unknown as Socket;
  const host = {
    switchToWs: () => ({ getClient: () => client }),
  } as unknown as ArgumentsHost;
  return { host, emit };
};

describe('WsExceptionFilter', () => {
  let filter: WsExceptionFilter;

  beforeEach(() => {
    filter = new WsExceptionFilter();
  });

  it('domain exception → 送出業務錯誤碼與訊息', () => {
    const { host, emit } = makeHost();

    filter.catch(new AccountDisabledException(), host);

    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: expect.any(String) }),
    );
  });

  it('HttpException → 沿用其訊息（那本來就是給客戶端看的）', () => {
    const { host, emit } = makeHost();

    filter.catch(new UnauthorizedException('Token 已失效，請重新登入'), host);

    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ message: 'Token 已失效，請重新登入' }),
    );
  });

  it('驗證失敗 → 帶出欄位明細', () => {
    const { host, emit } = makeHost();
    // ZodValidationPipe 拋的形狀
    const exception = new BadRequestException({
      message: '資料驗證失敗',
      errors: [{ field: 'roomId', message: 'Required' }],
    });

    filter.catch(exception, host);

    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        message: '資料驗證失敗',
        errors: [{ field: 'roomId', message: 'Required' }],
      }),
    );
  });

  it('HttpException 的 response 是字串時仍給得出訊息', () => {
    const { host, emit } = makeHost();

    filter.catch(new BadRequestException('壞掉了'), host);

    const payload = emit.mock.calls[0][1] as { code: string; message: string };
    expect(payload.code).toBe('BAD_REQUEST');
    expect(payload.message).toBeTruthy();
  });

  // 這條是本 filter 存在的主要理由：非預期錯誤的訊息可能夾帶 SQL 片段或路徑，
  // 原樣送給客戶端等於把內部結構外洩
  it('非預期錯誤 → **不得**把原始訊息送給客戶端', () => {
    const { host, emit } = makeHost();
    const leaky = new Error(
      'duplicate key value violates unique constraint "members_email_key"',
    );

    filter.catch(leaky, host);

    const payload = emit.mock.calls[0][1] as { code: string; message: string };
    expect(payload.code).toBe('INTERNAL_ERROR');
    expect(payload.message).not.toContain('members_email_key');
  });

  it('拋出的不是 Error 物件時也不會自己爆掉', () => {
    const { host, emit } = makeHost();

    expect(() => filter.catch('字串例外', host)).not.toThrow();
    expect(emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    );
  });
});
