import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  PERMISSION_CATALOG,
  parsePermissionCode,
} from '@app/shared/constants/permissions';
import { API_ROOT, readSource } from './helpers';
import { stripComments } from './ws-source';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const WEB_SRC = join(API_ROOT, '..', 'web', 'src');

const readWeb = (relative: string): string => {
  const absolute = join(WEB_SRC, relative);
  if (!existsSync(absolute)) return '';
  return readFileSync(absolute, 'utf8');
};

/**
 * 從 `export const X: ... = { KEY: '值', ... }` 取出所有 key。
 *
 * 用正規式讀字面值而不是 import：跨 workspace 的 import 在 api 的 jest 設定下
 * 解不到 `apps/web` 的路徑別名。代價是常數必須維持字面物件的寫法，
 * 這一點寫在 `permission-labels.ts` 的檔頭警告裡。
 */
const literalKeys = (body: string, constName: string): string[] => {
  const start = body.indexOf(`export const ${constName}`);
  if (start === -1) return [];
  const open = body.indexOf('{', start);
  const close = body.indexOf('};', open);
  if (open === -1 || close === -1) return [];
  const block = body.slice(open, close);
  return [...block.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]);
};

/**
 * 前端寫死的後端知識必須跟得上後端。
 *
 * 權限樹的中文對照與「不可指派」說明都放在 `apps/web`，這是為了不擴充 API 回應契約
 * 而付的代價（見 improve-permission-tree-legibility 的 design D1 / D2）。
 * 這兩條規則就是那筆代價的擔保——沒有它們，兩處各說各話的症狀都是**畫面照常顯示、
 * 只是內容是錯的**，不會有任何東西失敗。
 */
describe('架構守則：權限目錄與前端的同步', () => {
  const labelsFile = 'routes/roles/lib/permission-labels.ts';
  const labels = readWeb(labelsFile);

  it('掃描範圍有效', () => {
    expect(labels).not.toBe('');
    expect(PERMISSION_CATALOG.length).toBeGreaterThan(0);
  });

  it('每個 platform 與 module 都要有中文對照', () => {
    const platformKeys = new Set(literalKeys(labels, 'PLATFORM_LABELS'));
    const moduleKeys = new Set(literalKeys(labels, 'MODULE_LABELS'));

    // 正規式或常數寫法失效時這條規則會空轉
    expect(platformKeys.size).toBeGreaterThan(0);
    expect(moduleKeys.size).toBeGreaterThan(0);

    const missing: string[] = [];
    const usedPlatforms = new Set<string>();
    const usedModules = new Set<string>();

    for (const { code } of PERMISSION_CATALOG) {
      const { platform, module } = parsePermissionCode(code);
      usedPlatforms.add(platform);
      usedModules.add(module);
      if (!platformKeys.has(platform))
        missing.push(`  PLATFORM_LABELS 缺少 ${platform}（來自 ${code}）`);
      if (!moduleKeys.has(module))
        missing.push(`  MODULE_LABELS 缺少 ${module}（來自 ${code}）`);
    }

    expect(
      missing.length === 0
        ? ''
        : `權限樹的中文對照不齊全：\n${[...new Set(missing)].join(
            '\n',
          )}\n請補進 apps/web/src/${labelsFile}——缺對照時群組標題會退回英文碼片段，` +
            `\n畫面不會壞、不會報錯，只有一張卡片長得跟別人不一樣`,
    ).toBe('');

    // 反向：權限碼移除後留下的死字串
    const orphans = [
      ...[...platformKeys]
        .filter((k) => !usedPlatforms.has(k))
        .map((k) => `  PLATFORM_LABELS.${k}`),
      ...[...moduleKeys]
        .filter((k) => !usedModules.has(k))
        .map((k) => `  MODULE_LABELS.${k}`),
    ];

    expect(
      orphans.length === 0
        ? ''
        : `以下中文對照沒有對應的權限碼：\n${orphans.join(
            '\n',
          )}\n權限碼移除後留下的死字串，請一併刪除`,
    ).toBe('');
  });

  /**
   * 前端的權限樹寫死了一段「安全管理｜限超級管理者｜不可指派」的說明。
   * 那段話的正確性完全依賴 `SecurityController` 沒有改用 `PermissionsGuard`——
   * **改了的話前端會繼續顯示「不可指派」，而它已經可以指派了**，
   * 畫面在對使用者說謊，且沒有任何測試會失敗。
   *
   * 刻意只驗守衛、不比對條目內容（「IP 白名單 / IP 黑名單 / 帳號解鎖」三個字串）：
   * 比對它們需要第三份端點與中文名的對照，而擋下的只是文案不精確。
   */
  it('安全管理仍由 SUPERADMIN role gate 保護', () => {
    const controller =
      'src/adapter/in/web/admin/security/SecurityController.ts';
    expect(existsSync(join(API_ROOT, controller))).toBe(true);

    // **必須先去註解**：把裝飾器註解掉是最典型的「停用但留著」，而
    // `// @Roles(RoleCode.SUPERADMIN)` 會把不去註解的正規式餵飽，規則就永遠是綠的
    const body = stripComments(readSource(controller));
    const guarded = /@Roles\(\s*RoleCode\.SUPERADMIN\s*\)/.test(body);

    expect(
      guarded
        ? ''
        : `${controller} 不再以 @Roles(RoleCode.SUPERADMIN) 保護。\n` +
            `apps/web/src/routes/roles/lib/unassignable-permissions.ts 有一段寫死的說明` +
            `\n（「安全管理」「限超級管理者」「不可指派」）需要同步移除，` +
            `\n否則權限樹會顯示「不可指派」而實際上已經可以指派了`,
    ).toBe('');
  });
});
