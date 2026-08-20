import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './GlobalExceptionFilter';
import { SaveSystemLogPort } from '@app/application/port/out/shared/SaveSystemLogPort';
import { EmailNotFoundException } from '@app/domain/exception/EmailNotFoundException';
import { AccountNotLockedException } from '@app/domain/exception/AccountNotLockedException';
import { IpListNotFoundException } from '@app/domain/exception/IpListNotFoundException';
import * as Sentry from '@sentry/nestjs';

// buildSystemLogData uses getEnv() internally
jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({ REDIS_KEY_PREFIX: 'test:', SERVICE_NAME: 'test' }),
}));

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const makeJson = () => jest.fn();
const makeStatus = (json: jest.Mock) => jest.fn().mockReturnValue({ json });

const makeHost = (): {
  host: ArgumentsHost;
  json: jest.Mock;
  status: jest.Mock;
} => {
  const json = makeJson();
  const status = makeStatus(json);
  const request = {
    method: 'GET',
    url: '/test',
    headers: {},
    body: {},
    query: {},
    ip: '127.0.0.1',
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
};

const mockSaveSystemLog: jest.Mocked<SaveSystemLogPort> = {
  saveSystemLog: jest.fn().mockResolvedValue(undefined),
};

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new GlobalExceptionFilter(mockSaveSystemLog);
  });

  describe('HTTP Exception → code 轉為 SNAKE_UPPER_CASE', () => {
    it('NotFoundException → 404, NOT_FOUND', () => {
      const { host, json, status } = makeHost();
      filter.catch(new NotFoundException('找不到'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      const body = (
        json.mock.calls[0] as [{ code: string; success: boolean }]
      )[0];
      expect(body.code).toBe('NOT_FOUND');
      expect(body.success).toBe(false);
    });

    it('ForbiddenException → 403, FORBIDDEN', () => {
      const { host, json, status } = makeHost();
      filter.catch(new ForbiddenException('禁止'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      const body = (json.mock.calls[0] as [{ code: string }])[0];
      expect(body.code).toBe('FORBIDDEN');
    });

    it('BadRequestException → 400, BAD_REQUEST', () => {
      const { host, json, status } = makeHost();
      filter.catch(new BadRequestException('格式錯誤'), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const body = (json.mock.calls[0] as [{ code: string }])[0];
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('UnauthorizedException → 401, UNAUTHORIZED', () => {
      const { host, json } = makeHost();
      filter.catch(new UnauthorizedException('未授權'), host);

      const body = (json.mock.calls[0] as [{ code: string }])[0];
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  it('非 HttpException → 500, INTERNAL_SERVER_ERROR', () => {
    const { host, json, status } = makeHost();
    filter.catch(new Error('unexpected'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = (json.mock.calls[0] as [{ code: string; message: string }])[0];
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.message).toBe('Internal server error');
  });

  describe('Sentry 上報', () => {
    it('未預期的 fallback 500 應上報', () => {
      const { host } = makeHost();
      filter.catch(new Error('unexpected'), host);

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('可預期的 domain exception 不應上報', () => {
      const { host } = makeHost();
      filter.catch(new EmailNotFoundException(), host);

      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('Domain exception 對映', () => {
    it('EmailNotFoundException → 404, EMAIL_NOT_FOUND', () => {
      const { host, json, status } = makeHost();
      filter.catch(new EmailNotFoundException(), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      const body = (
        json.mock.calls[0] as [{ code: string; message: string }]
      )[0];
      expect(body.code).toBe('EMAIL_NOT_FOUND');
      expect(body.message).toBe('找不到該 email 對應的帳號');
    });

    it('AccountNotLockedException → 409, ACCOUNT_NOT_LOCKED', () => {
      const { host, json, status } = makeHost();
      filter.catch(new AccountNotLockedException(), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      const body = (
        json.mock.calls[0] as [{ code: string; message: string }]
      )[0];
      expect(body.code).toBe('ACCOUNT_NOT_LOCKED');
      expect(body.message).toBe('帳號未處於鎖定狀態，無需解鎖');
    });

    it('IpListNotFoundException → 404, IP_LIST_NOT_FOUND', () => {
      const { host, json, status } = makeHost();
      filter.catch(new IpListNotFoundException(), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      const body = (
        json.mock.calls[0] as [{ code: string; message: string }]
      )[0];
      expect(body.code).toBe('IP_LIST_NOT_FOUND');
      expect(body.message).toBe('找不到該 IP 名單紀錄');
    });
  });

  it('response 結構包含 success:false 與 timestamp', () => {
    const { host, json } = makeHost();
    filter.catch(new NotFoundException(), host);

    const body = (
      json.mock.calls[0] as [{ success: boolean; timestamp: string }]
    )[0];
    expect(body.success).toBe(false);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
