import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');
const SPECS_DIR = join(REPO_ROOT, 'openspec', 'specs');

/** 能力名稱的四類前綴，決定該 spec 的寫法 */
const PREFIXES = ['api-', 'ui-', 'platform-', 'ws-'] as const;

type Capability = { name: string; body: string };

const capabilities = (): Capability[] =>
  existsSync(SPECS_DIR)
    ? readdirSync(SPECS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => ({
          name: e.name,
          path: join(SPECS_DIR, e.name, 'spec.md'),
        }))
        .filter((c) => existsSync(c.path))
        .map((c) => ({ name: c.name, body: readFileSync(c.path, 'utf8') }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

/** 切出各 `### Requirement:` 區塊（標題 + 內文，到下一個同級標題為止） */
const requirementBlocks = (body: string): { title: string; text: string }[] => {
  const blocks: { title: string; text: string }[] = [];
  const lines = body.split('\n');
  let current: { title: string; text: string[] } | null = null;

  for (const line of lines) {
    const heading = /^### Requirement:\s*(.+)$/.exec(line);
    if (heading) {
      if (current)
        blocks.push({ title: current.title, text: current.text.join('\n') });
      current = { title: heading[1].trim(), text: [] };
      continue;
    }
    // 只有 `## ` 開頭的同級標題才結束區塊；`#### Scenario:` 仍屬於本區塊
    if (current && /^## /.test(line)) {
      blocks.push({ title: current.title, text: current.text.join('\n') });
      current = null;
      continue;
    }
    if (current) current.text.push(line);
  }
  if (current)
    blocks.push({ title: current.title, text: current.text.join('\n') });

  return blocks;
};

/**
 * 宣告 endpoint 的需求：內文第一個非空行以「`METHOD /path`」開頭。
 *
 * 只認開頭而不是全文搜尋，是為了排除「在說明裡順帶提到某條路由」的需求
 * ——例如 api-member-management 的「固定路由優先於參數路由」內文會提到
 * `GET /api/admin/members/:id`，但它本身不是一支 endpoint 的契約。
 */
const declaredEndpoint = (text: string): string | null => {
  const firstLine = text.split('\n').find((l) => l.trim() !== '');
  if (!firstLine) return null;
  const matched = /^`(GET|POST|PUT|PATCH|DELETE)\s+(\/[^`]*)`/.exec(
    firstLine.trim(),
  );
  return matched ? `${matched[1]} ${matched[2]}` : null;
};

/**
 * 判斷文字中是否**使用**了某個區塊標籤，而非只是提到它。
 *
 * 區塊標籤在實際使用時一律出現在**行首**（`**Success Response** \`200 OK\`：`），
 * 而在行文中提及時是夾在句子裡的行內程式碼（「…的 spec 出現 \`**Success Response**\`」）。
 * 用 `includes` 不分兩者，會讓「描述這條規則的 spec」被自己的規則抓出來——
 * 本專案已在 authorization-coverage 踩過同型的坑：**說明某個東西的文字會把規則餵飽**。
 */
const usesSection = (text: string, section: string): boolean => {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}`, 'm').test(text);
};

/** WebSocket 事件的方向。兩者的契約形狀不對稱，必填區塊因此不同 */
type WsDirection = 'client' | 'server';

/** `client:` 事件的必填區塊。沒有 ack 也要明示「本事件無 ack」，省略與忘了寫長得一樣 */
const CLIENT_EVENT_SECTIONS = [
  '**Payload**',
  '**Ack**',
  '**Failure Responses**',
] as const;

/** `server:` 事件只需推送內容——伺服器主動推送沒有對應的失敗回應可回給誰 */
const SERVER_EVENT_SECTIONS = ['**Payload**'] as const;

/**
 * 宣告 WebSocket 事件的需求：內文第一個非空行以「`client:<event>`」或
 * 「`server:<event>`」開頭。
 *
 * 與 `declaredEndpoint` 同樣只認開頭而非全文搜尋，理由相同——內文提到某個事件
 * （例如「本事件的錯誤碼與 `client:sendMessage` 一致」）不代表它是該事件的契約。
 *
 * 方向標記用 `client:` / `server:` 而非箭頭：後者在 regex 與編碼處理上多一層風險，
 * 而這兩個字面值直接對應 `adapter/in/ws/events.ts` 的 CLIENT_EVENTS / SERVER_EVENTS，
 * spec 與實作用同一組詞彙。
 */
const declaredWsEvent = (
  text: string,
): { direction: WsDirection; event: string } | null => {
  const firstLine = text.split('\n').find((l) => l.trim() !== '');
  if (!firstLine) return null;
  const matched = /^`(client|server):([A-Za-z][\w]*)`/.exec(firstLine.trim());
  return matched
    ? { direction: matched[1] as WsDirection, event: matched[2] }
    : null;
};

/** 依方向取得必填區塊 */
const requiredWsSections = (direction: WsDirection): readonly string[] =>
  direction === 'client' ? CLIENT_EVENT_SECTIONS : SERVER_EVENT_SECTIONS;

/**
 * master spec 的能力命名與 API 契約格式。
 *
 * 這兩條規則的來源是 `openspec/schemas/spec-driven-custom/`——但那份 schema 只在
 * 產生 artifact 的當下由 `openspec instructions` 餵給 AI，**產生之後就沒有東西再檢查**。
 * spec 被手改、或 AI 沒照做，都不會有任何徵兆。這裡補上事後的檢查。
 */
describe('架構守則：openspec master spec 的命名與格式', () => {
  it('掃描範圍有效', () => {
    // 目錄搬家或 spec 全被刪時先紅，避免「0 支」被誤讀成全部合規
    expect(capabilities().length).toBeGreaterThan(0);
  });

  it('能力名稱必須帶 api- / ui- / platform- 前綴', () => {
    const wrong = capabilities()
      .map((c) => c.name)
      .filter((name) => !PREFIXES.some((p) => name.startsWith(p)));

    expect(
      wrong.length === 0
        ? ''
        : `以下能力名稱缺少分類前綴：\n${wrong
            .map((n) => `  openspec/specs/${n}/`)
            .join(
              '\n',
            )}\n前綴決定 spec 寫法：api-（後端 endpoint 契約）、ui-（前端畫面行為）、platform-（跨切面工程規則）、ws-（WebSocket 事件契約）`,
    ).toBe('');
  });

  it('spec.md 的標題行必須與目錄名一致', () => {
    const wrong = capabilities()
      .map((c) => ({
        name: c.name,
        first: c.body.split('\n')[0].trim(),
        want: `# ${c.name} Specification`,
      }))
      .filter((c) => c.first !== c.want);

    expect(
      wrong.length === 0
        ? ''
        : `以下 spec 的標題行與目錄名不符（改名時漏改）：\n${wrong
            .map(
              (c) =>
                `  openspec/specs/${c.name}/spec.md\n    實際: ${c.first}\n    應為: ${c.want}`,
            )
            .join('\n')}`,
    ).toBe('');
  });

  it('api-* 的每個 endpoint 需求都要寫出成功與失敗回應', () => {
    const missing: string[] = [];
    let checked = 0;

    for (const cap of capabilities()) {
      if (!cap.name.startsWith('api-')) continue;

      for (const block of requirementBlocks(cap.body)) {
        const endpoint = declaredEndpoint(block.text);
        if (!endpoint) continue;
        checked += 1;

        const lacks: string[] = [];
        if (!usesSection(block.text, '**Success Response**'))
          lacks.push('Success Response');
        if (!usesSection(block.text, '**Failure Responses**'))
          lacks.push('Failure Responses');
        if (lacks.length > 0) {
          missing.push(
            `  openspec/specs/${cap.name}/spec.md\n    需求「${block.title}」（${endpoint}）缺少：${lacks.join('、')}`,
          );
        }
      }
    }

    // 判定 endpoint 的正規式若失效，會讓這條規則靜默空轉
    expect(checked).toBeGreaterThan(0);

    expect(
      missing.length === 0
        ? ''
        : `api-* 的 endpoint 需求必須寫出實際的請求與回應形狀：\n${missing.join(
            '\n',
          )}\n格式見 openspec/schemas/spec-driven-custom/schema.yaml 的 specs instruction`,
    ).toBe('');
  });

  it('ui-* / platform-* / ws-* 不應寫 API 請求／回應區塊', () => {
    // ws- 一併納入：它有自己的區塊名稱（Payload / Ack），混用 HTTP 的
    // Success Response 會讓本條反向檢查失去意義
    const wrong = capabilities()
      .filter((c) =>
        ['ui-', 'platform-', 'ws-'].some((p) => c.name.startsWith(p)),
      )
      .filter((c) => usesSection(c.body, '**Success Response**'))
      .map((c) => c.name);

    expect(
      wrong.length === 0
        ? ''
        : `以下非 api- 能力寫了 API 回應區塊：\n${wrong
            .map((n) => `  openspec/specs/${n}/spec.md`)
            .join(
              '\n',
            )}\nendpoint 契約屬於 api-* 能力；ui-* 描述畫面行為、platform-* 描述工程約束、ws-* 用 Payload / Ack`,
    ).toBe('');
  });

  /**
   * WebSocket 事件契約的必填區塊。
   *
   * **這條規則目前沒有任何真實樣本**——專案還沒有 `ws-*` 能力（M2 才會有）。
   * 因此不比照其他規則硬性要求「掃到 > 0」，那會讓它在被使用前一直是紅的；
   * 正確性完全由下方的合成輸入測試保證。
   */
  it('ws-* 的事件需求必須寫出該方向的必填區塊', () => {
    const missing: string[] = [];

    for (const cap of capabilities()) {
      if (!cap.name.startsWith('ws-')) continue;

      for (const block of requirementBlocks(cap.body)) {
        const declared = declaredWsEvent(block.text);
        if (!declared) continue;

        const lacks = requiredWsSections(declared.direction).filter(
          (section) => !usesSection(block.text, section),
        );
        if (lacks.length > 0) {
          missing.push(
            `  openspec/specs/${cap.name}/spec.md\n    需求「${block.title}」（${declared.direction}:${declared.event}）缺少：${lacks.join('、')}`,
          );
        }
      }
    }

    expect(
      missing.length === 0
        ? ''
        : `ws-* 的事件需求必須寫出必填區塊：\n${missing.join('\n')}\nclient: 需 Payload / Ack / Failure Responses（無 ack 也要明示）；server: 需 Payload`,
    ).toBe('');
  });

  /**
   * 判定邏輯的合成輸入測試。
   *
   * 上一條規則在 M2 之前掃不到任何東西，**它是否正確完全靠這裡釘住**。
   * 給偽陰性的守則比沒有守則更危險——它會讓人停止人工檢查。
   */
  describe('WebSocket 事件判定（合成輸入）', () => {
    const requirement = (firstLine: string, body = ''): string =>
      `${firstLine}\n\n${body}`;

    it('A：client 事件三段齊全 → 通過', () => {
      const text = requirement(
        '`client:sendMessage`',
        '**Payload**：{}\n**Ack**：{}\n**Failure Responses**：無',
      );
      const declared = declaredWsEvent(text);
      expect(declared).toEqual({ direction: 'client', event: 'sendMessage' });
      const lacks = requiredWsSections('client').filter(
        (sec) => !usesSection(text, sec),
      );
      expect(lacks).toHaveLength(0);
    });

    it('B：client 事件缺 Ack → 抓出', () => {
      // 沒有 ack 的事件也必須明示「本事件無 ack」，省略與忘了寫長得一模一樣
      const text = requirement(
        '`client:typing`',
        '**Payload**：{}\n**Failure Responses**：無',
      );
      const lacks = requiredWsSections('client').filter(
        (sec) => !usesSection(text, sec),
      );
      expect(lacks).toEqual(['**Ack**']);
    });

    it('C：server 事件只需 Payload → 通過', () => {
      const text = requirement('`server:newMessage`', '**Payload**：{}');
      expect(declaredWsEvent(text)?.direction).toBe('server');
      const lacks = requiredWsSections('server').filter(
        (sec) => !usesSection(text, sec),
      );
      expect(lacks).toHaveLength(0);
    });

    it('D：事件標記不在第一行 → **不**視為事件需求', () => {
      // 「本事件的錯誤碼與 `client:sendMessage` 一致」這種說明不該被當成契約，
      // 否則會對一個根本不是契約的需求要求必填區塊
      const text = requirement(
        '本需求描述重試策略。',
        '錯誤碼與 `client:sendMessage` 一致。',
      );
      expect(declaredWsEvent(text)).toBeNull();
    });

    it('E：方向以外的前綴 → 不視為事件需求', () => {
      expect(declaredWsEvent('`admin:sendMessage`\n')).toBeNull();
      expect(declaredWsEvent('`GET /api/admin/members`\n')).toBeNull();
    });

    // 描述某個區塊的 spec 不該被自己的規則抓出來。
    // 本檔的規則就寫在 platform-engineering-guardrails 的 spec 裡，
    // 那份 spec 必然會提到「**Success Response**」這個字串——用 includes 判斷時，
    // 它會把描述規則的文件本身判為違規
    it('F：行文提及區塊名稱 → 不算使用該區塊', () => {
      const prose = '- **WHEN** `ws-*` 的 spec 出現 `**Success Response**`';
      expect(usesSection(prose, '**Success Response**')).toBe(false);

      const actual = '**Success Response** `200 OK`：\n\n```json\n{}\n```';
      expect(usesSection(actual, '**Success Response**')).toBe(true);
    });
  });
});
