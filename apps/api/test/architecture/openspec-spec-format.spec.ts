import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { API_ROOT } from './helpers';

/** repo 根目錄（本檔位於 apps/api/test/architecture） */
const REPO_ROOT = join(API_ROOT, '..', '..');
const SPECS_DIR = join(REPO_ROOT, 'openspec', 'specs');

/** 能力名稱的三類前綴，決定該 spec 的寫法 */
const PREFIXES = ['api-', 'ui-', 'platform-'] as const;

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
            )}\n前綴決定 spec 寫法：api-（後端 endpoint 契約）、ui-（前端畫面行為）、platform-（跨切面工程規則）`,
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
        if (!block.text.includes('**Success Response**'))
          lacks.push('Success Response');
        if (!block.text.includes('**Failure Responses**'))
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

  it('ui-* 與 platform-* 不應寫 API 請求／回應區塊', () => {
    const wrong = capabilities()
      .filter((c) => c.name.startsWith('ui-') || c.name.startsWith('platform-'))
      .filter((c) => c.body.includes('**Success Response**'))
      .map((c) => c.name);

    expect(
      wrong.length === 0
        ? ''
        : `以下非 api- 能力寫了 API 回應區塊：\n${wrong
            .map((n) => `  openspec/specs/${n}/spec.md`)
            .join(
              '\n',
            )}\nendpoint 契約屬於 api-* 能力；ui-* 描述畫面行為、platform-* 描述工程約束`,
    ).toBe('');
  });
});
