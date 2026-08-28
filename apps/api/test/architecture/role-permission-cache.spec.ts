import { collectSourceFiles, readSource, toRelative } from './helpers';
import { stripComments } from './ws-source';

/** 變更角色授權的 repository 動作 */
const UPDATE_WITH_PERMISSIONS = /\.updateWithPermissions\(/;

/** MemberContext 快取的注入 token */
const CACHE_TOKEN = 'MEMBER_CONTEXT_CACHE_PORT';

/**
 * 一份 service 是否「改了角色的授權卻沒有清成員快取」。
 *
 * 判定要求兩件事同時成立才算合格：呼叫了 `updateWithPermissions()`，
 * **且**呼叫了快取 port。只注入不呼叫不算——與撤銷連線那條守則同樣的教訓：
 * **宣告相依不等於使用它**，而重構時最容易留下的殘骸就是
 * 「呼叫被移除、注入忘了清」。
 */
export const updatesRoleWithoutClearingCache = (source: string): boolean => {
  const clean = stripComments(source);
  if (!UPDATE_WITH_PERMISSIONS.test(clean)) return false;

  const injected = new RegExp(
    `@Inject\\(\\s*${CACHE_TOKEN}\\s*\\)\\s*(?:private|public|protected)\\s+readonly\\s+(\\w+)\\s*:`,
  ).exec(clean);
  if (!injected) return true;

  return !new RegExp(`this\\.${injected[1]}\\.\\w+\\(`).test(clean);
};

/**
 * 變更角色授權的路徑必須清除該角色成員的 MemberContext 快取。
 *
 * **這條規則守的是一個「每一層都正確、但沒有人負責銜接」的缺口。**
 *
 * `ResolveMemberContextService` 把 `MemberContext`（含 `permissions`、`roleName`）
 * 快取在 Redis，TTL 最長 `PERMISSION_CACHE_TTL`（預設 300 秒）。帳號層的每一種
 * 變更都記得清——更新、登出、換發、重設密碼各有一支。角色層一個都沒有：
 * 改完 `role_permissions` 就結束了。
 *
 * 於是**權限的變更最多五分鐘之後才會生效**，而兩個方向的後果不對稱：
 * 加權限只是讓人多等，**拿掉權限則是他繼續用得到五分鐘**——
 * 而會急著拿掉某人權限的場合正是最不能等的那種。而且完全沒有徵兆：
 * 畫面顯示改好了、稽核也記了，只有實際行為是舊的。
 *
 * 規則盯的是**銜接點**而非某個實作：日後多一條路徑（批次改權限、角色匯入、
 * 把 `isDefault` 的角色開放編輯），它同樣會被要求清快取。
 */
describe('架構守則：變更角色授權必須清除成員快取', () => {
  const services = collectSourceFiles(['src/application/service'], {
    exclude: ['.spec.ts'],
  });

  it('掃描範圍有效', () => {
    expect(services.length).toBeGreaterThan(0);
    // 專案一定有變更角色授權的路徑；掃到 0 個代表 port 方法改名而規則沒跟上，
    // 它會就此靜默空轉
    expect(
      services.filter((file) =>
        UPDATE_WITH_PERMISSIONS.test(stripComments(readSource(file))),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('呼叫 updateWithPermissions() 的 service 必須清成員快取', () => {
    const offenders = services
      .filter((file) => updatesRoleWithoutClearingCache(readSource(file)))
      .map((file) => `  ${toRelative(file)}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下位置變更了角色的授權卻沒有清除成員的 MemberContext 快取：\n${offenders.join(
            '\n',
          )}\n該角色成員手上的權限最長還會沿用 PERMISSION_CACHE_TTL（預設 300 秒）——\n撤銷權限的場合，那代表被撤的人還能繼續用五分鐘。請注入 ${CACHE_TOKEN} 並在更新成功後清除。`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 「注入了」與「真的呼叫」要分別驗：只滿足前者是重構時最容易留下的殘骸，
   * 而那種殘骸在執行期看起來完全正常——直到有人被撤權卻還進得去。
   */
  describe('判定邏輯（合成輸入）', () => {
    const withCache = (body: string): string =>
      `export class S {\n  constructor(\n    @Inject(MEMBER_CONTEXT_CACHE_PORT)\n    private readonly memberContextCache: MemberContextCachePort,\n  ) {}\n\n  async execute() {\n${body}\n  }\n}`;

    it('A：更新授權且清快取 → 通過', () => {
      const src = withCache(
        `    await this.roleRepo.updateWithPermissions(id, name, codes, status);\n    await this.memberContextCache.clearMany(ids);`,
      );
      expect(updatesRoleWithoutClearingCache(src)).toBe(false);
    });

    it('B：更新授權但完全沒有清快取 → 抓出', () => {
      const src = `export class S {\n  async execute() {\n    await this.roleRepo.updateWithPermissions(id, name, codes, status);\n  }\n}`;
      expect(updatesRoleWithoutClearingCache(src)).toBe(true);
    });

    // 重構時最容易留下的殘骸：呼叫被移除、注入忘了清
    it('C：注入了快取卻沒呼叫 → 抓出', () => {
      const src = withCache(
        `    await this.roleRepo.updateWithPermissions(id, name, codes, status);`,
      );
      expect(updatesRoleWithoutClearingCache(src)).toBe(true);
    });

    it('D：沒有變更角色授權的 service → 不列入檢查', () => {
      const src = `export class S {\n  async execute() {\n    await this.roleRepo.softDelete(id);\n  }\n}`;
      expect(updatesRoleWithoutClearingCache(src)).toBe(false);
    });

    it('E：只有註解提到清快取 → 仍須抓出', () => {
      const src = `export class S {\n  async execute() {\n    // 之後要呼叫 this.memberContextCache.clearMany()\n    await this.roleRepo.updateWithPermissions(id, name, codes, status);\n  }\n}`;
      expect(updatesRoleWithoutClearingCache(src)).toBe(true);
    });
  });
});
