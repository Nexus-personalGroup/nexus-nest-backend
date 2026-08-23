import { collectSourceFiles, readSource } from './helpers';

/**
 * 授權相關的裝飾器；任一即算已表態。
 *
 * `@MemberScoped(` 是前台專用的表態：資源層級授權在 application 層（成員資格不是
 * 權限碼能表達的東西）。它**不代表免授權**，因此下方另有一條規則限制它只能出現在
 * `web/front/` 之下——後台繞過 RBAC 的萬用通行證正是這條規則要防的東西。
 */
const AUTHZ_DECORATORS = [
  '@Permissions(',
  '@Roles(',
  '@Public(',
  '@MemberScoped(',
];

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

/** class 層可能出現的裝飾器，用來定位裝飾器區段的起點 */
const CLASS_DECORATOR_ANCHORS = ['@Controller(', ...AUTHZ_DECORATORS];

/**
 * 取 class 層級的裝飾器區段：`@Controller(` 起至 `export class` 為止。
 *
 * 不能直接用 `export class` 之前的全部內容——那包含檔頭 TSDoc。
 * 這兩者之間只會是裝飾器，註解不會夾在中間。
 */
const classDecorators = (source: string): string => {
  // 必須先去註解再定位：註解裡提到的裝飾器會把起點往前拉到註解內部，
  // 後續的 stripComments 因為少了 `/*` 開頭而失效，說明文字就此冒充成真裝飾器
  source = stripComments(source);
  const end = source.indexOf('export class');
  if (end < 0) return '';
  // 起點取「最早出現的 class 層裝飾器」而非固定的 @Controller(：
  // 裝飾器順序是自由的，寫在 @Controller 上方的 @MemberScoped 曾因此被整段漏看，
  // 症狀是端點明明表態了卻被判定沒表態——誤報比漏報好，但一樣會侵蝕對守則的信任
  const start = [...CLASS_DECORATOR_ANCHORS]
    .map((anchor) => source.indexOf(anchor))
    .filter((index) => index >= 0 && index < end)
    .reduce((min, index) => Math.min(min, index), Number.MAX_SAFE_INTEGER);
  return start === Number.MAX_SAFE_INTEGER ? '' : source.slice(start, end);
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

  it('@MemberScoped 只能出現在前台 controller', () => {
    const misplaced = controllers
      .filter((file) => !file.includes('/web/front/'))
      .filter((file) =>
        stripComments(readSource(file)).includes('@MemberScoped('),
      )
      .map((file) => `  ${file}`);

    expect(
      misplaced.length === 0
        ? ''
        : `以下後台 controller 使用了 @MemberScoped：\n${misplaced.join(
            '\n',
          )}\n後台的授權是 RBAC，請用 @Permissions / @Roles；@MemberScoped 會變成繞過權限檢查的通行證。`,
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

/** 前台 controller 的認證接線判定結果 */
type FrontWiring = {
  usesUserContext: boolean;
  usesMemberContext: boolean;
  hasFrontGuard: boolean;
  hasVerifiedGuard: boolean;
  hasPublic: boolean;
};

/**
 * 判定一份前台 controller 的認證接線。
 *
 * 抽成吃字串的純函式，理由同上方兩條：這支規則出錯是**靜默的**，
 * 而它擋的正是「看起來完全正常的無認證端點」。
 */
export const auditFrontWiring = (source: string): FrontWiring => {
  const code = stripComments(source);
  const classSection = classDecorators(source);
  return {
    usesUserContext: code.includes('@CurrentUser('),
    usesMemberContext: code.includes('@CurrentMember('),
    // 兩個 Guard 寫在同一個 @UseGuards() 裡，因此只比對名稱是否出現
    hasFrontGuard: classSection.includes('FrontJwtAuthGuard'),
    hasVerifiedGuard: classSection.includes('EmailVerifiedGuard'),
    hasPublic: classSection.includes('@Public('),
  };
};

/**
 * 前台 controller 的認證必須由 `FrontJwtAuthGuard` 執行，且必定與 `@Public()` 成對。
 *
 * 這是一個**兩邊各自都對、合起來有洞**的接線：
 *
 * - `@Public()` 是給**全域的後台 Guard** 看的（讓它略過這條路由）。
 *   只標它而漏掛 `FrontJwtAuthGuard`，結果是**兩個 Guard 都放行**——
 *   端點完全沒有認證，而且它看起來與正常的端點一模一樣。
 * - 反過來只掛 `FrontJwtAuthGuard` 而沒標 `@Public()`，全域的後台 Guard 會先跑，
 *   拿著有效前台 token 的請求一律 401——端點是死的，但沒有任何東西會報錯。
 *
 * `@CurrentUser()` 是「這支端點需要前台身分」的訊號：它在 `request.frontUser`
 * 沒設定時才拋錯，也就是**只有真的被呼叫到才會發現**。因此這裡改成靜態檢查。
 *
 * 第三條規則釘住 `migrate-chat-to-front-users` 的結果：前台不得再出現
 * `@CurrentMember()`。聊天的參與者是前台使用者，一支吃後台 token 的前台端點
 * 不會有任何錯誤徵兆——它只是讓錯的人進得來。
 */
describe('架構守則：前台 controller 的認證接線', () => {
  const controllers = collectSourceFiles(['src/adapter/in/web/front'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Controller.ts'));

  /**
   * 不需要「信箱已驗證」門檻的前台 controller。
   *
   * 門檻高：能列進來的只有「未驗證的使用者**必須**用得到」的端點，
   * 不包含「還沒接上」。
   */
  const VERIFIED_GUARD_EXEMPT = [
    // 使用者要看得到自己的驗證狀態，才知道自己卡在哪、該去點哪封信
    'front/auth/FrontMeController.ts',
  ];

  it('掃描範圍有效', () => {
    expect(controllers.length).toBeGreaterThan(0);
    // 必須有「需要認證」的前台 controller，否則規則會空轉
    expect(
      controllers.filter((f) => auditFrontWiring(readSource(f)).usesUserContext)
        .length,
    ).toBeGreaterThan(0);
  });

  it('用了 @CurrentUser() 就必須掛 @UseGuards(FrontJwtAuthGuard)', () => {
    const offenders = controllers
      .filter((file) => {
        const wiring = auditFrontWiring(readSource(file));
        return wiring.usesUserContext && !wiring.hasFrontGuard;
      })
      .map((file) => `  ${file}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下前台 controller 讀取 @CurrentUser() 卻沒有掛 FrontJwtAuthGuard：\n${offenders.join(
            '\n',
          )}\n若同時標了 @Public()，結果是兩個 Guard 都放行——端點完全沒有認證。`,
    ).toBe('');
  });

  it('掛了 FrontJwtAuthGuard 就必須同時標 @Public()', () => {
    const offenders = controllers
      .filter((file) => {
        const wiring = auditFrontWiring(readSource(file));
        return wiring.hasFrontGuard && !wiring.hasPublic;
      })
      .map((file) => `  ${file}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下前台 controller 掛了 FrontJwtAuthGuard 卻沒標 @Public()：\n${offenders.join(
            '\n',
          )}\n全域的後台 Guard 會先跑，有效的前台 token 一律被判 401。`,
    ).toBe('');
  });

  /**
   * 掛了認證就要掛驗證門檻——除非明列豁免。
   *
   * 沒有這條的話，日後新增一支前台聊天端點會**預設對未驗證帳號開放**，
   * 而那不會有任何徵兆：端點看起來完全正常，只是門檻少了一道。
   * 這與 `AttachmentController` 踩過的是同一種缺陷——
   * 它遵守了所有現存規則，只是缺少沒有規則要求它具備的東西。
   */
  it('掛了 FrontJwtAuthGuard 就必須掛 EmailVerifiedGuard（豁免需明列）', () => {
    const offenders = controllers
      .filter((file) => !VERIFIED_GUARD_EXEMPT.some((e) => file.includes(e)))
      .filter((file) => {
        const wiring = auditFrontWiring(readSource(file));
        return wiring.hasFrontGuard && !wiring.hasVerifiedGuard;
      })
      .map((file) => `  ${file}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下前台 controller 掛了 FrontJwtAuthGuard 卻沒掛 EmailVerifiedGuard：\n${offenders.join(
            '\n',
          )}\n未驗證信箱的帳號會因此拿到聊天功能。確實不需要門檻的話，請加進 VERIFIED_GUARD_EXEMPT 並註明理由。`,
    ).toBe('');
  });

  it('豁免清單不得有過期項目', () => {
    const expired = VERIFIED_GUARD_EXEMPT.filter(
      (exempt) => !controllers.some((file) => file.includes(exempt)),
    ).map((exempt) => `  ${exempt}`);

    expect(
      expired.length === 0
        ? ''
        : `以下豁免的 controller 已不存在：\n${expired.join('\n')}`,
    ).toBe('');
  });

  it('前台不得使用 @CurrentMember()（那是後台身分）', () => {
    const offenders = controllers
      .filter((file) => auditFrontWiring(readSource(file)).usesMemberContext)
      .map((file) => `  ${file}`);

    expect(
      offenders.length === 0
        ? ''
        : `以下前台 controller 使用了後台的 @CurrentMember()：\n${offenders.join(
            '\n',
          )}\n聊天的參與者是前台使用者；吃錯 token 的端點不會有任何錯誤徵兆。`,
    ).toBe('');
  });

  describe('判定邏輯（合成輸入）', () => {
    const wrap = (classPart: string, body: string): string =>
      `${classPart}\nexport class T {\n${body}\n}\n`;

    it('A：@Public + FrontJwtAuthGuard + @CurrentUser → 全部通過', () => {
      const wiring = auditFrontWiring(
        wrap(
          `@Public()\n@UseGuards(FrontJwtAuthGuard)\n@Controller('front/x')`,
          `  @Get()\n  list(@CurrentUser() u: unknown) {}`,
        ),
      );
      expect(wiring.usesUserContext && wiring.hasFrontGuard).toBe(true);
      expect(wiring.hasPublic).toBe(true);
    });

    it('B：只有 @Public 而漏掛 Guard → 抓得出來', () => {
      const wiring = auditFrontWiring(
        wrap(
          `@Public()\n@Controller('front/x')`,
          `  @Get()\n  list(@CurrentUser() u: unknown) {}`,
        ),
      );
      expect(wiring.usesUserContext).toBe(true);
      expect(wiring.hasFrontGuard).toBe(false);
    });

    it('C：只有註解提到 FrontJwtAuthGuard → 不算掛上（不得被說明文字餵飽）', () => {
      const wiring = auditFrontWiring(
        wrap(
          `/**\n * 認證由 @UseGuards(FrontJwtAuthGuard) 執行\n */\n@Public()\n@Controller('front/x')`,
          `  @Get()\n  list(@CurrentUser() u: unknown) {}`,
        ),
      );
      expect(wiring.hasFrontGuard).toBe(false);
    });

    it('D：登入這類真的公開的端點（不讀 @CurrentUser）→ 不需要 Guard', () => {
      const wiring = auditFrontWiring(
        wrap(
          `@Public()\n@Controller('front/auth')`,
          `  @Post('login')\n  login(@Body() dto: unknown) {}`,
        ),
      );
      expect(wiring.usesUserContext).toBe(false);
    });

    it('E2：只掛 FrontJwtAuthGuard 而沒掛 EmailVerifiedGuard → 抓得出來', () => {
      const wiring = auditFrontWiring(
        wrap(
          `@Public()\n@UseGuards(FrontJwtAuthGuard)\n@Controller('front/x')`,
          `  @Get()\n  list(@CurrentUser() u: unknown) {}`,
        ),
      );
      expect(wiring.hasFrontGuard).toBe(true);
      expect(wiring.hasVerifiedGuard).toBe(false);
    });

    it('E3：兩個 Guard 寫在同一個 @UseGuards() 裡 → 都認得', () => {
      const wiring = auditFrontWiring(
        wrap(
          `@Public()\n@UseGuards(FrontJwtAuthGuard, EmailVerifiedGuard)\n@Controller('front/x')`,
          `  @Get()\n  list(@CurrentUser() u: unknown) {}`,
        ),
      );
      expect(wiring.hasFrontGuard && wiring.hasVerifiedGuard).toBe(true);
    });

    it('E：前台用了 @CurrentMember → 抓得出來', () => {
      const wiring = auditFrontWiring(
        wrap(
          `@Public()\n@UseGuards(FrontJwtAuthGuard)\n@Controller('front/x')`,
          `  @Get()\n  list(@CurrentMember() m: unknown) {}`,
        ),
      );
      expect(wiring.usesMemberContext).toBe(true);
    });
  });
});

/**
 * WebSocket 事件 handler 必須表態認證。
 *
 * 與上方的 HTTP 規則是同一個型態的缺陷：**它遵守了所有現存規則，只是缺少
 * 沒有規則要求它具備的東西**。WS 的認證發生在連線階段（`handleConnection`），
 * 因此表態的位置在 gateway class；個別事件要繞過就必須明示 `@WsPublic()` 並註明理由。
 *
 * 沒有這條規則的話，新增一個忘了認證的 gateway 會一路綠燈——
 * 前一版專案的 WS 層正是在完全沒有阻力的情況下長歪的。
 */
describe('架構守則：WebSocket 事件 handler 必須表態認證', () => {
  const gateways = collectSourceFiles(['src/adapter/in/ws'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Gateway.ts'));

  /** class 層級的裝飾器區段：`@WebSocketGateway(` 起至 `export class` 為止 */
  const gatewayClassDecorators = (source: string): string => {
    const start = source.indexOf('@WebSocketGateway(');
    const end = source.indexOf('export class');
    return start >= 0 && start < end ? source.slice(start, end) : '';
  };

  /** 找出未表態的事件 handler；class 層級已標註時整支 gateway 通過 */
  const auditGateway = (
    source: string,
  ): { unmarked: string[]; handlerCount: number } => {
    const code = stripComments(source);
    const classMarked =
      gatewayClassDecorators(code).includes('@WsAuthenticated(');
    const lines = code.split('\n');
    const unmarked: string[] = [];
    let handlerCount = 0;

    lines.forEach((line, index) => {
      if (!line.includes('@SubscribeMessage(')) return;
      handlerCount += 1;
      if (classMarked) return;

      // 往前吃掉連續的裝飾器行——@WsPublic() 常寫在 @SubscribeMessage 上方
      let cursor = index;
      let marked = false;
      while (cursor >= 0 && /^\s*@/.test(lines[cursor])) {
        if (
          lines[cursor].includes('@WsAuthenticated(') ||
          lines[cursor].includes('@WsPublic(')
        ) {
          marked = true;
          break;
        }
        cursor -= 1;
      }
      if (!marked) unmarked.push(`第 ${index + 1} 行`);
    });

    return { unmarked, handlerCount };
  };

  it('掃描範圍有效', () => {
    expect(gateways.length).toBeGreaterThan(0);
    expect(
      gateways.reduce(
        (sum, f) => sum + auditGateway(readSource(f)).handlerCount,
        0,
      ),
    ).toBeGreaterThan(0);
  });

  it('每個事件 handler 都必須被認證涵蓋或明示公開', () => {
    const offenders: string[] = [];

    for (const file of gateways) {
      const { unmarked } = auditGateway(readSource(file));
      offenders.push(...unmarked.map((where) => `  ${file} ${where}`));
    }

    expect(
      offenders.length === 0
        ? ''
        : `以下 WebSocket 事件 handler 沒有表態認證：\n${offenders.join('\n')}\n請在 gateway class 標 @WsAuthenticated()；確實要公開的個別事件標 @WsPublic() 並註明理由。`,
    ).toBe('');
  });

  it('@WsPublic() 必須在鄰近三行內註明理由', () => {
    const offenders: string[] = [];

    for (const file of gateways) {
      // 這裡刻意用未去註解的原始碼——要找的正是註解本身
      const lines = readSource(file).split('\n');
      lines.forEach((line, index) => {
        if (!line.includes('@WsPublic(')) return;
        const hasReason = lines
          .slice(Math.max(0, index - 3), index)
          .some((prev) => /\/\/|\*/.test(prev));
        if (!hasReason) offenders.push(`  ${file}:${index + 1}`);
      });
    }

    expect(
      offenders.length === 0
        ? ''
        : `以下 @WsPublic() 沒有註明理由：\n${offenders.join('\n')}\n豁免一旦失去理由就會逐漸長大。`,
    ).toBe('');
  });

  /**
   * 守則自身的測試。
   *
   * 與 HTTP 那條同理：這支規則出錯是**靜默的**，只會少報。以合成輸入釘住三個判定。
   */
  describe('判定邏輯（合成輸入）', () => {
    it('A：class 層級標了 @WsAuthenticated → 全部 handler 通過', () => {
      const src = `@WebSocketGateway({})\n@WsAuthenticated()\nexport class G {\n  @SubscribeMessage('x')\n  h() {}\n}`;
      expect(auditGateway(src).unmarked).toHaveLength(0);
    });

    it('B：class 與 handler 都沒標 → 被抓出', () => {
      const src = `@WebSocketGateway({})\nexport class G {\n  @SubscribeMessage('x')\n  h() {}\n}`;
      expect(auditGateway(src).unmarked).toHaveLength(1);
    });

    it('C：只有註解提到 @WsAuthenticated → 仍被抓出', () => {
      // 註解冒充裝飾器是 HTTP 那條實際踩過的盲區，這裡預先釘住
      const src = `@WebSocketGateway({})\n// 本 gateway 已由 @WsAuthenticated() 涵蓋\nexport class G {\n  @SubscribeMessage('x')\n  h() {}\n}`;
      expect(auditGateway(src).unmarked).toHaveLength(1);
    });

    it('D：handler 層級標了 @WsPublic → 通過', () => {
      const src = `@WebSocketGateway({})\nexport class G {\n  @WsPublic()\n  @SubscribeMessage('x')\n  h() {}\n}`;
      expect(auditGateway(src).unmarked).toHaveLength(0);
    });
  });
});
