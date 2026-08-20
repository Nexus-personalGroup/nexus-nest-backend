import { collectSourceFiles, readSource } from './helpers';

/** 授權相關的裝飾器；三者任一即算已表態 */
const AUTHZ_DECORATORS = ['@Permissions(', '@Roles(', '@Public('];

/**
 * 收外部輸入的參數裝飾器。
 *
 * 不只看 `@Param`——「接受任意資源識別碼」不等於「用路徑參數」。
 * `POST /xxx { ids: [] }` 這類 body 帶識別碼的端點同樣需要授權表態。
 */
const INPUT_DECORATORS = ['@Param(', '@Body(', '@Query('];

/**
 * 去掉註解再比對。
 *
 * **不做這件事，說明文字就會把規則餵飽**：`SecurityController` 的檔頭寫著
 * 「刻意用 RolesGuard + @Roles(SUPERADMIN) 粗粒度 role gate」，只要用字串比對，
 * 這行註解就讓整個 class 被判定為已授權——即使真裝飾器被重構移除也不會紅。
 * 實測過：拿掉真的 `@Roles` 只留註解，這支守則照樣全綠。
 */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 取 class 層級的裝飾器區段：`@Controller(` 起至 `export class` 為止。
 *
 * 不能直接用 `export class` 之前的全部內容——那包含檔頭 TSDoc。
 * 這兩者之間只會是裝飾器，註解不會夾在中間。
 */
const classDecorators = (source: string): string => {
  const start = source.indexOf('@Controller(');
  const end = source.indexOf('export class');
  return start >= 0 && start < end ? source.slice(start, end) : '';
};

type Handler = { name: string; line: number; body: string };

/**
 * 切出每個 handler。
 *
 * 起點必須往前吃掉**連續的裝飾器行**，不能從 HTTP method 裝飾器起算——
 * `@Public()` 這類常寫在 `@Post()` 上方，只從 `@Post` 起算會把它歸給前一個 handler，
 * 造成「前一支莫名通過、本支莫名被抓」的雙重誤判。實際踩過：`AuthController`
 * 的 refresh 與 resetPassword 因此被誤報，而 login 吃到下一支的 `@Public` 而漏報。
 */
const handlersOf = (source: string): Handler[] => {
  const lines = source.split('\n');
  const starts: number[] = [];

  lines.forEach((line, index) => {
    if (!/^\s*@(Get|Post|Patch|Put|Delete)\(/.test(line)) return;
    let begin = index;
    while (begin > 0 && /^\s*@\w+\(/.test(lines[begin - 1])) begin -= 1;
    starts.push(begin);
  });

  return starts.map((start, i) => {
    const end = starts[i + 1] ?? lines.length;
    const block = lines.slice(start, end);
    const signature = block.find((l) => /^\s{2}(async\s+)?\w+\(/.test(l)) ?? '';
    return {
      name: /\s{2}(?:async\s+)?(\w+)\(/.exec(signature)?.[1] ?? '(未知)',
      line: start + 1,
      body: stripComments(block.join('\n')),
    };
  });
};

/** 單一 controller 原始碼的判定結果 */
type Audit = { unguarded: Handler[]; checked: number };

/**
 * 判定一份 controller 原始碼中，哪些 handler 收了外部輸入卻沒有授權表態。
 *
 * 抽成吃字串的純函式，是為了讓這支守則**自己也能被測試**——
 * 它現在是唯一擋在「新 controller 漏標授權」前面的東西，
 * 而給出偽陰性的守則比沒有守則更危險：它會讓人停止人工檢查。
 */
export const auditAuthorization = (source: string): Audit => {
  const classSection = stripComments(classDecorators(source));
  const guardedAtClass = AUTHZ_DECORATORS.some((d) => classSection.includes(d));

  const unguarded: Handler[] = [];
  let checked = 0;

  for (const handler of handlersOf(source)) {
    if (!INPUT_DECORATORS.some((d) => handler.body.includes(d))) continue;

    // 自我範圍豁免：有 @CurrentMember() 且不收路徑參數者，操作的是呼叫者
    // 自己的資料（如 logout 帶的是自己持有的 refreshToken），不存在越權。
    // 只要出現 @Param 就不再豁免——那才是「指向任意資源」的訊號。
    //
    // 殘留缺口（知情）：`@CurrentMember() + @Body({ targetId })` 會被誤放行。
    // 要堵它得解析 DTO 欄位語意，成本遠高於收益；指向他人資源用 @Param 才是慣例。
    const selfScoped =
      handler.body.includes('@CurrentMember(') &&
      !handler.body.includes('@Param(');
    if (selfScoped) continue;

    checked += 1;
    const guarded =
      guardedAtClass || AUTHZ_DECORATORS.some((d) => handler.body.includes(d));
    if (!guarded) unguarded.push(handler);
  }

  return { unguarded, checked };
};

/**
 * 接受任意資源識別碼的端點，必須明確表態授權。
 *
 * 全域 guard 的設計是「沒標註就放行」——這讓全域註冊不影響未標註的路由，
 * 但前提是「**該標的都標了**」。`AttachmentController` 曾兩支端點一個裝飾器都沒有，
 * 於是任何已登入者（含零權限帳號）都能刪除任何人的附件，連同實體檔案、不可逆。
 *
 * 它躲過了三輪審查與當時全部 18 支守則——因為既有規則檢查的是「**有標註的標對了**」，
 * 而它一條規則都沒違反，只是少了沒有規則要求它有的東西。這是本專案第一條
 * 「檢查應存在而不存在」的守則。
 */
describe('架構守則：接受任意資源識別碼的端點必須表態授權', () => {
  const controllers = collectSourceFiles(['src/adapter/in/web'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Controller.ts'));

  it('掃描範圍有效', () => {
    expect(controllers.length).toBeGreaterThan(0);
    expect(
      controllers.flatMap((f) => handlersOf(readSource(f))).length,
    ).toBeGreaterThan(0);
  });

  it('收外部輸入的 handler 必須有 @Permissions / @Roles / @Public', () => {
    const unguarded: string[] = [];
    let checked = 0;

    for (const file of controllers) {
      const audit = auditAuthorization(readSource(file));
      checked += audit.checked;
      unguarded.push(
        ...audit.unguarded.map((h) => `  ${file}:${h.line}  ${h.name}()`),
      );
    }

    // 專案一定有收外部輸入的端點；掃到 0 個代表切割邏輯失效，規則會空轉
    expect(checked).toBeGreaterThan(0);

    expect(
      unguarded.length === 0
        ? ''
        : `以下端點接受任意資源識別碼卻沒有授權裝飾器：\n${unguarded.join(
            '\n',
          )}\n全域 guard 對未標註的路由一律放行，等於任何已登入者都能操作任何人的資源。\n請標 @Permissions / @Roles；確實要公開就標 @Public 明示。`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 這支規則出錯是**靜默的**——它只會少報，不會有任何徵兆。以合成輸入釘住
   * 四個關鍵判定，其中 C（註解冒充裝飾器）與 D（識別碼走 body）都是實際存在過的盲區。
   */
  describe('判定邏輯（合成輸入）', () => {
    const wrap = (classPart: string, handlerPart: string): string =>
      `${classPart}\nexport class T {\n${handlerPart}\n}\n`;

    it('A：class 層級有真裝飾器 → 通過', () => {
      const src = wrap(
        `@Controller('x')\n@Roles(RoleCode.SUPERADMIN)`,
        `  @Delete(':id')\n  remove(@Param('id') id: string) {}`,
      );
      expect(auditAuthorization(src).unguarded).toHaveLength(0);
    });

    it('B：完全沒有授權裝飾器 → 攔截', () => {
      const src = wrap(
        `@Controller('x')`,
        `  @Delete(':id')\n  remove(@Param('id') id: string) {}`,
      );
      expect(auditAuthorization(src).unguarded.map((h) => h.name)).toEqual([
        'remove',
      ]);
    });

    it('C：只有註解提到 @Roles( → 仍須攔截（不得被說明文字餵飽）', () => {
      const src = wrap(
        `/**\n * 本模組刻意用 RolesGuard + @Roles(SUPERADMIN) 粗粒度 role gate\n */\n@Controller('x')`,
        `  @Delete(':id')\n  remove(@Param('id') id: string) {}`,
      );
      expect(auditAuthorization(src).unguarded.map((h) => h.name)).toEqual([
        'remove',
      ]);
    });

    it('D：識別碼走 @Body 而非 @Param → 仍須攔截', () => {
      const src = wrap(
        `@Controller('x')`,
        `  @Post('batch-delete')\n  batchRemove(@Body() dto: { ids: string[] }) {}`,
      );
      expect(auditAuthorization(src).unguarded.map((h) => h.name)).toEqual([
        'batchRemove',
      ]);
    });

    it('E：@Public() 寫在 @Post() 上方也算表態（切塊須往前吃裝飾器）', () => {
      const src = wrap(
        `@Controller('x')`,
        `  @Public()\n  @Post('login')\n  login(@Body() dto: unknown) {}\n\n  @Public()\n  @Post('refresh')\n  refresh(@Body() dto: unknown) {}`,
      );
      expect(auditAuthorization(src).unguarded).toHaveLength(0);
    });

    it('F：自我範圍（@CurrentMember 且無 @Param）→ 豁免', () => {
      const src = wrap(
        `@Controller('x')`,
        `  @Post('logout')\n  logout(@Body() dto: unknown, @CurrentMember() me: unknown) {}`,
      );
      expect(auditAuthorization(src).unguarded).toHaveLength(0);
    });

    it('G：有 @CurrentMember 但同時收 @Param → 不豁免', () => {
      const src = wrap(
        `@Controller('x')`,
        `  @Delete(':id')\n  remove(@Param('id') id: string, @CurrentMember() me: unknown) {}`,
      );
      expect(auditAuthorization(src).unguarded.map((h) => h.name)).toEqual([
        'remove',
      ]);
    });
  });
});
