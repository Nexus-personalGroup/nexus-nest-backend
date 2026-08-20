import { existsSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createMockRedis } from '../setup/test-app';
import { resetDb, seedMember } from '../helpers/db';
import {
  expectUnauthorized,
  expectApiError,
  describeUnauthorized,
} from '../helpers/assertions';
import { ResponseCodes } from '@app/shared/constants/response-codes';

// 走真 test DB + local storage driver（LOCAL_MEDIA_ROOT 指向 tmp，見 setup-env.e2e）。
const ADMIN_EMAIL = 'admin@test.com';
const PASSWORD = 'TestPass123!';
// 最小 PNG 檔頭當測試檔（內容不重要，MIME 由 contentType 決定）
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

describe('Attachment E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  const mockRedis = createMockRedis();

  const upload = () =>
    request(app.getHttpServer())
      .post('/api/admin/attachments')
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.isTokenBlacklisted.mockResolvedValue(false);
    mockRedis.throttleIncrement.mockResolvedValue(1);
    await resetDb(prisma);
    await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      permissionCodes: ['BACKEND:ATTACHMENT:EDIT'],
    });
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    token = (res.body as { data: { accessToken: string } }).data.accessToken;
  });

  // 未授權存取:guard 在查資料前就擋下,故 :id 用固定 uuid 即可
  describe('未授權存取', () => {
    describeUnauthorized(() => app, 'post', '/api/admin/attachments');
    describeUnauthorized(
      () => app,
      'delete',
      `/api/admin/attachments/${MISSING_ID}`,
    );
  });

  it('上傳合法 PNG → 201 + { id, url }，落庫 + 本機寫檔 + 檔名 latin1→utf8', async () => {
    const res = await upload()
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: '頭貼.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    const { id, url } = (res.body as { data: { id: string; url: string } })
      .data;
    expect(url).toMatch(/^\/media\/avatars\/.+\.png$/);

    const row = await prisma.attachmentRecord.findUnique({ where: { id } });
    expect(row?.fileType).toBe('image/png');
    expect(row?.fileName).toBe('頭貼.png');
    expect(row?.relatedTable).toBe('members');

    // 本機檔案已寫入（key = url 尾兩段）
    const key = url.split('/').slice(-2).join('/');
    const mediaRoot = process.env.LOCAL_MEDIA_ROOT ?? '';
    expect(existsSync(join(mediaRoot, key))).toBe(true);
  });

  // 白名單放行（宣告 image/png）但內容是 HTML——**唯一能證明 magic byte 那道
  // 檢查真的接在鏈上的案例**。少了它，把 sniffMime 整段刪掉全部測試仍會全綠。
  it('宣告 image/png 但內容是 HTML → 400（magic byte 攔截）', async () => {
    const res = await upload()
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });

    expectApiError(res, 400, ResponseCodes.INVALID_UPLOAD);
    expect(await prisma.attachmentRecord.count()).toBe(0);
  });

  it('不允許的 MIME（text/html）→ 400', async () => {
    const res = await upload()
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', Buffer.from('<script>'), {
        filename: 'x.html',
        contentType: 'text/html',
      });

    expect(res.status).toBe(400);
  });

  it('不允許的 folder → 400', async () => {
    const res = await upload()
      .field('folder', 'evil')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('無 JWT → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/attachments')
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

    expectUnauthorized(res);
  });

  it('DELETE 存在 → 204 且紀錄刪除', async () => {
    const up = await upload()
      .field('folder', 'avatars')
      .field('relatedTable', 'members')
      .field('relatedId', 'm-1')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    const id = (up.body as { data: { id: string } }).data.id;

    const del = await request(app.getHttpServer())
      .delete(`/api/admin/attachments/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(del.status).toBe(204);
    const row = await prisma.attachmentRecord.findUnique({ where: { id } });
    expect(row).toBeNull();
  });

  it('DELETE 不存在 → 404', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/admin/attachments/${MISSING_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expectApiError(res, 404, ResponseCodes.ATTACHMENT_NOT_FOUND);
  });

  // 兩層授權各自要有測試釘住：權限碼擋「有沒有資格碰附件」，
  // 擁有者檢查擋「有資格的 A 刪掉 B 的附件」。少任一層都是任何已登入者可刪任何附件。
  describe('授權', () => {
    /** 建一個沒有附件權限的帳號並取得 token */
    const loginAs = async (
      email: string,
      permissionCodes: string[],
      roleCode?: string,
    ): Promise<string> => {
      await seedMember(prisma, {
        email,
        password: PASSWORD,
        roleName: `role-${email}`,
        roleCode,
        permissionCodes,
      });
      const res = await request(app.getHttpServer())
        .post('/api/admin/auth/login')
        .send({ email, password: PASSWORD });
      return (res.body as { data: { accessToken: string } }).data.accessToken;
    };

    const uploadOne = async (bearer: string): Promise<string> => {
      const up = await request(app.getHttpServer())
        .post('/api/admin/attachments')
        .set('Authorization', `Bearer ${bearer}`)
        .field('folder', 'attachments')
        .field('relatedTable', 'members')
        .field('relatedId', 'm1')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
      return (up.body as { data: { id: string } }).data.id;
    };

    it('無 BACKEND:ATTACHMENT:EDIT → 上傳 403', async () => {
      const other = await loginAs('noperm@test.com', ['BACKEND:ACCOUNT:VIEW']);

      const res = await request(app.getHttpServer())
        .post('/api/admin/attachments')
        .set('Authorization', `Bearer ${other}`)
        .field('folder', 'attachments')
        .field('relatedTable', 'members')
        .field('relatedId', 'm1')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

      expect(res.status).toBe(403);
    });

    it('有權限但非上傳者 → 刪除 403，附件仍在', async () => {
      const id = await uploadOne(token);
      const other = await loginAs('other@test.com', [
        'BACKEND:ATTACHMENT:EDIT',
      ]);

      const res = await request(app.getHttpServer())
        .delete(`/api/admin/attachments/${id}`)
        .set('Authorization', `Bearer ${other}`);

      expectApiError(res, 403, ResponseCodes.ATTACHMENT_FORBIDDEN);
      expect(
        await prisma.attachmentRecord.findUnique({ where: { id } }),
      ).not.toBeNull();
    });

    it('非上傳者但為 SUPERADMIN → 刪除成功', async () => {
      const id = await uploadOne(token);
      const su = await loginAs(
        'su@test.com',
        ['BACKEND:ATTACHMENT:EDIT'],
        'SUPERADMIN',
      );

      const res = await request(app.getHttpServer())
        .delete(`/api/admin/attachments/${id}`)
        .set('Authorization', `Bearer ${su}`);

      expect(res.status).toBe(204);
      expect(
        await prisma.attachmentRecord.findUnique({ where: { id } }),
      ).toBeNull();
    });
  });
});
