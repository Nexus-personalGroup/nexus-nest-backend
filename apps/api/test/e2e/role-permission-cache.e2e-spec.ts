import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { createE2EApp, createStatefulMockRedis } from '../setup/test-app';
import { ensurePermissions, resetDb, seedMember } from '../helpers/db';
import { expectForbidden } from '../helpers/assertions';

/**
 * 走真 test DB + **有狀態的** Redis mock。
 *
 * 有狀態是這支 spec 的前提：`createMockRedis()` 的 `get` 永遠回 null，
 * MemberContext 快取因此永遠不會命中，「撤銷權限之後還通不通」在那個 mock
 * 之下不修也會過——測試會是空的。
 */
const ADMIN_EMAIL = 'role-admin@example.com';
const VICTIM_EMAIL = 'victim@example.com';
const BYSTANDER_EMAIL = 'bystander@example.com';
const PASSWORD = 'TestPass123!';

/** 管理員自己要改得動角色 */
const ADMIN_PERMS = ['BACKEND:ROLE:VIEW', 'BACKEND:ROLE:EDIT'];
/** 受測者的權限：看得到帳號列表 */
const VIEW_ACCOUNT = 'BACKEND:ACCOUNT:VIEW';

describe('角色權限變更與 MemberContext 快取一致性 E2E', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const mockRedis = createStatefulMockRedis();

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ email, password: PASSWORD });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

  const listAccounts = (token: string) =>
    request(app.getHttpServer())
      .get('/api/admin/members')
      .set('Authorization', `Bearer ${token}`);

  const patchRole = (
    token: string,
    roleId: string,
    body: Record<string, unknown>,
  ) =>
    request(app.getHttpServer())
      .patch(`/api/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  /** 該成員的 MemberContext 快取 key（前綴由 setup-env.e2e 設為 test:） */
  const cacheKey = (memberId: string): string => `test:member:${memberId}`;

  beforeAll(async () => {
    ({ app } = await createE2EApp({ redis: mockRedis }));
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockRedis.store.clear();
    await resetDb(prisma);
  });

  it('撤銷權限後，同一個 token 的下一個請求就被擋（不必等快取過期）', async () => {
    await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: 'admin',
      permissionCodes: ADMIN_PERMS,
    });
    const victim = await seedMember(prisma, {
      email: VICTIM_EMAIL,
      password: PASSWORD,
      roleName: 'viewer',
      permissionCodes: [VIEW_ACCOUNT],
    });

    const adminToken = await login(ADMIN_EMAIL);
    const victimToken = await login(VICTIM_EMAIL);

    // 先成功打一次，讓 MemberContext 進快取
    expect((await listAccounts(victimToken)).status).toBe(200);
    expect(mockRedis.store.has(cacheKey(victim.memberId))).toBe(true);

    // 把權限從他的角色移除
    const patched = await patchRole(adminToken, victim.roleId, {
      permissionCodes: [],
    });
    expect(patched.status).toBe(204);

    // 同一個 token，下一個請求就要被擋
    expectForbidden(await listAccounts(victimToken));
  });

  it('授予權限後，同一個 token 立即可用（不必重新登入）', async () => {
    await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: 'admin',
      permissionCodes: ADMIN_PERMS,
    });
    // 先給一個用不到的權限：角色至少要有東西才登得進來
    const promoted = await seedMember(prisma, {
      email: VICTIM_EMAIL,
      password: PASSWORD,
      roleName: 'nobody',
      permissionCodes: ['BACKEND:MODERATION:VIEW'],
    });

    // 待授予的權限本身要先存在於 permissions 表，否則 PATCH 會被
    // INVALID_PERMISSION_CODE 擋成 400——這裡沒有任何人一開始就帶著它
    await ensurePermissions(prisma, [VIEW_ACCOUNT]);

    const adminToken = await login(ADMIN_EMAIL);
    const promotedToken = await login(VICTIM_EMAIL);

    // 先打一次被擋，順便讓舊的 MemberContext 進快取
    expectForbidden(await listAccounts(promotedToken));
    expect(mockRedis.store.has(cacheKey(promoted.memberId))).toBe(true);

    const patched = await patchRole(adminToken, promoted.roleId, {
      permissionCodes: [VIEW_ACCOUNT],
    });
    expect(patched.status).toBe(204);

    expect((await listAccounts(promotedToken)).status).toBe(200);
  });

  // 一律清（design D6）：MemberContext 也帶 roleName，只是目前沒有端點吐出來，
  // 因此在快取層驗——這正是「只在 permissionCodes 有給時才清」會踩到的那條線
  it('只改名稱也清快取', async () => {
    await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: 'admin',
      permissionCodes: ADMIN_PERMS,
    });
    const member = await seedMember(prisma, {
      email: VICTIM_EMAIL,
      password: PASSWORD,
      roleName: 'viewer',
      permissionCodes: [VIEW_ACCOUNT],
    });

    const adminToken = await login(ADMIN_EMAIL);
    const memberToken = await login(VICTIM_EMAIL);

    expect((await listAccounts(memberToken)).status).toBe(200);
    expect(mockRedis.store.has(cacheKey(member.memberId))).toBe(true);

    const patched = await patchRole(adminToken, member.roleId, {
      name: '檢視人員',
    });
    expect(patched.status).toBe(204);

    expect(mockRedis.store.has(cacheKey(member.memberId))).toBe(false);
  });

  it('不影響其他角色的成員', async () => {
    await seedMember(prisma, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      roleName: 'admin',
      permissionCodes: ADMIN_PERMS,
    });
    const victim = await seedMember(prisma, {
      email: VICTIM_EMAIL,
      password: PASSWORD,
      roleName: 'viewer-a',
      permissionCodes: [VIEW_ACCOUNT],
    });
    const bystander = await seedMember(prisma, {
      email: BYSTANDER_EMAIL,
      password: PASSWORD,
      roleName: 'viewer-b',
      permissionCodes: [VIEW_ACCOUNT],
    });

    const adminToken = await login(ADMIN_EMAIL);
    const victimToken = await login(VICTIM_EMAIL);
    const bystanderToken = await login(BYSTANDER_EMAIL);

    expect((await listAccounts(victimToken)).status).toBe(200);
    expect((await listAccounts(bystanderToken)).status).toBe(200);

    await patchRole(adminToken, victim.roleId, { permissionCodes: [] });

    // 被改的那個角色：快取清掉且權限已失效
    expectForbidden(await listAccounts(victimToken));
    // 另一個角色：快取還在，權限也還在
    expect(mockRedis.store.has(cacheKey(bystander.memberId))).toBe(true);
    expect((await listAccounts(bystanderToken)).status).toBe(200);
  });
});
