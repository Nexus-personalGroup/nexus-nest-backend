import { sanitize, sanitizeUrl } from './sanitize';

describe('sanitize', () => {
  it('遮蔽 camelCase 的 accessToken / refreshToken', () => {
    const result = sanitize({
      accessToken: 'eyJ.aaa.bbb',
      refreshToken: 'eyJ.ccc.ddd',
      member: { id: 'm1', email: 'a@b.c' },
    });

    const parsed = JSON.parse(result);
    expect(parsed.accessToken).toBe('[REDACTED]');
    expect(parsed.refreshToken).toBe('[REDACTED]');
    expect(parsed.member.id).toBe('m1');
    expect(parsed.member.email).toBe('a@b.c');
  });

  it('遮蔽 snake_case 的 access_token / refresh_token', () => {
    const parsed = JSON.parse(
      sanitize({ access_token: 'x', refresh_token: 'y' }),
    );
    expect(parsed.access_token).toBe('[REDACTED]');
    expect(parsed.refresh_token).toBe('[REDACTED]');
  });

  it('遮蔽 password / passwordHash / authorization / cookie / apiKey', () => {
    const parsed = JSON.parse(
      sanitize({
        password: 'p',
        passwordHash: 'h',
        Authorization: 'Bearer x',
        cookie: 'session=abc',
        apiKey: 'k',
      }),
    );
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.passwordHash).toBe('[REDACTED]');
    expect(parsed.Authorization).toBe('[REDACTED]');
    expect(parsed.cookie).toBe('[REDACTED]');
    expect(parsed.apiKey).toBe('[REDACTED]');
  });

  // 曾經漏遮：SENSITIVE_KEYS 用精確比對時，reset-password 的 newPassword
  // 會以明文寫進 system_logs.request。改成子字串比對後，整類變形一次收斂。
  it.each([
    'newPassword',
    'oldPassword',
    'confirmPassword',
    'passwordConfirmation',
    'user_password',
    'current-password',
  ])('遮蔽 password 的變形欄位：%s', (key) => {
    const parsed: unknown = JSON.parse(sanitize({ [key]: 'MyS3cret!' }));
    expect((parsed as Record<string, unknown>)[key]).toBe('[REDACTED]');
  });

  it.each([
    'accessToken',
    'refresh_token',
    'idToken',
    'api-key',
    'privateKey',
    'clientSecret',
    'credentials',
  ])('遮蔽 token / 金鑰類的變形欄位：%s', (key) => {
    const parsed: unknown = JSON.parse(sanitize({ [key]: 'value' }));
    expect((parsed as Record<string, unknown>)[key]).toBe('[REDACTED]');
  });

  it('不誤遮非敏感欄位', () => {
    const parsed: unknown = JSON.parse(
      sanitize({
        email: 'a@b.c',
        member: '王小明',
        roleId: 'r1',
        status: true,
      }),
    );
    const obj = parsed as Record<string, unknown>;
    expect(obj.email).toBe('a@b.c');
    expect(obj.member).toBe('王小明');
    expect(obj.roleId).toBe('r1');
    expect(obj.status).toBe(true);
  });

  it('將 base64 圖片資料替換為標記', () => {
    const parsed = JSON.parse(
      sanitize({ avatar: 'data:image/png;base64,abc==' }),
    );
    expect(parsed.avatar).toBe('[BASE64_IMAGE_REMOVED]');
  });

  it('遇到 file / files 欄位替換為標記', () => {
    const parsed = JSON.parse(sanitize({ file: { name: 'x' }, files: [] }));
    expect(parsed.file).toBe('[FILE_DATA_REMOVED]');
    expect(parsed.files).toBe('[FILE_DATA_REMOVED]');
  });

  it('循環參考時回傳穩定字串', () => {
    type Cyclic = { a: number; self?: Cyclic };
    const obj: Cyclic = { a: 1 };
    obj.self = obj;
    expect(sanitize(obj)).toBe('[Unserializable data]');
  });
});

describe('sanitizeUrl', () => {
  it('遮蔽 email / phone / name / token / key query 參數', () => {
    expect(sanitizeUrl('/members?email=a@b.c&page=1')).toBe(
      '/members?email=[REDACTED]&page=1',
    );
    expect(sanitizeUrl('/x?token=abc&phone=09&name=A')).toBe(
      '/x?token=[REDACTED]&phone=[REDACTED]&name=[REDACTED]',
    );
  });

  it('沒 query 直接回傳原 URL', () => {
    expect(sanitizeUrl('/members')).toBe('/members');
  });
});
